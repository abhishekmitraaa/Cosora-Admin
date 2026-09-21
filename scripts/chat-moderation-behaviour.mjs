/**
 * Chat-moderation BEHAVIOUR, executed against the real database with real
 * logins. The companion to chat-moderation-matrix.mjs, which answers "who is
 * allowed to"; this one answers "does the pipeline actually do what it says".
 *
 * Same rules as rls-matrix.mjs:
 *   - Sign in with the ANON key so PostgREST runs as `authenticated`.
 *   - An RLS denial on UPDATE/DELETE does NOT raise: it matches zero rows and
 *     PostgREST returns success. Those cases are judged on ROWS RETURNED.
 *   - An INSERT and an RPC DO raise, so those are judged on the error.
 *
 * The cases here are the regressions that would otherwise be invisible:
 * a blocklist that silently stops firing, a flag pattern that compiles and
 * never matches, a lock a participant can undo, a resume path that reports
 * success while changing nothing.
 *
 * Everything it creates is torn down in a finally block. Two exceptions, both
 * by design and both stated rather than hidden:
 *   - `account_suspensions` has no DELETE policy for any role, so ledger rows
 *     survive. This script does not create any.
 *   - `messages` has no DELETE policy either (deliberately — there is no
 *     redaction path), so the messages it sends stay in the test thread. It
 *     uses the two demo accounts' own conversation for exactly that reason.
 *
 * Since admin-schema separation Phase 4c (2026-09-21) the five moderation tables
 * (keyword_blocklist, flag_patterns, chat_block_reasons, conversation_reviews,
 * account_suspensions) live in the `admin` schema and no client role can reach
 * them over REST. Every read and write of them here goes through the same
 * SECURITY DEFINER RPCs the panel uses (admin_keyword_*, admin_flag_pattern_*,
 * admin_conversation_review_list, submit_report, resolve_conversation_review).
 *
 * Prerequisites: none. It uses the three demo accounts, so it runs as-is.
 *
 * Run: node scripts/chat-moderation-behaviour.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { demoAccount } from "./lib/test-credentials.mjs";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

const BUYER = demoAccount("buyer");
const VENDOR = demoAccount("vendor");
// demo-admin, which holds super_admin. The rlstest-* throwaway logins are
// deleted after each use (see README), so depending on them here would make
// this script fail for a reason that has nothing to do with what it tests.
// super_admin satisfies the same support/super_admin predicate every RPC and
// policy below checks; chat-moderation-matrix.mjs is the script that proves the
// support role specifically.
const SUPPORT = demoAccount("admin");

const TAG = `zz-behaviour-${Date.now()}`;

async function signIn({ email, password }) {
  const db = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, id: data.user.id };
}

const results = [];
let failures = 0;

function check(name, expected, actual, ok, detail = "") {
  if (!ok) failures++;
  results.push({
    check: name,
    expected,
    actual,
    verdict: ok ? "PASS" : "*** FAIL ***",
    detail: String(detail).slice(0, 56),
  });
}

const buyer = await signIn(BUYER);
const vendor = await signIn(VENDOR);
const support = await signIn(SUPPORT);

/** Canonical (sorted) pair — conversations has a user_a < user_b CHECK. */
const [ua, ub] = [buyer.id, vendor.id].sort();
const { data: conv, error: convError } = await buyer.db
  .from("conversations")
  .upsert({ user_a: ua, user_b: ub }, { onConflict: "user_a,user_b" })
  .select("id")
  .single();
if (convError) {
  console.error("could not open the test conversation:", convError.message);
  process.exit(1);
}
const CONV = conv.id;

/** Reopen the thread as support, between cases that lock it. */
async function unlock() {
  const { data: pending } = await support.db.rpc("admin_conversation_review_list", {
    p_status: "pending",
    p_conversation_id: CONV,
  });
  for (const r of pending ?? []) {
    await support.db.rpc("resolve_conversation_review", {
      p_review_id: r.id,
      p_verdict: "resumed",
      p_resume: true,
    });
  }
  const { data: c } = await support.db.from("conversations").select("status").eq("id", CONV).single();
  return c?.status;
}

let blocklistId = null;
let patternId = null;

