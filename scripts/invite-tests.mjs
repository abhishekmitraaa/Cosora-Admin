/**
 * admin-invite verification, against the real deployed function with real logins.
 *
 * Covers: authorization (non-super_admin must be refused SERVER-side), input
 * validation against the real enum, and the promote branch. The invite branch
 * (which sends a real email) is exercised separately by invite-send-test.mjs so
 * it is never triggered accidentally.
 *
 * Run: node scripts/invite-tests.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const PASSWORD = "TestPass123!";

async function signIn(email) {
  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return db;
}

/** A non-2xx surfaces as FunctionsHttpError with the body on error.context. */
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

const results = [];
let failures = 0;
const check = (name, pass, expected, actual, detail = "") => {
  if (!pass) failures++;
  results.push({ case: name, expected, actual, verdict: pass ? "PASS" : "*** FAIL ***", detail: String(detail).slice(0, 60) });
};

// ── 1. A support session must be refused BY THE FUNCTION, not the UI ────────
const support = await signIn("rlstest-support@cosora.test");
const r1 = await invoke(support, { email: "someone-new@example.com", admin_role: "support" });
check("support calling admin-invite", r1.error === "forbidden", "forbidden", r1.error ?? "ok", r1.detail);

// A support session must not be able to make itself a super_admin either.
const r1b = await invoke(support, { email: "rlstest-support@cosora.test", admin_role: "super_admin" });
check("support self-escalating", r1b.error === "forbidden", "forbidden", r1b.error ?? "ok", r1b.detail);
await support.auth.signOut();

// ── 2. super_admin: input validation ───────────────────────────────────────
const sa = await signIn("rlstest-superadmin@cosora.test");

const r2 = await invoke(sa, { email: "someone-new@example.com", admin_role: "root" });
check("bogus role rejected", r2.error === "bad_role", "bad_role", r2.error ?? "ok", r2.detail);

const r2b = await invoke(sa, { email: "someone-new@example.com", admin_role: "" });
check("empty role rejected", r2b.error === "bad_role", "bad_role", r2b.error ?? "ok", r2b.detail);

const r3 = await invoke(sa, { email: "not-an-email", admin_role: "support" });
check("bad email rejected", r3.error === "bad_email", "bad_email", r3.error ?? "ok", r3.detail);

// ── 3. Existing auth user -> promoted, no email, no duplicate ──────────────
const EXISTING = "demo-vendor@cosora.dev"; // real seeded user, non-admin
const r4 = await invoke(sa, { email: EXISTING, admin_role: "vendor_ops" });
check("existing user -> promoted", r4.outcome === "promoted", "promoted", r4.outcome ?? r4.error, r4.detail);
check("promote sends NO email", r4.emailSent === false, "emailSent:false", `emailSent:${r4.emailSent}`, "");

// Idempotency: promoting twice must not error or duplicate.
const r5 = await invoke(sa, { email: EXISTING, admin_role: "support" });
check("promote again (idempotent)", r5.outcome === "promoted", "promoted", r5.outcome ?? r5.error, r5.detail);

// Case-insensitivity: the same address in caps must still hit the promote branch.
const r6 = await invoke(sa, { email: EXISTING.toUpperCase(), admin_role: "support" });
check("uppercase email -> same user", r6.outcome === "promoted" && r6.userId === r4.userId, "promoted/same id", r6.outcome ?? r6.error, "");

await sa.auth.signOut();

console.table(results);
console.log(failures === 0 ? "\nALL CASES BEHAVED AS EXPECTED" : `\n${failures} CASE(S) FAILED`);
console.log(`\nPromoted user id: ${r4.userId ?? "(none)"} — revert with scripts/invite-tests-cleanup.sql`);
process.exit(failures === 0 ? 0 : 1);
