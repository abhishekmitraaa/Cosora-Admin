/**
 * Chat + chat-moderation pipeline — DB layer, cases T1–T13.
 *
 * Extends the rls-matrix.mjs family rather than replacing it. Same conventions,
 * and they are not stylistic:
 *
 *   - Sign in with the ANON key so PostgREST runs as `authenticated`. That is
 *     what the RLS predicates and the SECURITY DEFINER role checks actually see.
 *   - An RLS denial on UPDATE/DELETE does NOT raise. The row is invisible, the
 *     statement matches zero rows, and PostgREST returns success. So every
 *     table write is judged on ROWS RETURNED via `.select()`, never on
 *     error-presence.
 *   - An INSERT (WITH CHECK) and an RPC both DO raise, so those are judged on
 *     the error.
 *
 * BIDIRECTIONAL. Every buyer→vendor case has a vendor→buyer twin, and the
 * runner diffs the pair. An asymmetry is a FAIL unless it is one of the three
 * documented ones (see ASYMMETRIES below).
 *
 * FIXTURES ONLY. Never demo-buyer/demo-vendor: `messages` has no delete policy
 * for any role, so every probe message is permanent, and a crashed run would
 * leave a demo account suspended. Run scripts/seed-chat-fixtures.sql first and
 * scripts/drop-chat-fixtures.sql after.
 *
 * Run: node scripts/chat-pipeline-matrix.mjs
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

/** Fixture ids — mirrors rls-matrix.mjs's F convention, extended for chat. */
const F = {
  buyerA: "cf000001-0000-0000-0000-000000000001",
  buyerB: "cf000002-0000-0000-0000-000000000002",
  vendorA: "cf000003-0000-0000-0000-000000000003",
  vendorB: "cf000004-0000-0000-0000-000000000004",
  liveProduct: "cf00000a-0000-0000-0000-00000000000a",
  activeAd: "cf00000b-0000-0000-0000-00000000000b",
  existingReview: "cf00000c-0000-0000-0000-00000000000c",
  /** Scratch conversation, created and torn down per run. */
  conversation: null,
};

const PASSWORD = credential("FIXTURE_PASSWORD");
const LOGINS = {
  buyerA: "chatfx-buyer-a@cosora.test",
  buyerB: "chatfx-buyer-b@cosora.test",
  vendorA: "chatfx-vendor-a@cosora.test",
  vendorB: "chatfx-vendor-b@cosora.test",
  support: "rlstest-support@cosora.test",
  super_admin: "rlstest-superadmin@cosora.test",
  ads_moderator: "rlstest-adsmod@cosora.test",
  product_moderator: "rlstest-productmod@cosora.test",
  vendor_ops: "rlstest-vendorops@cosora.test",
  finance_admin: "rlstest-finance@cosora.test",
};

/**
 * Alphabetic ONLY, deliberately.
 *
 * The first version used `chatfx-${Date.now()}`. A 13-digit timestamp contains a
 * 10-digit run starting 6-9, which is exactly what the seeded "Indian mobile
 * number" pattern matches. Verified against the live engine:
 *   select 'chatfx-1788604604310' ~* '(\+?91[\-\s]?)?[6-9]\d{9}\y'  -->  true
 * So every probe body was flagged by the PHONE pattern before the pattern under
 * test could match, and first-match-wins filed the review against the wrong id.
 * A test fixture must not be matchable by the rules it is testing.
 */
const TAG = `chatfx-${Math.random().toString(36).slice(2, 8).replace(/[0-9]/g, "x")}`;

async function signIn(email) {
  const db = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`login failed for ${email}: ${error.message} — run scripts/seed-chat-fixtures.sql and seed-test-admins.sql first`);
  return { db, id: data.user.id, email };
}

const S = {};
for (const [k, email] of Object.entries(LOGINS)) S[k] = await signIn(email);

const results = [];
let failures = 0;

function rec(id, direction, layer, steps, expected, actual, ok, severity = "", evidence = "") {
  if (!ok) failures++;
  results.push({
    ID: id,
    Dir: direction,
    Layer: layer,
    Steps: steps,
    Expected: expected,
    Actual: actual,
    Status: ok ? "PASS" : "FAIL",
    Severity: ok ? "" : severity,
    Evidence: String(evidence).slice(0, 120),
  });
  return ok;
}

/** Canonical (sorted) pair — conversations carries a user_a < user_b CHECK. */
function pair(x, y) {
  return [x, y].sort();
}

async function openConversation(actor, otherId) {
  const [a, b] = pair(actor.id, otherId);
  const { data, error } = await actor.db
    .from("conversations")
    .upsert({ user_a: a, user_b: b }, { onConflict: "user_a,user_b" })
    .select("id, status, user_a, user_b")
    .single();
  if (error) throw new Error(`openConversation: ${error.message}`);
  return data;
}

/** Reopen and clear the queue for a conversation, as support. */
async function unlock(convId) {
  const { data: pending } = await S.support.db
    .from("conversation_reviews")
    .select("id")
    .eq("conversation_id", convId)
    .eq("status", "pending");
  for (const r of pending ?? []) {
    await S.support.db.rpc("resolve_conversation_review", {
      p_review_id: r.id,
      p_verdict: "resumed",
      p_resume: true,
    });
  }
  const { data } = await S.support.db.from("conversations").select("status").eq("id", convId).single();
  return data?.status;
}

async function statusOf(convId) {
  const { data } = await S.support.db.from("conversations").select("status").eq("id", convId).single();
  return data?.status;
}

async function accountStatus(id) {
  const { data } = await S.support.db.from("profiles").select("account_status").eq("id", id).single();
  return data?.account_status;
}

async function setStatus(profileId, status, opts = {}) {
  // Guard rail: this suite must never suspend anything but a fixture.
  if (!profileId.startsWith("cf00000")) {
    throw new Error(`REFUSING to set_account_status on non-fixture ${profileId}`);
  }
  const { error } = await S.support.db.rpc("set_account_status", {
    p_profile_id: profileId,
    p_new_status: status,
    p_reason_id: opts.reasonId ?? null,
    p_source: opts.source ?? "admin_manual",
    ...(opts.reviewId ? { p_conversation_review_id: opts.reviewId } : {}),
  });
  if (error) throw new Error(`set_account_status(${status}): ${error.message}`);
}

