/**
 * Role-vs-write matrix, executed against the real database with real logins.
 *
 * Each case signs in with the ANON key (so PostgREST runs as `authenticated`,
 * which is exactly what the moderation triggers check) and attempts a write.
 * `expect: "deny"` cases prove the DATABASE refuses — not the UI.
 *
 * IMPORTANT — how a denial actually looks:
 *   An RLS policy does not raise an error on UPDATE. A row the USING clause
 *   rejects is simply INVISIBLE, so the statement matches zero rows and returns
 *   success with no error. Only the BEFORE triggers raise 42501 explicitly.
 *   Therefore a write is "allowed" ONLY if it reports affected rows back, which
 *   is why every case appends .select("id") and counts the result. Checking
 *   `error === null` alone would mark silent RLS denials as PASS — the exact
 *   false negative this matrix exists to catch.
 *
 * Run: node scripts/rls-matrix.mjs
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

const F = {
  vendor: "b92eaa10-4a83-42ff-b92a-feae098c9fa2",
  // Demo Buyer. A non-admin profile, used as the target of writes that must be
  // refused for every admin role.
  buyer: "11111111-1111-1111-1111-111111111111",
  product: "86388022-b84a-4c15-9a83-59df215c9c88",
  ad: "af63ca56-f89a-4e1c-b343-100af133d85e",
  invoice: "7348313a-b39b-4115-8a92-bcd3bd82e5a2",
  subscription: "f761fbf0-d6bd-4be8-b996-d885884e17a5",
};

const ACCOUNTS = {
  product_moderator: "rlstest-productmod@cosora.test",
  vendor_ops: "rlstest-vendorops@cosora.test",
  ads_moderator: "rlstest-adsmod@cosora.test",
  finance_admin: "rlstest-finance@cosora.test",
  support: "rlstest-support@cosora.test",
};

// action -> the role that IS allowed (besides super_admin)
const ACTIONS = {
  "products.approve (status=live)": {
    allowed: "product_moderator",
    run: (db) => db.from("products").update({ status: "live" }).eq("id", F.product).select("id"),
    revert: (db) => db.from("products").update({ status: "under_review" }).eq("id", F.product).select("id"),
  },
  "products.reject (+reason)": {
    allowed: "product_moderator",
    run: (db) =>
      db.from("products").update({ status: "rejected", rejection_reason: "matrix test" }).eq("id", F.product).select("id"),
    revert: (db) =>
      db.from("products").update({ status: "under_review", rejection_reason: null }).eq("id", F.product).select("id"),
  },
  "vendor_profiles.is_verified": {
    allowed: "vendor_ops",
    run: (db) => db.from("vendor_profiles").update({ is_verified: true }).eq("id", F.vendor).select("id"),
    revert: (db) => db.from("vendor_profiles").update({ is_verified: false }).eq("id", F.vendor).select("id"),
  },
  // vendor_profiles.account_status was DROPPED by 20260801095820. The case that
  // used to live here tested a column that no longer exists, which PostgREST
  // answers with a 400 for EVERY role — indistinguishable from an RLS denial,
  // so it read as a clean pass for five roles and a spurious failure for one.
  //
  // Its replacement is profiles.account_status, and the interesting property is
  // the opposite one: NOBODY may write it directly, vendor_ops and super_admin
  // included, because enforce_admin_grants() raises on any direct change. The
  // only door is set_account_status(), covered in chat-moderation-matrix.mjs.
  "profiles.account_status (direct write — must fail for everyone)": {
    allowed: "__nobody__",
    run: (db) => db.from("profiles").update({ account_status: "suspended" }).eq("id", F.buyer).select("id"),
    revert: null, // never succeeds; nothing to undo
  },
  "advertisements.pause (+reason)": {
    allowed: "ads_moderator",
    run: (db) =>
      db
        .from("advertisements")
        .update({ status: "paused", moderation_reason: "matrix test", moderated_at: new Date().toISOString() })
        .eq("id", F.ad).select("id"),
    revert: (db) =>
      db.from("advertisements").update({ status: "active", moderation_reason: null, moderated_at: null }).eq("id", F.ad).select("id"),
  },
  "advertisements.reject (+reason)": {
    allowed: "ads_moderator",
    run: (db) =>
      db
        .from("advertisements")
        .update({ status: "rejected", moderation_reason: "matrix test", moderated_at: new Date().toISOString() })
        .eq("id", F.ad).select("id"),
    revert: (db) =>
      db.from("advertisements").update({ status: "active", moderation_reason: null, moderated_at: null }).eq("id", F.ad).select("id"),
  },
  "vendor_subscriptions.cancel": {
    allowed: "finance_admin",
    run: (db) => db.from("vendor_subscriptions").update({ status: "canceled" }).eq("id", F.subscription).select("id"),
    revert: (db) => db.from("vendor_subscriptions").update({ status: "active" }).eq("id", F.subscription).select("id"),
  },
  "vendor_subscriptions.change_plan": {
    allowed: "finance_admin",
    run: (db) => db.from("vendor_subscriptions").update({ plan_id: "gold" }).eq("id", F.subscription).select("id"),
    revert: (db) => db.from("vendor_subscriptions").update({ plan_id: "basic" }).eq("id", F.subscription).select("id"),
  },
  "profiles.admin_role (grant)": {
    allowed: "__super_admin_only__",
    run: (db, ctx) => db.from("profiles").update({ admin_role: "super_admin" }).eq("id", ctx.selfId).select("id"),
    revert: null, // never succeeds for these roles; nothing to undo
  },
};

async function signIn(email) {
  const db = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, selfId: data.user.id };
}

const results = [];
let failures = 0;

for (const [role, email] of Object.entries(ACCOUNTS)) {
  const { db, selfId } = await signIn(email);

  for (const [action, spec] of Object.entries(ACTIONS)) {
    const shouldAllow = spec.allowed === role;
    const { data, error } = await spec.run(db, { selfId });
    // Denied = trigger raised, OR RLS silently matched zero rows.
    const rows = Array.isArray(data) ? data.length : 0;
    const denied = Boolean(error) || rows === 0;
    const ok = shouldAllow ? !denied : denied;
    if (!ok) failures++;

    results.push({
      role,
      action,
      expected: shouldAllow ? "ALLOW" : "DENY",
      actual: denied ? "DENY" : "ALLOW",
      verdict: ok ? "PASS" : "*** FAIL ***",
      how: error ? "trigger 42501" : rows === 0 ? "RLS: 0 rows" : `${rows} row(s)`,
      db_said: error ? `${error.code ?? ""} ${error.message}`.trim().slice(0, 70) : "",
    });

    // Undo anything that legitimately went through, so fixtures stay pristine.
    if (!denied && spec.revert) await spec.revert(db);
  }

  // The flagged-items log: the one thing EVERY admin (support included) may write.
  // Since admin-schema separation Phase 3c the table is admin.admin_flags, which
  // PostgREST cannot reach; the only write path is admin_flag_add(), which checks
  // is_admin() inside and always records auth.uid() as the author.
  const { data: flagRows, error: flagErr } = await db.rpc("admin_flag_add", {
    p_entity_type: "vendor",
    p_entity_id: F.vendor,
    p_note: `matrix test by ${role}`,
  });
  const flagDenied = Boolean(flagErr) || !flagRows?.length || flagRows[0].author_id !== selfId;
  results.push({
    role,
    action: "admin_flag_add (note, author = self)",
    expected: "ALLOW",
    actual: flagDenied ? "DENY" : "ALLOW",
    verdict: flagDenied ? "*** FAIL ***" : "PASS",
    how: "",
    db_said: flagErr ? `${flagErr.code ?? ""} ${flagErr.message}`.trim().slice(0, 70) : "",
  });
  if (flagDenied) failures++;

  // Authorship forgery must be refused for everyone. admin_flag_add has no author
  // parameter at all, so the only way to try is to pass one: PostgREST finds no
  // function with that signature and refuses (PGRST202) before anything is written.
  const { data: forgeRows, error: forgeErr } = await db.rpc("admin_flag_add", {
    p_entity_type: "vendor",
    p_entity_id: F.vendor,
    p_note: "forged author",
    p_author_id: "33333333-3333-3333-3333-333333333333",
  });
  const forgeDenied = Boolean(forgeErr) || !forgeRows?.length;
  results.push({
    role,
    action: "admin_flag_add AS SOMEONE ELSE (extra author param)",
    expected: "DENY",
    actual: forgeDenied ? "DENY" : "ALLOW",
    verdict: forgeDenied ? "PASS" : "*** FAIL ***",
    how: "",
    db_said: forgeErr ? `${forgeErr.code ?? ""} ${forgeErr.message}`.trim().slice(0, 70) : "",
  });
  if (!forgeDenied) failures++;

  // The refund edge function must reject non-finance roles server-side.
  // A 403 surfaces as FunctionsHttpError with the body on error.context —
  // reading only `data` would miss it entirely and report a false pass.
  const { data: refundData, error: refundErr } = await db.functions.invoke("admin-refund-payment", {
    body: { invoiceId: F.invoice },
  });
  let raw = refundData ?? {};
  if (refundErr?.context && typeof refundErr.context.json === "function") {
    try { raw = await refundErr.context.json(); } catch { raw = { error: refundErr.message }; }
  }
  const refundAllowed = role === "finance_admin";
  // finance_admin should get PAST authorization (and then fail on no_payment_id /
  // not_configured); everyone else must be stopped at 'forbidden'.
  const gotForbidden = raw.error === "forbidden";
  const refundOk = refundAllowed ? !gotForbidden : gotForbidden;
  if (!refundOk) failures++;
  results.push({
    role,
    action: "edge fn admin-refund-payment",
    expected: refundAllowed ? "PASS AUTH" : "FORBIDDEN",
    actual: gotForbidden ? "FORBIDDEN" : `reached: ${raw.error ?? "ok"}`,
    verdict: refundOk ? "PASS" : "*** FAIL ***",
    how: "",
    db_said: (raw.detail ?? "").slice(0, 70),
  });

  await db.auth.signOut();
}

console.table(results);
console.log(failures === 0 ? "\nALL CASES BEHAVED AS EXPECTED" : `\n${failures} CASE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
