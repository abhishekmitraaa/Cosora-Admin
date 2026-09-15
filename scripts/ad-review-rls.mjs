/**
 * Phase 9.8 — every ad-review RPC, against the real database, with real logins.
 *
 * WHY THIS EXISTS AS A SEPARATE SCRIPT. rls-matrix.mjs judges table writes on
 * ROWS RETURNED, because an RLS-denied UPDATE raises nothing and PostgREST
 * reports success. The review RPCs are the opposite shape: they return no rows
 * on success and RAISE on refusal. Judging them by row count would mark every
 * passing call as a failure, so they need their own harness — the same split
 * rls-superadmin.mjs already makes with its `{ rpc: true }` cases.
 *
 * THE FIXTURE IS NOT CREATED HERE, and that is not laziness. demo-vendor is on
 * the free plan, and `enforce_ad_location_scope` refuses ad creation outright
 * for a free vendor ("Advertising is a paid feature"). A real paid campaign
 * does not arrive through an authenticated insert at all — it arrives from the
 * payment webhook as service_role, which that trigger skips. So the fixture is
 * created the same way, out of band, and this script is handed its id:
 *
 *   AD_RLS_FIXTURE_ID=<uuid> node scripts/ad-review-rls.mjs
 *
 * The fixture is left in place for the caller to remove, so a failed run can
 * be inspected rather than cleaned up from underneath.
 */
import { createClient } from "@supabase/supabase-js";
import { credential, demoAccount } from "./lib/test-credentials.mjs";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

async function signIn(email, password) {
  const db = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, id: data.user.id };
}

const results = [];
let failures = 0;

/**
 * `expect` is "allow" or "deny". A refusal is an ERROR, never an empty result:
 * these functions raise. An RPC that returned no error when it should have
 * refused is the exact failure this script exists to catch.
 */
async function check(label, expect, run) {
  const { error } = await run();
  const actual = error ? "deny" : "allow";
  const ok = actual === expect;
  if (!ok) failures++;
  results.push({
    case: label,
    expected: expect.toUpperCase(),
    actual: actual.toUpperCase(),
    verdict: ok ? "PASS" : "*** FAIL ***",
    db_said: error ? `${error.code ?? ""} ${error.message}`.trim().slice(0, 76) : "no error",
  });
}

const vendorAcct = demoAccount("vendor");
const buyerAcct = demoAccount("buyer");
const adminAcct = { email: "demo-admin@cosora.dev", password: credential("DEMO_ADMIN_PASSWORD") };

const vendor = await signIn(vendorAcct.email, vendorAcct.password);
const buyer = await signIn(buyerAcct.email, buyerAcct.password);
const admin = await signIn(adminAcct.email, adminAcct.password);

const adId = process.env.AD_RLS_FIXTURE_ID;
if (!adId) {
  throw new Error(
    "AD_RLS_FIXTURE_ID is not set. Create a pending_review campaign owned by demo-vendor " +
      "as service_role and pass its id: AD_RLS_FIXTURE_ID=<uuid> node scripts/ad-review-rls.mjs",
  );
}

// Confirm the fixture is what the matrix below assumes, rather than producing
// a page of confident-looking failures against the wrong row.
{
  const { data: row, error } = await admin.db
    .from("advertisements").select("id, vendor_id, status").eq("id", adId).maybeSingle();
  if (error) throw new Error(`could not read the fixture: ${error.message}`);
  if (!row) throw new Error(`no advertisements row with id ${adId}`);
  if (row.vendor_id !== vendor.id) {
    throw new Error(`fixture ${adId} belongs to ${row.vendor_id}, not demo-vendor (${vendor.id})`);
  }
  if (row.status !== "pending_review") {
    throw new Error(`fixture ${adId} is '${row.status}'; this matrix starts from 'pending_review'`);
  }
}

