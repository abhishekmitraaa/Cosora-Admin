import { supabase } from "./supabase";

/**
 * Account-level suspension state, read from `profiles`.
 *
 * There used to be a second, vendor-scoped column — `vendor_profiles.account_status`
 * — and several screens in this app still selected it after migration
 * 20260801095820 DROPPED it. A PostgREST select naming a column that does not
 * exist is a hard 400, so those queries did not degrade: the whole page failed.
 *
 * Suspension is deliberately account-level. The same human toggles between buyer
 * and vendor, so a flag on the vendor row cannot stop them messaging as a buyer.
 * `vendor_profiles.id` FKs `profiles.id`, so the two are the same uuid and a
 * vendor's account status is just their profile's.
 *
 * Merged client-side rather than embedded: `vendor_profiles` reaches `profiles`
 * by more than one path, which makes a PostgREST embed ambiguous (PGRST201) —
 * the same reason `lib/vendors.ts` resolves brands by id instead of embedding.
 */
export async function fetchAccountStatuses(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();

  // The ids go in the URL: a few hundred of them outgrow the gateway's limit (the Vendors
  // page asks for every vendor), so they go 100 at a time (subscriptions sweep, 2026-10-09).
  // Through admin_account_statuses() (buyer review L-89, 2026-11-20): account_status is no longer readable to
  // signed-in accounts, staff included. It takes up to 500 ids; 100 a call keeps the old batching.
  const parts = await Promise.all(
    chunks(unique, IN_CHUNK).map(async (part) => {
      const { data, error } = await supabase.rpc("admin_account_statuses" as never, { p_ids: part } as never);
      if (error) throw new Error((error as { message: string }).message);
      return ((data ?? []) as unknown) as { id: string; account_status: string }[];
    }),
  );
  return new Map(parts.flat().map((p) => [p.id, p.account_status]));
}

/** How many ids one `.in()` filter carries, so the URL stays well under the gateway's limit. */
export const IN_CHUNK = 100;

export function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Single-account form of the above. Returns null when there is no profiles row. */
export async function fetchAccountStatus(id: string): Promise<string | null> {
  return (await fetchAccountStatuses([id])).get(id) ?? null;
}
