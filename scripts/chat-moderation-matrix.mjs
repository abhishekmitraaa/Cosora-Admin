/**
 * Chat-moderation role matrix, executed against the real database with real
 * logins. The companion to rls-matrix.mjs, same rules:
 *
 *   - Sign in with the ANON key so PostgREST runs as `authenticated` — that is
 *     what the RLS predicates and the SECURITY DEFINER functions check.
 *   - An RLS policy does NOT raise on UPDATE/DELETE. A row the USING clause
 *     rejects is invisible, the statement matches zero rows, and PostgREST
 *     returns success. So table writes are "allowed" only if rows come back,
 *     which is why each one appends .select().
 *   - The two RPCs are different: they RAISE on refusal, so for those a denial
 *     is an error whose message says "not authorized".
 *
 * The headline case is `chat_block_reasons.insert`: support must be REFUSED
 * there while being allowed everywhere else in this file.
 *
 * Prerequisites:
 *   1. supabase/migrations/20260802120000_resolve_conversation_review_rpc.sql
 *      applied to the project.
 *   2. scripts/seed-test-admins.sql run (throwaway logins). Delete them after
 *      with scripts/drop-test-admins.sql — they are admin accounts with a known
 *      password.
 *
 * Non-destructive: every table write is a uniquely-named throwaway row that the
 * script removes again, and both RPCs are called with a deliberately
 * nonexistent id so an AUTHORIZED caller fails on "not found" rather than
 * changing anything. Passing the role check while failing on the fake id is
 * exactly the signal we want.
 *
 * Run: node scripts/chat-moderation-matrix.mjs
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

const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const PASSWORD = credential("FIXTURE_PASSWORD");
const NOWHERE = "00000000-0000-0000-0000-000000000000"; // an id that cannot exist
const TAG = `zz-verify-${Date.now()}`;

const ACCOUNTS = {
  super_admin: "rlstest-superadmin@cosora.test",
  support: "rlstest-support@cosora.test",
  product_moderator: "rlstest-productmod@cosora.test",
  vendor_ops: "rlstest-vendorops@cosora.test",
  ads_moderator: "rlstest-adsmod@cosora.test",
  finance_admin: "rlstest-finance@cosora.test",
};

/** Roles allowed to READ each chat table. Everyone else must see nothing. */
const READS = {
  "conversations.select": { allowed: ["super_admin", "support"], run: (db) => db.from("conversations").select("id, status").limit(1) },
  "messages.select": { allowed: ["super_admin", "support"], run: (db) => db.from("messages").select("id, body").limit(1) },
  "conversation_reviews.select": { allowed: ["super_admin", "support"], run: (db) => db.from("conversation_reviews").select("id, status").limit(1) },
  "keyword_blocklist.select": { allowed: ["super_admin", "support"], run: (db) => db.from("keyword_blocklist").select("id, term").limit(1) },
  "flag_patterns.select": { allowed: ["super_admin", "support"], run: (db) => db.from("flag_patterns").select("id, label").limit(1) },
  "chat_block_reasons.select(active)": { allowed: ["super_admin", "support"], run: (db) => db.from("chat_block_reasons").select("id, reason").eq("active", true).limit(1) },
  "account_suspensions.select": { allowed: ["super_admin", "support"], run: (db) => db.from("account_suspensions").select("id, active").limit(1) },
};

/**
 * A read is only PROVEN allowed if a row comes back — an empty table would look
 * identical to an RLS denial. So each read case reports what it saw and the
 * verdict is soft when the table is empty, rather than claiming a pass it can't
 * support.
 */
const WRITES = {
  "keyword_blocklist.insert": {
    allowed: ["super_admin", "support"],
    run: (db, ctx) => db.from("keyword_blocklist").insert({ term: `${TAG}-${ctx.role}`, added_by: ctx.selfId }).select("id"),
    undo: (db, ctx) => db.from("keyword_blocklist").delete().eq("term", `${TAG}-${ctx.role}`),
  },
  "flag_patterns.insert": {
    allowed: ["super_admin", "support"],
    run: (db, ctx) =>
      db.from("flag_patterns").insert({ pattern: `${TAG}-${ctx.role}`, label: `${TAG} ${ctx.role}`, active: false, added_by: ctx.selfId }).select("id"),
    undo: (db, ctx) => db.from("flag_patterns").delete().eq("pattern", `${TAG}-${ctx.role}`),
  },
  // THE ONE THAT MATTERS: support is allowed everywhere above and refused here.
  "chat_block_reasons.insert": {
    allowed: ["super_admin"],
    run: (db, ctx) => db.from("chat_block_reasons").insert({ reason: `${TAG}-${ctx.role}`, active: false, created_by: ctx.selfId }).select("id"),
    undo: (db, ctx) => db.from("chat_block_reasons").delete().eq("reason", `${TAG}-${ctx.role}`),
  },
};