{
  // ── A buyer is neither owner nor moderator: everything must be refused ──
  await check("buyer  → approve_ad_campaign", "deny", () =>
    buyer.db.rpc("approve_ad_campaign", { p_ad_id: adId }));
  await check("buyer  → reject_ad_campaign", "deny", () =>
    buyer.db.rpc("reject_ad_campaign", { p_ad_id: adId, p_reason_code: "policy_other" }));
  await check("buyer  → request_ad_changes", "deny", () =>
    buyer.db.rpc("request_ad_changes", { p_ad_id: adId, p_reason_code: "policy_other" }));
  await check("buyer  → suspend_ad_campaign", "deny", () =>
    buyer.db.rpc("suspend_ad_campaign", { p_ad_id: adId, p_reason_code: "fraud_review" }));
  await check("buyer  → pause_ad_campaign_by_admin", "deny", () =>
    buyer.db.rpc("pause_ad_campaign_by_admin", { p_ad_id: adId, p_reason_code: "policy_other" }));
  await check("buyer  → pause_ad_campaign_by_vendor (not owner)", "deny", () =>
    buyer.db.rpc("pause_ad_campaign_by_vendor", { p_ad_id: adId }));
  await check("buyer  → resubmit_ad_campaign (not owner)", "deny", () =>
    buyer.db.rpc("resubmit_ad_campaign", { p_ad_id: adId }));
  await check("buyer  → archive_ad_campaign", "deny", () =>
    buyer.db.rpc("archive_ad_campaign", { p_ad_id: adId }));

  // ── The OWNER may not review their own campaign ──
  await check("vendor → approve own campaign", "deny", () =>
    vendor.db.rpc("approve_ad_campaign", { p_ad_id: adId }));
  await check("vendor → reject own campaign", "deny", () =>
    vendor.db.rpc("reject_ad_campaign", { p_ad_id: adId, p_reason_code: "policy_other" }));
  await check("vendor → suspend own campaign", "deny", () =>
    vendor.db.rpc("suspend_ad_campaign", { p_ad_id: adId, p_reason_code: "fraud_review" }));
  await check("vendor → pause_ad_campaign_by_admin", "deny", () =>
    vendor.db.rpc("pause_ad_campaign_by_admin", { p_ad_id: adId, p_reason_code: "policy_other" }));
  // Payment is never approval: the vendor cannot publish by direct write either.
  await check("vendor → UPDATE status='active' directly", "deny", async () => {
    const { data, error } = await vendor.db
      .from("advertisements").update({ status: "active" }).eq("id", adId).select("id");
    // Both shapes count as a denial here: the trigger raises 42501, and RLS
    // would match zero rows. Neither may leave the campaign active.
    return { error: error ?? (data?.length ? null : { code: "RLS", message: "0 rows" }) };
  });

  // ── A reason is mandatory where the brief says it is ──
  await check("admin  → reject with blank reason", "deny", () =>
    admin.db.rpc("reject_ad_campaign", { p_ad_id: adId, p_reason_code: "   " }));

  // ── The moderator path works ──
  await check("admin  → request_ad_changes", "allow", () =>
    admin.db.rpc("request_ad_changes", { p_ad_id: adId, p_reason_code: "poor_creative", p_note: "harness" }));
  await check("vendor → resubmit own campaign", "allow", () =>
    vendor.db.rpc("resubmit_ad_campaign", { p_ad_id: adId }));
  await check("admin  → approve_ad_campaign", "allow", () =>
    admin.db.rpc("approve_ad_campaign", { p_ad_id: adId, p_note: "harness" }));
  await check("admin  → approve again (already active)", "deny", () =>
    admin.db.rpc("approve_ad_campaign", { p_ad_id: adId }));

  // ── The two pauses are genuinely different ──
  await check("vendor → pause own running campaign", "allow", () =>
    vendor.db.rpc("pause_ad_campaign_by_vendor", { p_ad_id: adId }));
  await check("vendor → resume own pause", "allow", () =>
    vendor.db.rpc("resume_ad_campaign", { p_ad_id: adId }));
  await check("admin  → pause_ad_campaign_by_admin", "allow", () =>
    admin.db.rpc("pause_ad_campaign_by_admin", { p_ad_id: adId, p_reason_code: "policy_other" }));
  await check("vendor → resume an ADMIN pause", "deny", () =>
    vendor.db.rpc("resume_ad_campaign", { p_ad_id: adId }));
  await check("admin  → resume an admin pause", "allow", () =>
    admin.db.rpc("resume_ad_campaign", { p_ad_id: adId }));

  // ── The log is append-only for everyone ──
  // Admin-schema separation, Phase 3c (2026-09-16): the log is admin.ad_review_log,
  // in a schema PostgREST does not expose and no client role can use. The two
  // cases that used to live here (admin INSERT / DELETE on the table, both
  // "deny") are RETIRED as superseded: there is no REST surface to write through
  // at all, and a request to /rest/v1/ad_review_log now 404s — which would pass
  // a "deny" check vacuously. Append-only is now structural: the only writers are
  // the SECURITY DEFINER review functions. Reads go through
  // admin_ad_review_log_list(), which is admin-only (Q-4).
  await check("vendor → admin_ad_review_log_list for own campaign (admin-only, Q-4)", "deny", () =>
    vendor.db.rpc("admin_ad_review_log_list", { p_ad_id: adId }));

  // The decision history must actually have recorded all of the above.
  const { data: log } = await admin.db.rpc("admin_ad_review_log_list", { p_ad_id: adId });
  const decisions = (log ?? []).map((r) => r.decision);
  const expected = ["changes_requested", "resubmitted", "approved", "paused", "resumed"];
  const missing = expected.filter((d) => !decisions.includes(d));
  if (missing.length) failures++;
  results.push({
    case: "ad_review_log recorded every decision",
    expected: "ALLOW",
    actual: missing.length ? "DENY" : "ALLOW",
    verdict: missing.length ? "*** FAIL ***" : "PASS",
    db_said: missing.length ? `missing: ${missing.join(", ")}` : `${decisions.length} row(s)`,
  });
}

console.table(results);
console.log(failures === 0 ? "\nEVERY AD-REVIEW RPC BEHAVED AS EXPECTED" : `\n${failures} CASE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