try {
  await unlock();

  // ── 1. A blocklisted term is a HARD stop: no row, nothing queued ──────────
  {
    const term = `${TAG}-blocked-term`;
    const ins = await support.db.rpc("admin_keyword_add", { p_term: term });
    blocklistId = ins.data?.[0]?.id ?? null;

    const before = await support.db.rpc("admin_conversation_review_list", { p_conversation_id: CONV });

    const send = await buyer.db
      .from("messages")
      .insert({ conversation_id: CONV, sender_id: buyer.id, body: `hello ${term} there`, kind: "text" })
      .select("id");

    const rejected = Boolean(send.error);
    check(
      "1. blocklisted message is rejected",
      "raises",
      rejected ? `raises ${send.error.code}` : "*** ACCEPTED ***",
      rejected,
      send.error?.message ?? "",
    );

    const written = await buyer.db
      .from("messages")
      .select("id")
      .eq("conversation_id", CONV)
      .ilike("body", `%${term}%`);
    check(
      "1b. and NO message row was written",
      "0 rows",
      `${written.data?.length ?? 0} rows`,
      (written.data?.length ?? 0) === 0,
    );

    const after = await support.db.rpc("admin_conversation_review_list", { p_conversation_id: CONV });
    // The distinction that matters: a blocklist hit is NOT a moderation event.
    // Nothing is queued, which is exactly why the list must not be seeded blind.
    check(
      "1c. and nothing was queued for review",
      "no new review",
      `${(after.data?.length ?? 0) - (before.data?.length ?? 0)} new`,
      (after.data?.length ?? 0) === (before.data?.length ?? 0),
    );
  }

  // ── 2. A flag pattern is a SOFT stop: message kept, thread locked, queued ──
  {
    // \y not \b — \b is a BACKSPACE in POSIX ARE, so a \b pattern compiles and
    // never fires. That failure mode is what case 5b guards.
    const marker = `${TAG.replace(/-/g, "")}marker`;
    const ins = await support.db.rpc("admin_flag_pattern_add", {
      p_pattern: `\\y${marker}\\y`,
      p_label: `${TAG} probe`,
      p_active: true,
    });
    patternId = ins.data?.[0]?.id ?? null;

    const send = await buyer.db
      .from("messages")
      .insert({ conversation_id: CONV, sender_id: buyer.id, body: `please ${marker} now`, kind: "text" })
      .select("id");
    check(
      "2. flag-matching message IS written",
      "1 row",
      send.error ? `ERROR ${send.error.code}` : `${send.data?.length ?? 0} rows`,
      !send.error && (send.data?.length ?? 0) === 1,
      send.error?.message ?? "",
    );

    const { data: c } = await support.db.from("conversations").select("status").eq("id", CONV).single();
    check("2b. conversation flips to under_review", "under_review", c?.status ?? "?", c?.status === "under_review");

    const reviews = await support.db.rpc("admin_conversation_review_list", {
      p_status: "pending",
      p_conversation_id: CONV,
    });
    const mine = (reviews.data ?? []).filter((r) => r.matched_pattern_id === patternId);
    check(
      "2c. exactly one review row created",
      "1",
      String(mine.length),
      mine.length === 1,
    );

    // ── 3. A participant cannot unlock the thread they were locked out of ──
    // Judged on ROWS, not on the error: conversations_update's USING clause
    // lets a participant match the row, so the trigger is what refuses. If the
    // trigger were removed this would silently succeed.
    const undo = await buyer.db
      .from("conversations")
      .update({ status: "active" })
      .eq("id", CONV)
      .select("id");
    const stillLocked = await support.db
      .from("conversations")
      .select("status")
      .eq("id", CONV)
      .single();
    check(
      "3. non-admin cannot UPDATE conversations.status",
      "refused, still under_review",
      undo.error
        ? `refused ${undo.error.code}, ${stillLocked.data?.status}`
        : `${undo.data?.length ?? 0} rows, ${stillLocked.data?.status}`,
      stillLocked.data?.status === "under_review",
      undo.error?.message ?? "",
    );

    // ── 7. resolve: 'resumed' reopens; 'kept_locked' does not ──
    const r1 = mine[0]?.id;
    if (r1) {
      await support.db.rpc("resolve_conversation_review", {
        p_review_id: r1,
        p_verdict: "kept_locked",
        p_resume: true, // deliberately true: kept_locked must ignore it
      });
      const k = await support.db.from("conversations").select("status").eq("id", CONV).single();
      check(
        "7. kept_locked leaves it under_review (ignores p_resume)",
        "under_review",
        k.data?.status ?? "?",
        k.data?.status === "under_review",
      );
    }

    // A second pending review, filed the way the product files one: a
    // participant's report (conversation_reviews is not client-writable).
    const r2Reason = `${TAG} 7b`;
    await buyer.db.rpc("submit_report", { p_conversation_id: CONV, p_message_id: null, p_reported_reason: r2Reason });
    const r2 = await support.db.rpc("admin_conversation_review_list", { p_status: "pending", p_conversation_id: CONV });
    const r2Row = (r2.data ?? []).find((r) => r.reported_reason === r2Reason);
    if (r2Row) {
      await support.db.rpc("resolve_conversation_review", {
        p_review_id: r2Row.id,
        p_verdict: "resumed",
        p_resume: true,
      });
      const a = await support.db.from("conversations").select("status").eq("id", CONV).single();
      check(
        "7b. resumed flips it back to active",
        "active",
        a.data?.status ?? "?",
        a.data?.status === "active",
      );
    }
  }

  // ── 4. account_status is not client-writable, INCLUDING by its owner ───────
  {
    // profiles_update's USING is `id = auth.uid() OR is_admin()`, so the buyer
    // CAN match their own row — enforce_admin_grants is what refuses. Without
    // it a suspended user would simply un-suspend themselves.
    const self = await buyer.db
      .from("profiles")
      .update({ account_status: "suspended" })
      .eq("id", buyer.id)
      .select("id");
    const after = await buyer.db.from("profiles").select("account_status").eq("id", buyer.id).single();
    check(
      "4. owner cannot UPDATE their own account_status",
      "refused, still active",
      self.error ? `refused ${self.error.code}` : `${self.data?.length ?? 0} rows`,
      after.data?.account_status === "active",
      self.error?.message ?? "",
    );

    // And an admin cannot either — set_account_status() is the only door.
    const asAdmin = await support.db
      .from("profiles")
      .update({ account_status: "suspended" })
      .eq("id", buyer.id)
      .select("id");
    const after2 = await support.db
      .from("profiles")
      .select("account_status")
      .eq("id", buyer.id)
      .single();
    check(
      "4b. nor can an ADMIN, by direct UPDATE",
      "refused, still active",
      asAdmin.error ? `refused ${asAdmin.error.code}` : `${asAdmin.data?.length ?? 0} rows`,
      after2.data?.account_status === "active",
      asAdmin.error?.message ?? "",
    );
  }

  // ── 5. flag_patterns CHECK rejects a malformed regex ──────────────────────
  {
    const bad = await support.db.rpc("admin_flag_pattern_add", {
      p_pattern: "[unclosed",
      p_label: `${TAG} malformed`,
      p_active: false,
    });
    check(
      "5. invalid regex is refused by the CHECK",
      "raises",
      bad.error ? `raises ${bad.error.code}` : "*** ACCEPTED ***",
      Boolean(bad.error),
      bad.error?.message ?? "",
    );
    if (!bad.error && bad.data?.[0]) {
      await support.db.rpc("admin_flag_pattern_remove", { p_id: bad.data[0].id });
    }

    // 5b — the constraint's blind spot, asserted so nobody mistakes it for
    // full validation: a \b pattern COMPILES and is accepted, and then never
    // matches. This is why the editor probes with regex_probe() before saving.
    const probe = await support.db.rpc("regex_probe", {
      p_pattern: "[6-9]\\d{9}\\b",
      p_sample: "call 9876543210",
    });
    const compiledButDead = probe.data?.valid === true && probe.data?.matches === false;
    check(
      "5b. a \\b pattern compiles but never matches (why regex_probe exists)",
      "valid=true matches=false",
      probe.error ? `ERROR ${probe.error.code}` : `valid=${probe.data?.valid} matches=${probe.data?.matches}`,
      compiledButDead,
      probe.error?.message ?? "",
    );
  }

  // ── 6. submit_report locks the thread and stores the reason VERBATIM ──────
  {
    await unlock();
    const reason = "Scam, fraud or spam";
    const rep = await buyer.db.rpc("submit_report", {
      p_conversation_id: CONV,
      p_message_id: null,
      p_reported_reason: reason,
    });
    check("6. submit_report succeeds for a participant", "no error", rep.error ? `ERROR ${rep.error.code}` : "no error", !rep.error, rep.error?.message ?? "");

    const c = await support.db.from("conversations").select("status").eq("id", CONV).single();
    check("6b. it locks the conversation", "under_review", c.data?.status ?? "?", c.data?.status === "under_review");

    const rows = await support.db.rpc("admin_conversation_review_list", {
      p_status: "pending",
      p_conversation_id: CONV,
    });
    const stored = rows.data?.find((r) => r.source === "user_report" && r.reported_reason === reason);
    check(
      "6c. reported_reason is stored verbatim",
      JSON.stringify(reason),
      JSON.stringify(stored?.reported_reason ?? null),
      Boolean(stored),
    );
    // reported_reason (what the reporter claimed) and reason_id (the admin's
    // verdict) are different facts. A report must not pre-fill a verdict.
    check(
      "6d. and reason_id is left null — a report is not a verdict",
      "null",
      String(stored?.reason_id ?? "null"),
      (stored?.reason_id ?? null) === null,
    );
  }
} finally {
  // Teardown. Deactivate before deleting the pattern so nothing can match while
  // the rest of the teardown runs.
  if (patternId) {
    await support.db.rpc("admin_flag_pattern_update", { p_id: patternId, p_active: false });
    await support.db.rpc("admin_flag_pattern_remove", { p_id: patternId });
  }
  if (blocklistId) await support.db.rpc("admin_keyword_remove", { p_id: blocklistId });

  const finalStatus = await unlock();
  // `messages` has NO delete policy, deliberately — there is no redaction path
  // in this product. The probe messages stay in the demo pair's thread.
  console.log(`\nteardown: conversation left '${finalStatus}'; probe messages remain (messages has no DELETE policy, by design).`);

  await buyer.db.auth.signOut();
  await vendor.db.auth.signOut();
  await support.db.auth.signOut();
}

console.table(results);
console.log(
  failures === 0
    ? "\nALL BEHAVIOUR CHECKS PASSED"
    : `\n${failures} CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
