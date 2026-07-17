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
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const F = {
  vendor: "b92eaa10-4a83-42ff-b92a-feae098c9fa2",
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
  password: "TestPass123!",
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
  [
    "vendor.suspend",
    () => db.from("vendor_profiles").update({ account_status: "suspended" }).eq("id", F.vendor).select("id"),
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
  [
    "profiles.change admin_role (Part 2)",
    () => db.from("profiles").update({ admin_role: "vendor_ops" }).eq("id", F.target).select("id"),
  ],
  [
    "profiles.demote (is_admin=false)",
    () => db.from("profiles").update({ is_admin: false, admin_role: null }).eq("id", F.target).select("id"),
  ],
  [
    "profiles.promote back (is_admin=true)",
    () => db.from("profiles").update({ is_admin: true, admin_role: "support" }).eq("id", F.target).select("id"),
  ],
];

const results = [];
let failures = 0;
for (const [name, run] of cases) {
  const { data, error } = await run();
  const rows = Array.isArray(data) ? data.length : 0;
  const ok = !error && rows > 0;
  if (!ok) failures++;
  results.push({
    action: name,
    expected: "ALLOW",
    actual: ok ? "ALLOW" : "DENY",
    verdict: ok ? "PASS" : "*** FAIL ***",
    db_said: error ? `${error.code ?? ""} ${error.message}`.trim().slice(0, 80) : `${rows} row(s)`,
  });
}

// Restore the fixtures to baseline.
await db.from("products").update({ status: "under_review", rejection_reason: null }).eq("id", F.product);
await db.from("vendor_profiles").update({ is_verified: false, account_status: "active" }).eq("id", F.vendor);
await db
  .from("advertisements")
  .update({ status: "active", moderation_reason: null, moderated_at: null, moderated_by: null })
  .eq("id", F.ad);
await db.from("vendor_subscriptions").update({ plan_id: "basic", status: "active" }).eq("id", F.subscription);

console.table(results);
console.log(failures === 0 ? "\nSUPER_ADMIN CAN PERFORM EVERY GATED ACTION" : `\n${failures} CASE(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
