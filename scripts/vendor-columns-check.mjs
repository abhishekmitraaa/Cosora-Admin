/**
 * Regression guard for the vendor_profiles.account_status removal.
 *
 * Migration 20260801095820 DROPPED `vendor_profiles.account_status` and moved
 * suspension to `profiles.account_status`. Four screens kept selecting the dead
 * column, and PostgREST answers a select naming a missing column with a hard
 * 42703 — not a null. Because `fetchVendorsByIds()` runs inside the SAME
 * `queryFn` as the product and ad lists, that error took Vendors, VendorDetail,
 * Products AND Ads down entirely.
 *
 * TypeScript did not catch it: database.types.ts still typed the column, having
 * been hand-maintained rather than regenerated. So this asserts against the real
 * PostgREST endpoint, which is the only thing that actually knows.
 *
 * Read-only — every case is a SELECT with .limit(1). Safe to run any time.
 * Needs no login: profiles_select is `true` and vendor_profiles is readable.
 *
 * Run: node scripts/vendor-columns-check.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

/** `expect: "gone"` = this column must NOT exist; `"ok"` = the query must work. */
const CASES = [
  {
    name: "vendor_profiles.account_status is really gone",
    expect: "gone",
    run: () => db.from("vendor_profiles").select("id, account_status").limit(1),
  },
  {
    name: "Vendors.tsx list query",
    expect: "ok",
    run: () =>
      db
        .from("vendor_profiles")
        .select(
          "id, brand_name, city, business_type, onboarding_complete, is_verified, plan_id, plan_expires_at, ad_verified_until",
        )
        .limit(1),
  },
  {
    name: "VendorDetail.tsx detail query",
    expect: "ok",
    run: () =>
      db
        .from("vendor_profiles")
        .select(
          `id, brand_name, about, city, state, country, business_type, owner_name, owner_email,
           phone, website, address_line, area, postal_code, landmark, gstin, pan, cin,
           is_verified, onboarding_complete, plan_id, plan_expires_at, ad_verified_until`,
        )
        .limit(1),
  },
  {
    name: "lib/vendors.ts fetchVendorsByIds (drives Products + Ads)",
    expect: "ok",
    run: () => db.from("vendor_profiles").select("id, brand_name, city, is_verified").limit(1),
  },
  {
    name: "lib/accounts.ts fetchAccountStatuses",
    expect: "ok",
    run: () => db.from("profiles").select("id, account_status").limit(1),
  },
];

const results = [];
let failures = 0;

for (const c of CASES) {
  const { error } = await c.run();
  // 42703 = undefined_column. Anything else is a different problem and must not
  // be allowed to masquerade as "correctly gone".
  const ok = c.expect === "gone" ? error?.code === "42703" : !error;
  if (!ok) failures++;
  results.push({
    check: c.name,
    expected: c.expect === "gone" ? "42703 undefined_column" : "no error",
    actual: error ? `${error.code} ${error.message}`.slice(0, 52) : "no error",
    verdict: ok ? "PASS" : "*** FAIL ***",
  });
}

console.table(results);
console.log(
  failures === 0
    ? "\nPASS — no screen queries the dropped column, and every replacement query parses."
    : `\n${failures} CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