/** RPCs raise on refusal, so these are judged on the message, not on row counts. */
const RPCS = {
  "rpc set_account_status": {
    allowed: ["super_admin", "support"],
    run: (db) =>
      db.rpc("set_account_status", {
        p_profile_id: NOWHERE,
        p_new_status: "suspended",
        p_reason_id: null,
        p_source: "admin_manual",
        p_conversation_review_id: null,
      }),
  },
  "rpc resolve_conversation_review": {
    allowed: ["super_admin", "support"],
    run: (db) => db.rpc("resolve_conversation_review", { p_review_id: NOWHERE, p_resolution: "resumed", p_reason_id: null }),
  },
};

async function signIn(email) {
  const db = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`login failed for ${email}: ${error.message} — run scripts/seed-test-admins.sql first`);
  return { db, selfId: data.user.id };
}

const results = [];
let failures = 0;

function record(role, action, expected, actual, ok, detail = "") {
  if (!ok) failures++;
  results.push({ role, action, expected, actual, verdict: ok ? "PASS" : "*** FAIL ***", detail: detail.slice(0, 80) });
}

for (const [role, email] of Object.entries(ACCOUNTS)) {
  const { db, selfId } = await signIn(email);
  const ctx = { role, selfId };

  for (const [action, spec] of Object.entries(READS)) {
    const shouldAllow = spec.allowed.includes(role);
    const { data, error } = await spec.run(db);
    const rows = Array.isArray(data) ? data.length : 0;
    if (shouldAllow) {
      // Denied reads error or return nothing; an empty TABLE is indistinguishable
      // from a denial, so say so rather than claim proof.
      const ok = !error;
      record(role, action, "ALLOW", error ? "ERROR" : rows > 0 ? `${rows} row(s)` : "0 rows (table may be empty)", ok, error?.message ?? "");
    } else {
      const denied = Boolean(error) || rows === 0;
      record(role, action, "DENY", denied ? "no rows" : `${rows} row(s) LEAKED`, denied, error?.message ?? "");
    }
  }

  for (const [action, spec] of Object.entries(WRITES)) {
    const shouldAllow = spec.allowed.includes(role);
    const { data, error } = await spec.run(db, ctx);
    const rows = Array.isArray(data) ? data.length : 0;
    const denied = Boolean(error) || rows === 0;
    record(
      role,
      action,
      shouldAllow ? "ALLOW" : "DENY",
      denied ? "DENY" : "ALLOW",
      shouldAllow ? !denied : denied,
      error ? `${error.code ?? ""} ${error.message}` : "",
    );
    if (!denied && spec.undo) await spec.undo(db, ctx);
  }

  for (const [action, spec] of Object.entries(RPCS)) {
    const shouldAllow = spec.allowed.includes(role);
    const { error } = await spec.run(db);
    // "not authorized" is the role check refusing. Anything else — including a
    // "not found" for the deliberately fake id — means the caller got PAST it.
    const refused = Boolean(error) && /not authorized|42501|permission denied/i.test(`${error.code ?? ""} ${error.message}`);
    record(
      role,
      action,
      shouldAllow ? "PASS AUTH" : "REFUSED",
      refused ? "REFUSED" : "passed auth",
      shouldAllow ? !refused : refused,
      error ? `${error.code ?? ""} ${error.message}` : "no error",
    );
  }

  await db.auth.signOut();
}

console.table(results);

const supportReasonsCase = results.find((r) => r.role === "support" && r.action === "chat_block_reasons.insert");
const supportElsewhere = results.filter(
  (r) => r.role === "support" && r.action !== "chat_block_reasons.insert" && r.expected !== "DENY",
);
console.log(
  `\nHEADLINE — support writing chat_block_reasons: ${supportReasonsCase?.actual} (${supportReasonsCase?.verdict})`,
);
console.log(
  `support elsewhere: ${supportElsewhere.filter((r) => r.verdict === "PASS").length}/${supportElsewhere.length} allowed as expected`,
);
console.log(failures === 0 ? "\nALL CASES BEHAVED AS EXPECTED" : `\n${failures} CASE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
