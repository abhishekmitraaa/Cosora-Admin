/**
 * Verifies the THREE branches of admin-invite against the real deployed
 * function with real logins, plus authorization and input validation.
 *
 * The point of this iteration: branch on PASSWORD PRESENCE, not existence. An
 * existing OTP-only account (no password) must be treated like a new user — it
 * gets the set-password email — while an existing account that already has a
 * password is promoted silently.
 *
 * Real-email branches (2 = recovery, 1 = invite) are tolerant of the built-in
 * mailer's rate limit: the branch DECISION and the admin-grant side effect are
 * asserted strictly; actual delivery is confirmed separately from the auth logs.
 * Branch 2 runs first so, if only one email gets through, it's the new logic.
 *
 * Run: node scripts/invite-branches-test.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { credential } from "./lib/test-credentials.mjs";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const PASSWORD = credential("FIXTURE_PASSWORD");
const SA = "rlstest-superadmin@cosora.test";
const SUPPORT = "rlstest-support@cosora.test";
const HASPW = "rlstest-haspw@cosora.test"; // exists + password -> branch 3
const OTP = "abhishekmitra.work1+cosora-otp@gmail.com"; // exists + no password -> branch 2
const NEW = `abhishekmitra.work1+cosora-new-${Date.now()}@gmail.com`; // doesn't exist -> branch 1

async function signIn(email) {
  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return db;
}

async function invoke(db, body) {
  const { data, error } = await db.functions.invoke("admin-invite", { body });
  if (error?.context && typeof error.context.json === "function") {
    try {
      return await error.context.json();
    } catch {
      return { error: error.message };
    }
  }
  return data ?? { error: error?.message ?? "unknown" };
}

// Read is_admin straight from the DB with the service-less anon client is not
// possible (RLS), so check via the caller's own admin session (super_admin can
// read all profiles: profiles_select is `true`).
async function isAdmin(saDb, email) {
  const { data } = await saDb.from("profiles").select("is_admin, admin_role").eq("email", email).maybeSingle();
  return data ?? { is_admin: null, admin_role: null };
}

const results = [];
let failures = 0;
const check = (name, pass, detail = "") => {
  if (!pass) failures++;
  results.push({ case: name, verdict: pass ? "PASS" : "*** FAIL ***", detail: String(detail).slice(0, 70) });
};

// ── Authorization: support must be refused server-side ─────────────────────
const support = await signIn(SUPPORT);
const rSupport = await invoke(support, { email: NEW, admin_role: "support" });
check("support refused (forbidden)", rSupport.error === "forbidden", rSupport.error ?? "ok");
await support.auth.signOut();

const sa = await signIn(SA);

// ── Input validation ───────────────────────────────────────────────────────
check("bogus role rejected", (await invoke(sa, { email: NEW, admin_role: "root" })).error === "bad_role", "");
check("bad email rejected", (await invoke(sa, { email: "nope", admin_role: "support" })).error === "bad_email", "");

// ── Branch 3: existing WITH password -> promoted, NO email ─────────────────
const r3 = await invoke(sa, { email: HASPW, admin_role: "vendor_ops" });
check("branch3 outcome=promoted", r3.outcome === "promoted", r3.outcome ?? r3.error);
check("branch3 emailSent=false", r3.emailSent === false, `emailSent:${r3.emailSent}`);
check("branch3 hadPassword=true", r3.hadPassword === true, `hadPassword:${r3.hadPassword}`);
const haspwState = await isAdmin(sa, HASPW);
check("branch3 actually granted admin", haspwState.is_admin === true && haspwState.admin_role === "vendor_ops", JSON.stringify(haspwState));

// ── Branch 2: existing OTP-only (no password) -> invited (grant + email) ───
const r2 = await invoke(sa, { email: OTP, admin_role: "support", redirectTo: "http://localhost:5174/reset-password" });
check("branch2 outcome=invited", r2.outcome === "invited", r2.outcome ?? r2.error);
check("branch2 created=false (existing)", r2.created === false, `created:${r2.created}`);
check("branch2 hadPassword=false", r2.hadPassword === false, `hadPassword:${r2.hadPassword}`);
// email either sent, or rate-limited-with-warning — both are correct handling.
check(
  "branch2 email sent OR clearly warned",
  r2.emailSent === true || (r2.emailSent === false && Boolean(r2.warning)),
  r2.emailSent ? "sent" : `warned: ${r2.warning ?? "(none)"}`,
);
const otpState = await isAdmin(sa, OTP);
check("branch2 granted admin regardless of email", otpState.is_admin === true, JSON.stringify(otpState));

// ── Branch 1: brand-new email -> invited (create + email) ──────────────────
const r1 = await invoke(sa, { email: NEW, admin_role: "support", redirectTo: "http://localhost:5174/reset-password" });
if (r1.ok) {
  check("branch1 outcome=invited", r1.outcome === "invited", r1.outcome);
  check("branch1 created=true (new user)", r1.created === true, `created:${r1.created}`);
  check("branch1 emailSent=true", r1.emailSent === true, `emailSent:${r1.emailSent}`);
} else {
  // Rate-limited: acceptable. The invariant that MUST hold is no orphaned user.
  check("branch1 rate-limited handled (no success claimed)", r1.error === "invite_failed", r1.error ?? "");
  const orphan = await isAdmin(sa, NEW);
  check("branch1 no orphan user on failure", orphan.is_admin === null, JSON.stringify(orphan));
}

await sa.auth.signOut();

console.table(results);
console.log(failures === 0 ? "\nALL BRANCHES BEHAVED AS EXPECTED" : `\n${failures} CHECK(S) FAILED`);
console.log(`\nBranch-2 email result: emailSent=${r2.emailSent}${r2.warning ? " warning=" + r2.warning.slice(0, 60) : ""}`);
console.log(`Branch-1 result: ${r1.ok ? "invited (created " + r1.created + ", emailSent " + r1.emailSent + ")" : "error " + r1.error}`);
console.log(`New email used: ${NEW}`);
process.exit(failures === 0 ? 0 : 1);