let CONV_AB = null; // buyerA <-> vendorA
let CONV_BA = null; // buyerB <-> vendorB  (the mirror pair)

try {
  // ══════════════════════════════════════════════════════════════════════
  // T1 — core message pipeline
  // ══════════════════════════════════════════════════════════════════════
  {
    // 1.1 buyer→vendor opens the pair
    const c1 = await openConversation(S.buyerA, F.vendorA);
    CONV_AB = c1.id;
    F.conversation = c1.id;
    const [ea, eb] = pair(S.buyerA.id, F.vendorA);
    rec("T1.1", "buyer→vendor", "DB",
      "buyerA upserts a fresh conversation with vendorA",
      "one row, canonical user_a < user_b",
      `user_a<user_b=${c1.user_a < c1.user_b}, matches sorted=${c1.user_a === ea && c1.user_b === eb}`,
      c1.user_a < c1.user_b && c1.user_a === ea && c1.user_b === eb,
      "High", `id=${c1.id}`);

    // 1.2 vendor→buyer opens the SAME pair — must not create a second row
    const c2 = await openConversation(S.vendorA, F.buyerA);
    const { data: all } = await S.support.db
      .from("conversations").select("id").eq("user_a", ea).eq("user_b", eb);
    rec("T1.2", "vendor→buyer", "DB",
      "vendorA upserts the same pair from the other side",
      "still exactly 1 conversation row, same id",
      `rows=${all?.length}, sameId=${c2.id === c1.id}`,
      all?.length === 1 && c2.id === c1.id,
      "High", `ids=${(all ?? []).map((r) => r.id).join(",")}`);

    // The mirror pair, used for the bidirectional twins below.
    CONV_BA = (await openConversation(S.buyerB, F.vendorB)).id;

    // 1.5 bump_conversation() — both directions
    for (const [id, dir, sender, conv] of [
      ["T1.5a", "buyer→vendor", S.buyerA, CONV_AB],
      ["T1.5b", "vendor→buyer", S.vendorB, CONV_BA],
    ]) {
      const body = `${TAG} bump ${dir}`;
      const before = await S.support.db.from("conversations").select("last_message_at").eq("id", conv).single();
      await sleep(1100);
      const ins = await sender.db.from("messages")
        .insert({ conversation_id: conv, sender_id: sender.id, body, kind: "text" }).select("id");
      const after = await S.support.db
        .from("conversations").select("last_message, last_message_at").eq("id", conv).single();
      const bumped = after.data?.last_message === body &&
        new Date(after.data.last_message_at) > new Date(before.data.last_message_at);
      rec(id, dir, "DB",
        "send a message; read conversations.last_message/_at",
        "last_message == body and last_message_at advances",
        bumped ? "bumped correctly" : `last_message=${JSON.stringify(after.data?.last_message)}`,
        !ins.error && bumped, "Medium",
        `last_message_at ${before.data?.last_message_at} -> ${after.data?.last_message_at}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // T2 — keyword blocklist (hard stop)
  // ══════════════════════════════════════════════════════════════════════
  {
    // Start from a known-unlocked thread. Without this, a thread left locked by a
    // previous run makes an RLS refusal look exactly like a blocklist hit — both
    // are 42501 — which is why T2.4/2.5/2.7 first reported false failures.
    await unlock(CONV_AB);
    await unlock(CONV_BA);

    const term = `${TAG}-zzblocked`;
    const wild = `${TAG}-100%off`; // contains a SQL LIKE wildcard on purpose
    await S.support.db.from("keyword_blocklist")
      .insert([{ term, added_by: S.support.id }, { term: wild, added_by: S.support.id }]);

    for (const [id, dir, sender, conv] of [
      ["T2.1", "buyer→vendor", S.buyerA, CONV_AB],
      ["T2.2", "vendor→buyer", S.vendorB, CONV_BA],
    ]) {
      const before = await countMessages(conv);
      const send = await sender.db.from("messages")
        .insert({ conversation_id: conv, sender_id: sender.id, body: `hello ${term} there`, kind: "text" })
        .select("id");
      const after = await countMessages(conv);
      rec(id, dir, "DB",
        "send a message containing a blocklisted term",
        "raises, and message count is unchanged",
        send.error ? `raised ${send.error.code}, count ${before}→${after}` : "*** ACCEPTED ***",
        Boolean(send.error) && before === after, "Critical",
        send.error?.message ?? "");
    }

    // 2.3 case-insensitivity
    {
      const send = await S.buyerA.db.from("messages")
        .insert({ conversation_id: CONV_AB, sender_id: S.buyerA.id, body: `HELLO ${term.toUpperCase()} THERE`, kind: "text" })
        .select("id");
      rec("T2.3", "buyer→vendor", "DB", "same term, upper-cased",
        "still blocked", send.error ? `raised ${send.error.code}` : "*** ACCEPTED ***",
        Boolean(send.error), "High", send.error?.message ?? "");
    }

    // 2.4 substring-not-wildcard: the term contains '%', which under LIKE would
    // match nearly anything. strpos() is used precisely so it does not.
    {
      const shouldBlock = await S.buyerA.db.from("messages")
        .insert({ conversation_id: CONV_AB, sender_id: S.buyerA.id, body: `deal ${wild} today`, kind: "text" })
        .select("id");
      const shouldPass = await S.buyerA.db.from("messages")
        .insert({ conversation_id: CONV_AB, sender_id: S.buyerA.id, body: `${TAG}-100 pieces off the roll`, kind: "text" })
        .select("id");
      const ok = Boolean(shouldBlock.error) && !shouldPass.error;
      rec("T2.4", "buyer→vendor", "DB",
        `blocklist term contains '%'; send literal match, then a string that only matches if '%' is a wildcard`,
        "literal blocked, wildcard-interpretation NOT blocked",
        `literal=${shouldBlock.error ? "blocked" : "PASSED"}, wildcardish=${shouldPass.error ? "*** BLOCKED ***" : "sent"}`,
        ok, "High", shouldBlock.error?.message ?? shouldPass.error?.message ?? "");
    }

    // 2.5 empty term must not block everything
    {
      const empty = await S.support.db.from("keyword_blocklist")
        .insert({ term: "", added_by: S.support.id }).select("id");
      let ok, actual;
      if (empty.error) {
        ok = true;
        actual = `empty term rejected at insert (${empty.error.code})`;
      } else {
        const send = await S.buyerA.db.from("messages")
          .insert({ conversation_id: CONV_AB, sender_id: S.buyerA.id, body: `${TAG} ordinary message`, kind: "text" })
          .select("id");
        ok = !send.error;
        actual = send.error ? `*** EVERY MESSAGE BLOCKED (${send.error.code}) ***` : "ordinary message still sends";
        await S.support.db.from("keyword_blocklist").delete().eq("id", empty.data[0].id);
      }
      rec("T2.5", "n/a", "DB", "insert an empty-string blocklist row, then send an ordinary message",
        "empty term does not block everything", actual, ok, "Critical", "");
    }

    // 2.6 a blocklist hit is NOT a moderation event.
    //
    // Asserted as a DELTA across one blocklisted send, not as an absolute count.
    // conversation_reviews has no DELETE policy for any client role, so rows from
    // earlier runs cannot be cleared from here; an absolute count would measure
    // history rather than this test.
    {
      await unlock(CONV_AB);
      const before = await reviewIds(CONV_AB);
      const stBefore = await statusOf(CONV_AB);
      const t = `${TAG}-zznotamodevent`;
      await S.support.db.from("keyword_blocklist").insert({ term: t, added_by: S.support.id });
      await S.buyerA.db.from("messages")
        .insert({ conversation_id: CONV_AB, sender_id: S.buyerA.id, body: `x ${t} y`, kind: "text" }).select("id");
      await S.support.db.from("keyword_blocklist").delete().eq("term", t);
      const after = await reviewIds(CONV_AB);
      const stAfter = await statusOf(CONV_AB);
      const added = after.filter((id) => !before.includes(id));
      rec("T2.6", "n/a", "DB", "send one blocklisted message; diff conversation_reviews and status around it",
        "0 NEW review rows, status unchanged (a hard stop is not a moderation event)",
        `newReviews=${added.length}, status ${stBefore} -> ${stAfter}`,
        added.length === 0 && stBefore === stAfter && stAfter === "active", "High", "");
    }

    // 2.7 delete the term, same message now sends
    {
      await S.support.db.from("keyword_blocklist").delete().eq("term", term);
      await S.support.db.from("keyword_blocklist").delete().eq("term", wild);
      const send = await S.buyerA.db.from("messages")
        .insert({ conversation_id: CONV_AB, sender_id: S.buyerA.id, body: `hello ${term} there`, kind: "text" })
        .select("id");
      rec("T2.7", "buyer→vendor", "DB", "delete the throwaway term, resend the same body",
        "sends cleanly", send.error ? `*** still blocked ${send.error.code} ***` : "sent",
        !send.error, "High", send.error?.message ?? "");
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // T3 — regex auto-flag (soft stop), against the 3 live seeded patterns
  // ══════════════════════════════════════════════════════════════════════
  {
    const { data: patterns } = await S.support.db
      .from("flag_patterns").select("id, label, pattern").eq("active", true).order("label");

    const PROBES = {
      "Indian mobile number": "please ring 9876543210",
      "Email address": "mail me at probe.person@example.com",
      "Off-platform meeting request": "lets move this to WhatsApp",
    };

    let i = 0;
    for (const p of patterns ?? []) {
      i += 1;
      const probe = PROBES[p.label];
      if (!probe) continue;

      for (const [suffix, dir, sender, conv] of [
        ["a", "buyer→vendor", S.buyerA, CONV_AB],
        ["b", "vendor→buyer", S.vendorB, CONV_BA],
      ]) {
        await unlock(conv);
        const before = await countMessages(conv);
        const idsBefore = await reviewIds(conv);
        const send = await sender.db.from("messages")
          .insert({ conversation_id: conv, sender_id: sender.id, body: `${TAG} ${probe}`, kind: "text" })
          .select("id");
        const after = await countMessages(conv);
        const st = await statusOf(conv);
        const { data: revs } = await S.support.db
          .from("conversation_reviews")
          .select("id, source, matched_pattern_id")
          .eq("conversation_id", conv);
        // Only rows THIS send created, and only the pattern under test.
        const mine = (revs ?? []).filter((r) => !idsBefore.includes(r.id) && r.matched_pattern_id === p.id);
        const ok = !send.error && after === before + 1 && st === "under_review" &&
          mine.length === 1 && mine[0].source === "regex_flag";
        rec(`T3.${i}-${suffix}`, dir, "DB",
          `send "${probe}" (matches "${p.label}")`,
          "message STORED, status→under_review, exactly 1 regex_flag review with the right pattern id",
          `stored=${after === before + 1}, status=${st}, reviews=${mine.length}, source=${mine[0]?.source ?? "-"}`,
          ok, "Critical", `pattern=${p.pattern}`);
        await unlock(conv);
      }
    }

    // 3.x-d first-match-wins: one message matching TWO patterns
    {
      await unlock(CONV_AB);
      const idsBefore = await reviewIds(CONV_AB);
      const send = await S.buyerA.db.from("messages")
        .insert({ conversation_id: CONV_AB, sender_id: S.buyerA.id,
                  body: `${TAG} ring 9876543210 or mail probe.person@example.com`, kind: "text" })
        .select("id");
      const idsAfter = await reviewIds(CONV_AB);
      const added = idsAfter.filter((id) => !idsBefore.includes(id));
      rec("T3.4-d", "buyer→vendor", "DB",
        "one message matching BOTH the phone and email patterns",
        "exactly 1 NEW review row, not 2 (first match wins)",
        `newReviews=${added.length}`,
        !send.error && added.length === 1, "High", "");
      await unlock(CONV_AB);
    }

    // invalid regex rejected by the CHECK before it can ever reach the trigger
    {
      const bad = await S.support.db.from("flag_patterns")
        .insert({ pattern: "[unclosed", label: `${TAG} malformed`, active: false, added_by: S.support.id })
        .select("id");
      rec("T3.5", "n/a", "DB", "insert a syntactically invalid regex into flag_patterns",
        "rejected by flag_patterns_pattern_valid",
        bad.error ? `raised ${bad.error.code}` : "*** ACCEPTED ***",
        Boolean(bad.error), "Critical", bad.error?.message ?? "");
      if (!bad.error) await S.support.db.from("flag_patterns").delete().eq("id", bad.data[0].id);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // T4 — participant report
  // ══════════════════════════════════════════════════════════════════════
  {
    for (const [id, dir, reporter, conv] of [
      ["T4.1", "buyer→vendor", S.buyerA, CONV_AB],
      ["T4.2", "vendor→buyer", S.vendorB, CONV_BA],
    ]) {
      await unlock(conv);
      const reason = "Scam, fraud or spam";
      const rep = await reporter.db.rpc("submit_report", {
        p_conversation_id: conv, p_message_id: null, p_reported_reason: reason,
      });
      const st = await statusOf(conv);
      const { data: revs } = await S.support.db
        .from("conversation_reviews").select("id, source, reported_reason, reason_id")
        .eq("conversation_id", conv).eq("status", "pending");
      const row = (revs ?? []).find((r) => r.reported_reason === reason);
      const ok = !rep.error && st === "under_review" && Boolean(row) &&
        row.source === "user_report" && row.reason_id === null;
      rec(id, dir, "DB",
        "submit_report with a reason string",
        "locks; user_report row; reported_reason VERBATIM; reason_id stays null",
        `status=${st}, verbatim=${row?.reported_reason === reason}, reason_id=${row?.reason_id ?? "null"}`,
        ok, "Critical", JSON.stringify(row?.reported_reason ?? null));
    }

    // 4.3 report an ALREADY-LOCKED conversation — behaviour is not assumed
    {
      const before = await S.support.db
        .from("conversation_reviews").select("id").eq("conversation_id", CONV_AB);
      const again = await S.buyerA.db.rpc("submit_report", {
        p_conversation_id: CONV_AB, p_message_id: null, p_reported_reason: "Second report while locked",
      });
      const after = await S.support.db
        .from("conversation_reviews").select("id").eq("conversation_id", CONV_AB);
      const added = (after.data?.length ?? 0) - (before.data?.length ?? 0);
      // Documenting real behaviour, not asserting a guess. Either is defensible;
      // silently doing nothing while reporting success would not be.
      rec("T4.3", "buyer→vendor", "DB",
        "report a conversation that is already under_review",
        "documented: either a second row is filed, or it raises — not a silent no-op",
        again.error ? `raised ${again.error.code}` : `succeeded, filed ${added} extra review row(s)`,
        again.error ? true : added === 1, "Medium",
        again.error?.message ?? `reviews ${before.data?.length} -> ${after.data?.length}`);
    }
    await unlock(CONV_AB);
    await unlock(CONV_BA);
  }

  // ══════════════════════════════════════════════════════════════════════
  // T5.3 — the real gate: direct API send while locked
  // ══════════════════════════════════════════════════════════════════════
  {
    await S.buyerA.db.rpc("submit_report", {
      p_conversation_id: CONV_AB, p_message_id: null, p_reported_reason: `${TAG} lock for T5.3`,
    });
    for (const [id, dir, sender] of [
      ["T5.3a", "buyer→vendor", S.buyerA],
      ["T5.3b", "vendor→buyer", S.vendorA],
    ]) {
      const before = await countMessages(CONV_AB);
      const send = await sender.db.from("messages")
        .insert({ conversation_id: CONV_AB, sender_id: sender.id, body: `${TAG} bypass attempt`, kind: "text" })
        .select("id");
      const after = await countMessages(CONV_AB);
      rec(id, dir, "DB",
        "POST a message straight to PostgREST while the thread is locked (no UI)",
        "RLS refuses; no row written",
        send.error ? `raised ${send.error.code}, count ${before}→${after}` : "*** WRITTEN ***",
        Boolean(send.error) && before === after, "Critical", send.error?.message ?? "");
    }
    await unlock(CONV_AB);
  }

  // ══════════════════════════════════════════════════════════════════════
  // T6 — admin review queue / resolution (DB half)
  // ══════════════════════════════════════════════════════════════════════
  {
    // 6.3 resume actually resumes
    await S.buyerA.db.rpc("submit_report", {
      p_conversation_id: CONV_AB, p_message_id: null, p_reported_reason: `${TAG} for resume`,
    });
    const { data: r1 } = await S.support.db
      .from("conversation_reviews").select("id").eq("conversation_id", CONV_AB).eq("status", "pending").single();
    await S.support.db.rpc("resolve_conversation_review", {
      p_review_id: r1.id, p_verdict: "resumed", p_resume: true,
    });
    rec("T6.3", "n/a", "DB",
      "resolve_conversation_review(verdict=resumed, p_resume=true)",
      "conversation returns to active",
      await statusOf(CONV_AB), (await statusOf(CONV_AB)) === "active", "Critical", `review=${r1.id}`);

    // 6.3b the trap: p_resume omitted entirely -> function default is FALSE
    await S.buyerA.db.rpc("submit_report", {
      p_conversation_id: CONV_AB, p_message_id: null, p_reported_reason: `${TAG} default probe`,
    });
    const { data: r2 } = await S.support.db
      .from("conversation_reviews").select("id").eq("conversation_id", CONV_AB).eq("status", "pending").single();
    await S.support.db.rpc("resolve_conversation_review", { p_review_id: r2.id, p_verdict: "resumed" });
    const afterDefault = await statusOf(CONV_AB);
    rec("T6.3b", "n/a", "DB",
      "resolve with verdict=resumed but p_resume OMITTED (function default)",
      "documented: default is FALSE, so the thread stays locked — a UI that omits it silently fails to resume",
      `status=${afterDefault}`, afterDefault === "under_review", "High",
      "confirms the default; the UI must pass p_resume explicitly");
    await unlock(CONV_AB);

    // 6.5 keep_locked
    await S.buyerA.db.rpc("submit_report", {
      p_conversation_id: CONV_AB, p_message_id: null, p_reported_reason: `${TAG} keep locked`,
    });
    const { data: r3 } = await S.support.db
      .from("conversation_reviews").select("id").eq("conversation_id", CONV_AB).eq("status", "pending").single();
    await S.support.db.rpc("resolve_conversation_review", {
      p_review_id: r3.id, p_verdict: "kept_locked", p_resume: true,
    });
    const keptStatus = await statusOf(CONV_AB);
    const { data: r3after } = await S.support.db
      .from("conversation_reviews").select("status").eq("id", r3.id).single();
    rec("T6.5", "n/a", "DB",
      "resolve kept_locked, deliberately passing p_resume=true",
      "verdict recorded, conversation STILL under_review (kept_locked ignores p_resume)",
      `verdict=${r3after?.status}, status=${keptStatus}`,
      r3after?.status === "kept_locked" && keptStatus === "under_review", "Critical", "");

    // 6.6 double-resolve
    const dbl = await S.support.db.rpc("resolve_conversation_review", {
      p_review_id: r3.id, p_verdict: "resumed", p_resume: true,
    });
    rec("T6.6", "n/a", "DB",
      "resolve the same review a second time",
      "raises P0002, first decision intact",
      dbl.error ? `raised ${dbl.error.code}` : "*** ACCEPTED ***",
      dbl.error?.code === "P0002", "Critical", dbl.error?.message ?? "");
    await unlock(CONV_AB);

    // 6.7 notifications written on resolution, without disclosure
    {
      await S.buyerA.db.rpc("submit_report", {
        p_conversation_id: CONV_AB, p_message_id: null, p_reported_reason: `${TAG} notif probe`,
      });
      await S.support.db.from("notifications").delete().eq("conversation_id", CONV_AB); // ignore: admin can't, see below
      const { data: r4 } = await S.support.db
        .from("conversation_reviews").select("id").eq("conversation_id", CONV_AB).eq("status", "pending").single();
      await S.support.db.rpc("resolve_conversation_review", {
        p_review_id: r4.id, p_verdict: "resumed", p_resume: true,
      });
      const { data: notifs } = await S.support.db
        .from("notifications").select("profile_id, kind, title, body").eq("conversation_id", CONV_AB);
      // support can't SELECT other people's notifications (RLS), so read as the
      // participants themselves.
      const bn = await S.buyerA.db.from("notifications").select("kind,title,body").eq("conversation_id", CONV_AB);
      const vn = await S.vendorA.db.from("notifications").select("kind,title,body").eq("conversation_id", CONV_AB);
      const both = (bn.data?.length ?? 0) > 0 && (vn.data?.length ?? 0) > 0;
      const text = [...(bn.data ?? []), ...(vn.data ?? [])].map((n) => `${n.title} ${n.body}`).join(" ").toLowerCase();
      const leaks = /report|resumed after|verdict|buyer_blocked|vendor_blocked|pattern|reason/.test(text);
      rec("T6.7", "n/a", "DB",
        "resolve a review; read the notifications each participant can see",
        "both participants notified; copy names no reporter, verdict, pattern or reason",
        `buyer=${bn.data?.length ?? 0}, vendor=${vn.data?.length ?? 0}, leaks=${leaks}`,
        both && !leaks, "Critical",
        JSON.stringify((bn.data ?? [])[0] ?? null));
    }

    // 6.8 admin_flags on a conversation
    {
      const f = await S.support.db.from("admin_flags")
        .insert({ entity_type: "conversation", entity_id: CONV_AB, note: `${TAG} support note`, author_id: S.support.id })
        .select("id, entity_type, entity_id");
      rec("T6.8", "n/a", "DB",
        "support adds an admin_flags note scoped to entity_type=conversation",
        "accepted, scoped to the right entity",
        f.error ? `raised ${f.error.code}` : `entity_type=${f.data[0].entity_type}`,
        !f.error && f.data?.[0]?.entity_type === "conversation" && f.data[0].entity_id === CONV_AB,
        "Medium", f.error?.message ?? "");
      if (!f.error) await S.support.db.from("admin_flags").delete().eq("id", f.data[0].id);
    }

    // 6.9 role gate — the four non-chat roles must be refused at the DB
    for (const role of ["product_moderator", "vendor_ops", "ads_moderator", "finance_admin"]) {
      const readRes = await S[role].db.from("conversation_reviews").select("id").limit(1);
      const rpcRes = await S[role].db.rpc("resolve_conversation_review", {
        p_review_id: "00000000-0000-0000-0000-000000000000", p_verdict: "resumed", p_resume: true,
      });
      const readDenied = Boolean(readRes.error) || (readRes.data?.length ?? 0) === 0;
      const rpcDenied = Boolean(rpcRes.error) &&
        /not authorized|42501|permission denied/i.test(`${rpcRes.error.code} ${rpcRes.error.message}`);
      rec(`T6.9-${role}`, "n/a", "DB",
        `as ${role}: read conversation_reviews, call resolve_conversation_review`,
        "both refused",
        `read=${readDenied ? "denied" : "*** LEAKED ***"}, rpc=${rpcDenied ? "refused" : "*** PASSED AUTH ***"}`,
        readDenied && rpcDenied, "Critical", rpcRes.error?.message ?? "");
    }
    for (const role of ["support", "super_admin"]) {
      const readRes = await S[role].db.from("conversation_reviews").select("id").limit(1);
      rec(`T6.9-${role}`, "n/a", "DB", `as ${role}: read conversation_reviews`,
        "allowed (no error)", readRes.error ? `ERROR ${readRes.error.code}` : "allowed",
        !readRes.error, "Critical", readRes.error?.message ?? "");
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // T7 — account suspension
  // ══════════════════════════════════════════════════════════════════════
  {
    // 7.1 manual suspend
    await setStatus(F.buyerA, "suspended");
    const { data: susp } = await S.support.db
      .from("account_suspensions").select("id, source, conversation_review_id, active")
      .eq("profile_id", F.buyerA).eq("active", true);
    const notif = await S.buyerA.db.from("notifications").select("kind").eq("kind", "account_suspended");
    rec("T7.1", "n/a", "DB", "set_account_status(suspended, source=admin_manual)",
      "account_status flips, ledger row appended, account_suspended notification fires",
      `status=${await accountStatus(F.buyerA)}, ledger=${susp?.length}, source=${susp?.[0]?.source}, notif=${notif.data?.length}`,
      (await accountStatus(F.buyerA)) === "suspended" && susp?.length === 1 &&
        susp[0].source === "admin_manual" && susp[0].conversation_review_id === null &&
        (notif.data?.length ?? 0) > 0,
      "Critical", "");

    // 7.3 suspended cannot message, both directions
    for (const [id, dir, sender, conv] of [
      ["T7.3a", "buyer→vendor", S.buyerA, CONV_AB],
    ]) {
      const send = await sender.db.from("messages")
        .insert({ conversation_id: conv, sender_id: sender.id, body: `${TAG} while suspended`, kind: "text" })
        .select("id");
      rec(id, dir, "DB", "suspended buyer sends into an ACTIVE conversation",
        "refused by messages_insert", send.error ? `raised ${send.error.code}` : "*** SENT ***",
        Boolean(send.error), "Critical", send.error?.message ?? "");
    }

    // 7.4 call gate reason codes, both directions
    {
      const asBuyer = await callGate(S.buyerA, F.vendorA);   // caller suspended
      const asVendor = await callGate(S.vendorA, F.buyerA);  // target suspended
      rec("T7.4a", "buyer→vendor", "DB", "suspended buyer runs the call gate against vendorA",
        "caller_suspended", asBuyer, asBuyer === "caller_suspended", "High", "");
      rec("T7.4b", "vendor→buyer", "DB", "vendorA runs the call gate against the suspended buyer",
        "target_suspended", asVendor, asVendor === "target_suspended", "High", "");
    }

    // 7.6 self-service bypass attempts
    {
      const self = await S.buyerA.db.from("profiles")
        .update({ account_status: "active" }).eq("id", F.buyerA).select("id");
      rec("T7.6a", "n/a", "DB", "suspended user UPDATEs their own profiles.account_status back to active",
        "refused; still suspended",
        self.error ? `raised ${self.error.code}` : `${self.data?.length ?? 0} rows`,
        (await accountStatus(F.buyerA)) === "suspended", "Critical", self.error?.message ?? "");

      // Must be a REAL transition. The first version set status to the value the
      // row already held, so enforce_conversation_status()'s
      // `new.status is distinct from old.status` guard never fired, the UPDATE was
      // a legal no-op, and 1 row came back looking like a bypass.
      await unlock(CONV_AB);
      const stBefore = await statusOf(CONV_AB); // 'active'
      const convUp = await S.vendorA.db.from("conversations")
        .update({ status: "under_review" }).eq("id", CONV_AB).select("id");
      const stAfter = await statusOf(CONV_AB);
      rec("T7.6b", "n/a", "DB",
        "a participant UPDATEs conversations.status to a DIFFERENT value",
        "refused by the trigger; status unchanged",
        convUp.error ? `raised ${convUp.error.code}, ${stBefore} -> ${stAfter}` : `${convUp.data?.length ?? 0} rows, ${stBefore} -> ${stAfter}`,
        stAfter === stBefore, "Critical", convUp.error?.message ?? "");

      const grant = await S.ads_moderator.db.from("profiles")
        .update({ admin_role: "super_admin" }).eq("id", S.ads_moderator.id).select("id");
      rec("T7.6c", "n/a", "DB", "a non-super_admin admin grants themselves super_admin",
        "refused", grant.error ? `raised ${grant.error.code}` : `${grant.data?.length ?? 0} rows`,
        Boolean(grant.error) || (grant.data?.length ?? 0) === 0, "Critical", grant.error?.message ?? "");
    }

    // 7.7 append-only ledger
    {
      const ins = await S.support.db.from("account_suspensions")
        .insert({ profile_id: F.buyerA, source: "admin_manual" }).select("id");
      const upd = await S.support.db.from("account_suspensions")
        .update({ active: false }).eq("profile_id", F.buyerA).select("id");
      const del = await S.support.db.from("account_suspensions")
        .delete().eq("profile_id", F.buyerA).select("id");
      const allDenied = (Boolean(ins.error) || (ins.data?.length ?? 0) === 0) &&
        (upd.data?.length ?? 0) === 0 && (del.data?.length ?? 0) === 0;
      rec("T7.7", "n/a", "DB", "as a support admin: INSERT / UPDATE / DELETE account_suspensions directly",
        "all three refused (rows-returned = 0); only set_account_status writes it",
        `insert=${ins.error ? "raised" : (ins.data?.length ?? 0) + " rows"}, update=${upd.data?.length ?? 0} rows, delete=${del.data?.length ?? 0} rows`,
        allDenied, "Critical", ins.error?.message ?? "");
    }

    // 7.5 reinstate closes ALL open suspensions; axes stay independent
    {
      // Lock the conversation FIRST, so we can prove reinstating does not touch it.
      await S.vendorA.db.rpc("submit_report", {
        p_conversation_id: CONV_AB, p_message_id: null, p_reported_reason: `${TAG} independence probe`,
      });
      await setStatus(F.buyerA, "active");
      const { data: open } = await S.support.db
        .from("account_suspensions").select("id").eq("profile_id", F.buyerA).eq("active", true);
      const rein = await S.buyerA.db.from("notifications").select("kind").eq("kind", "account_reinstated");
      const convStill = await statusOf(CONV_AB);
      rec("T7.5", "n/a", "DB",
        "reinstate while a conversation is separately locked",
        "0 open ledger rows, reinstatement notification, conversation STILL under_review (independent axes)",
        `open=${open?.length}, notif=${rein.data?.length}, conv=${convStill}`,
        (open?.length ?? 0) === 0 && (rein.data?.length ?? 0) > 0 && convStill === "under_review",
        "High", "");

      // and messaging into a DIFFERENT, unlocked thread works again immediately
      const other = await openConversation(S.buyerA, F.vendorB);
      await unlock(other.id); // a previous run may have left this pair locked
      const send = await S.buyerA.db.from("messages")
        .insert({ conversation_id: other.id, sender_id: S.buyerA.id, body: `${TAG} post-reinstate`, kind: "text" })
        .select("id");
      rec("T7.5b", "buyer→vendor", "DB", "after reinstatement, send into an unlocked thread",
        "sends immediately, no separate unlock needed",
        send.error ? `raised ${send.error.code}` : "sent", !send.error, "High", send.error?.message ?? "");
      await unlock(CONV_AB);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // T8 — suspension blocks CREATION, never existing content
  // ══════════════════════════════════════════════════════════════════════
  {
    const beforeProduct = await S.support.db.from("products").select("status").eq("id", F.liveProduct).single();
    const beforeAd = await S.support.db.from("advertisements").select("status").eq("id", F.activeAd).single();
    const beforeReview = await S.support.db.from("reviews").select("id, body").eq("id", F.existingReview).single();

    // Baseline: these inserts must WORK while active, or the suspended half
    // proves nothing (the 2026-09-05 false pass).
    const baseline = {};
    baseline.rfq = await S.buyerA.db.from("rfqs").insert({ buyer_id: F.buyerA, title: `${TAG} rfq` }).select("id");
    baseline.product = await S.vendorA.db.from("products").insert({ vendor_id: F.vendorA, name: `${TAG} product`, status: "draft" }).select("id");
    baseline.ad = await S.vendorA.db.from("advertisements").insert({ vendor_id: F.vendorA, title: `${TAG} ad`, status: "draft" }).select("id");
    baseline.review = await S.buyerB.db.from("reviews").insert({ buyer_id: F.buyerB, vendor_id: F.vendorA, rating: 4, body: `${TAG} review` }).select("id");
    for (const [k, r] of Object.entries(baseline)) {
      if (!r.error && r.data?.[0]) {
        const table = { rfq: "rfqs", product: "products", ad: "advertisements", review: "reviews" }[k];
        await (k === "review" ? S.buyerB : k === "rfq" ? S.buyerA : S.vendorA).db.from(table).delete().eq("id", r.data[0].id);
      }
    }
    const baselineOk = Object.values(baseline).every((r) => !r.error);
    rec("T8.0", "n/a", "DB", "BASELINE: the same four inserts while ACTIVE",
      "all four succeed (otherwise the suspended half proves nothing)",
      Object.entries(baseline).map(([k, r]) => `${k}=${r.error ? r.error.code : "ok"}`).join(" "),
      baselineOk, "Critical", Object.values(baseline).map((r) => r.error?.message ?? "").filter(Boolean).join(" | "));

    await setStatus(F.buyerA, "suspended");
    await setStatus(F.vendorA, "suspended");

    const blocked = {};
    blocked["rfqs"] = await S.buyerA.db.from("rfqs").insert({ buyer_id: F.buyerA, title: `${TAG} rfq2` }).select("id");
    blocked["reviews"] = await S.buyerA.db.from("reviews").insert({ buyer_id: F.buyerA, vendor_id: F.vendorB, rating: 3, body: `${TAG} r2` }).select("id");
    blocked["product_reviews"] = await S.buyerA.db.from("product_reviews").insert({ buyer_id: F.buyerA, product_id: F.liveProduct, rating: 3, body: `${TAG} pr` }).select("id");
    blocked["service_reviews"] = await S.buyerA.db.from("service_reviews").insert({ buyer_id: F.buyerA, service_id: "svc-fixture", rating: 3, body: `${TAG} sr` }).select("id");
    blocked["quotes"] = await S.vendorA.db.from("quotes").insert({ vendor_id: F.vendorA, price_value: 10 }).select("id");
    blocked["products"] = await S.vendorA.db.from("products").insert({ vendor_id: F.vendorA, name: `${TAG} p2`, status: "draft" }).select("id");
    blocked["product_videos"] = await S.vendorA.db.from("product_videos").insert({ vendor_id: F.vendorA, video_url: "x", status: "under_review" }).select("id");
    blocked["advertisements"] = await S.vendorA.db.from("advertisements").insert({ vendor_id: F.vendorA, title: `${TAG} ad2`, status: "draft" }).select("id");

    for (const [table, r] of Object.entries(blocked)) {
      const denied = Boolean(r.error) || (r.data?.length ?? 0) === 0;
      rec(`T8.${table}`, table.startsWith("product_v") || table === "quotes" || table === "products" || table === "advertisements" ? "vendor→buyer" : "buyer→vendor",
        "DB", `suspended account inserts into ${table}`,
        "refused by account_is_active()",
        denied ? `refused ${r.error?.code ?? "0 rows"}` : "*** WRITTEN ***",
        denied, "Critical", r.error?.message ?? "");
      if (!denied && r.data?.[0]) await S.support.db.from(table).delete().eq("id", r.data[0].id);
    }

    // THE scope regression: existing content untouched
    const afterProduct = await S.support.db.from("products").select("status").eq("id", F.liveProduct).single();
    const afterAd = await S.support.db.from("advertisements").select("status").eq("id", F.activeAd).single();
    const afterReview = await S.support.db.from("reviews").select("id, body").eq("id", F.existingReview).single();
    const untouched =
      afterProduct.data?.status === beforeProduct.data?.status &&
      afterAd.data?.status === beforeAd.data?.status &&
      afterReview.data?.body === beforeReview.data?.body;
    rec("T8.scope", "n/a", "DB",
      "suspend a vendor holding a LIVE product, an ACTIVE ad and an existing review",
      "none of them hidden, paused or altered — the gate is INSERT-only",
      `product ${beforeProduct.data?.status}→${afterProduct.data?.status}, ad ${beforeAd.data?.status}→${afterAd.data?.status}, review intact=${afterReview.data?.body === beforeReview.data?.body}`,
      untouched, "Critical", "");

    // suspension is not a login/read block
    const canRead = await S.vendorA.db.from("products").select("id").eq("id", F.liveProduct);
    rec("T8.read", "n/a", "DB", "suspended vendor reads their own existing product",
      "still readable — suspension is not a login block",
      canRead.error ? `ERROR ${canRead.error.code}` : `${canRead.data?.length} row(s)`,
      !canRead.error && (canRead.data?.length ?? 0) === 1, "Medium", "");

    await setStatus(F.buyerA, "active");
    await setStatus(F.vendorA, "active");
  }

  // ══════════════════════════════════════════════════════════════════════
  // T10 — notifications
  // ══════════════════════════════════════════════════════════════════════
  {
    // 10.2 cross-user read
    const cross = await S.buyerB.db.from("notifications").select("id, profile_id").limit(50);
    const foreign = (cross.data ?? []).filter((n) => n.profile_id !== S.buyerB.id);
    rec("T10.2", "n/a", "DB", "buyerB lists notifications",
      "only own rows", `${foreign.length} foreign of ${cross.data?.length ?? 0}`,
      foreign.length === 0, "Critical", "");

    // 10.3 THE column-restriction question
    const { data: own } = await S.buyerA.db.from("notifications").select("id, title, kind, body").limit(1);
    if (own?.[0]) {
      const tamper = await S.buyerA.db.from("notifications")
        .update({ title: "TAMPERED", kind: "account_reinstated", body: "TAMPERED" })
        .eq("id", own[0].id).select("id, title, kind");
      const changed = (tamper.data?.length ?? 0) > 0 && tamper.data[0].title === "TAMPERED";
      rec("T10.3", "n/a", "DB",
        "signed-in user UPDATEs their own notification's title/kind/body (not just `read`)",
        "refused — only `read` should be client-writable",
        changed ? "*** REWROTE title/kind/body ***" : "refused",
        !changed, "High",
        changed ? `title now ${JSON.stringify(tamper.data[0].title)}, kind ${tamper.data[0].kind}` : (tamper.error?.message ?? "0 rows"));
      // restore if it went through
      if (changed) {
        await S.buyerA.db.from("notifications")
          .update({ title: own[0].title, kind: own[0].kind, body: own[0].body }).eq("id", own[0].id);
      }
    }

    // 10.4 dismiss own / not another's
    const { data: mine } = await S.buyerA.db.from("notifications").select("id").limit(1);
    if (mine?.[0]) {
      const delOwn = await S.buyerA.db.from("notifications").delete().eq("id", mine[0].id).select("id");
      rec("T10.4a", "n/a", "DB", "user deletes their own notification",
        "1 row", delOwn.error ? `ERROR ${delOwn.error.code}` : `${delOwn.data?.length} row(s)`,
        !delOwn.error && (delOwn.data?.length ?? 0) === 1, "Medium", "");
    }
    const delOther = await S.buyerB.db.from("notifications").delete().eq("profile_id", F.buyerA).select("id");
    rec("T10.4b", "n/a", "DB", "buyerB deletes buyerA's notifications",
      "0 rows", `${delOther.data?.length ?? 0} rows`,
      (delOther.data?.length ?? 0) === 0, "Critical", delOther.error?.message ?? "");
  }

  // ══════════════════════════════════════════════════════════════════════
  // T12 — adversarial, every role
  // ══════════════════════════════════════════════════════════════════════
  {
    const ROLES = ["support", "super_admin", "product_moderator", "vendor_ops", "ads_moderator", "finance_admin", "buyerB"];
    for (const role of ROLES) {
      const c = await S[role].db.from("conversations").update({ status: "active" }).eq("id", CONV_AB).select("id");
      const p = await S[role].db.from("profiles").update({ account_status: "suspended" }).eq("id", F.buyerB).select("id");
      const own = await S[role].db.from("profiles").update({ account_status: "suspended" }).eq("id", S[role].id).select("id");
      const mu = await S[role].db.from("messages").update({ body: "TAMPERED" }).eq("conversation_id", CONV_AB).select("id");
      const md = await S[role].db.from("messages").delete().eq("conversation_id", CONV_AB).select("id");
      const denied = (r) => Boolean(r.error) || (r.data?.length ?? 0) === 0;
      const all = [c, p, own, mu, md].every(denied);
      rec(`T12-${role}`, "n/a", "DB",
        "direct UPDATE conversations.status / profiles.account_status (other + own) / UPDATE+DELETE messages",
        "all five refused, judged on rows-returned",
        `conv=${denied(c) ? "0" : c.data.length} prof=${denied(p) ? "0" : p.data.length} own=${denied(own) ? "0" : own.data.length} msgU=${denied(mu) ? "0" : mu.data.length} msgD=${denied(md) ? "0" : md.data.length}`,
        all, "Critical",
        [c, p, own, mu, md].map((r) => r.error?.code ?? "").filter(Boolean).join(","));
    }

    // regex_probe should be refused for the four non-chat roles
    for (const role of ["product_moderator", "vendor_ops", "ads_moderator", "finance_admin"]) {
      const r = await S[role].db.rpc("regex_probe", { p_pattern: "x", p_sample: "x" });
      rec(`T12-probe-${role}`, "n/a", "DB", `call regex_probe as ${role}`,
        "refused", r.error ? `raised ${r.error.code}` : "*** ALLOWED ***",
        Boolean(r.error), "High", r.error?.message ?? "");
    }
  }
} finally {
  // ── Teardown: return every fixture to its start state ──
  try {
    for (const id of [F.buyerA, F.buyerB, F.vendorA, F.vendorB]) {
      if ((await accountStatus(id)) !== "active") await setStatus(id, "active");
    }
    if (CONV_AB) await unlock(CONV_AB);
    if (CONV_BA) await unlock(CONV_BA);
    await S.support.db.from("keyword_blocklist").delete().like("term", `${TAG}%`);
    await S.support.db.from("flag_patterns").delete().like("label", `${TAG}%`);
  } catch (e) {
    console.error("TEARDOWN PROBLEM:", e.message);
  }
  for (const s of Object.values(S)) await s.db.auth.signOut();
}

console.table(results);
const pass = results.filter((r) => r.Status === "PASS").length;
console.log(`\n${pass}/${results.length} PASS, ${failures} FAIL`);
console.log(
  "NOTE: fixture ROWS (messages, ledger entries) are not deleted here — `messages` and\n" +
  "`account_suspensions` have no client DELETE policy by design. Run\n" +
  "scripts/drop-chat-fixtures.sql as the service role to clear them.",
);
process.exit(failures === 0 ? 0 : 1);

// ── helpers ──
/** Every review id on a conversation — the basis for the delta assertions. */
async function reviewIds(convId) {
  const { data } = await S.support.db.from("conversation_reviews").select("id").eq("conversation_id", convId);
  return (data ?? []).map((r) => r.id);
}
async function countMessages(convId) {
  const { data } = await S.support.db.from("messages").select("id").eq("conversation_id", convId);
  return data?.length ?? 0;
}
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
/** Port of callGate() from textile-spark-net/src/lib/queries/calls.ts. */
async function callGate(session, otherId) {
  const ids = session.id !== otherId ? [session.id, otherId] : [otherId];
  const { data: rows } = await session.db.from("profiles").select("id, account_status").in("id", ids);
  const st = (id) => rows?.find((r) => r.id === id)?.account_status ?? "active";
  if (st(session.id) === "suspended") return "caller_suspended";
  if (st(otherId) === "suspended") return "target_suspended";
  const [a, b] = pair(session.id, otherId);
  const { data: conv } = await session.db
    .from("conversations").select("status").eq("user_a", a).eq("user_b", b).maybeSingle();
  if (conv?.status === "under_review") return "under_review";
  return null;
}
