/**
 * The ALLOW side of the matrix: a super_admin must be able to perform every
 * gated action, including the Part 2 role grant/demote that the other roles are
 * refused. Without this, "everything is denied" would also pass rls-matrix.mjs
 * while the panel was entirely non-functional.
 *
 * Same denial semantics as rls-matrix.mjs: an allowed write must report rows.
 *
 * Run: node scripts/rls-superadmin.mjs
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

const F = {
  vendor: "b92eaa10-4a83-42ff-b92a-feae098c9fa2",
  buyer: "11111111-1111-1111-1111-111111111111", // Demo Buyer — suspended and reinstated through the RPC below

  product: "86388022-b84a-4c15-9a83-59df215c9c88",
  ad: "af63ca56-f89a-4e1c-b343-100af133d85e",
  subscription: "f761fbf0-d6bd-4be8-b996-d885884e17a5",
  // the support test account — used as the target of a role grant/demote
  target: "c041f091-6d0c-418c-b91c-27dcbc76bb7f",
};

const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const { error: loginErr } = await db.auth.signInWithPassword({
  email: "rlstest-superadmin@cosora.test",
  password: credential("FIXTURE_PASSWORD"),
});
if (loginErr) throw new Error(`login failed: ${loginErr.message}`);

const cases = [
  ["products.approve", () => db.from("products").update({ status: "live" }).eq("id", F.product).select("id")],
  [
    "products.reject (+reason)",
    () =>
      db
        .from("products")
        .update({ status: "rejected", rejection_reason: "super admin check" })
        .eq("id", F.product)
        .select("id"),
  ],
  ["vendor.is_verified", () => db.from("vendor_profiles").update({ is_verified: true }).eq("id", F.vendor).select("id")],
  // NOT a vendor_profiles UPDATE any more — 20260801095820 dropped that column.
  // Even a super_admin cannot write profiles.account_status directly
  // (enforce_admin_grants raises on any direct change), so the allow-side case
  // is the RPC. These two RPCs raise on refusal rather than matching zero rows,
  // so `rows > 0` cannot judge them — handled by the `rpc: true` flag below.
  [
    "account.suspend via set_account_status()",
    () =>
      db.rpc("set_account_status", {
        p_profile_id: F.buyer,
        p_new_status: "suspended",
        p_reason_id: null,
        p_source: "admin_manual",
      }),
    { rpc: true },
  ],
  [
    "account.reinstate via set_account_status()",
    () =>
      db.rpc("set_account_status", {
        p_profile_id: F.buyer,
        p_new_status: "active",
        p_reason_id: null,
        p_source: "admin_manual",
      }),
    { rpc: true },
  ],
  [
    "ad.reject (+reason)",
    () =>
      db
        .from("advertisements")
        .update({ status: "rejected", moderation_reason: "super admin check", moderated_at: new Date().toISOString() })
        .eq("id", F.ad)
        .select("id"),
  ],
  [
    "subscription.change_plan",
    () => db.from("vendor_subscriptions").update({ plan_id: "gold" }).eq("id", F.subscription).select("id"),
  ],
  [
    "subscription.cancel",
    () => db.from("vendor_subscriptions").update({ status: "canceled" }).eq("id", F.subscription).select("id"),
  ],
  // Part 2 role management goes through the admin_users RPCs since admin-schema
  // separation Phase 5, exactly as the panel's Admins page does. Each returns the
  // affected admin_users row, so rows > 0 judges them like a table write.
  [
    "admin_set_role (change role, Part 2)",
    () => db.rpc("admin_set_role", { p_user_id: F.target, p_role: "vendor_ops" }),
  ],
  [
    "admin_revoke (demote)",
    () => db.rpc("admin_revoke", { p_user_id: F.target }),
  ],
  [
    "admin_grant (promote back to support)",
    () => db.rpc("admin_grant", { p_user_id: F.target, p_role: "support" }),
  ],
];

const results = [];
let failures = 0;
for (const [name, run, opts = {}] of cases) {
  const { data, error } = await run();
  const rows = Array.isArray(data) ? data.length : 0;
  // Table writes are judged on ROWS RETURNED, because an RLS denial on UPDATE
  // does not raise — it matches nothing and PostgREST reports success.
  //
  // A `returns void` RPC is the opposite: it returns no rows on SUCCESS and
  // RAISES on refusal. Judging it by row count would fail every passing call,
  // so those cases carry `{ rpc: true }` and are judged on the error alone.
  const ok = opts.rpc ? !error : !error && rows > 0;
  if (!ok) failures++;
  results.push({
    action: name,
    expected: "ALLOW",
    actual: ok ? "ALLOW" : "DENY",
    verdict: ok ? "PASS" : "*** FAIL ***",
    db_said: error
      ? `${error.code ?? ""} ${error.message}`.trim().slice(0, 80)
      : opts.rpc
        ? "no error (void rpc)"
        : `${rows} row(s)`,
  });
}

// Restore the fixtures to baseline.
await db.from("products").update({ status: "under_review", rejection_reason: null }).eq("id", F.product);
await db.from("vendor_profiles").update({ is_verified: false }).eq("id", F.vendor);
// account_status is restored by the reinstate case above, not here — it is not
// a vendor_profiles column and cannot be set by a direct UPDATE at all.
await db
  .from("advertisements")
  .update({ status: "active", moderation_reason: null, moderated_at: null, moderated_by: null })
  .eq("id", F.ad);
await db.from("vendor_subscriptions").update({ plan_id: "basic", status: "active" }).eq("id", F.subscription);

console.table(results);
console.log(failures === 0 ? "\nSUPER_ADMIN CAN PERFORM EVERY GATED ACTION" : `\n${failures} CASE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
