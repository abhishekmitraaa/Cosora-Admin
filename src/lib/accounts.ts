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

  const { data, error } = await supabase
    .from("profiles")
    .select("id, account_status")
    .in("id", unique);
  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((p) => [p.id, p.account_status as string]));
}

/** Single-account form of the above. Returns null when there is no profiles row. */
export async function fetchAccountStatus(id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.account_status as string) ?? null;
}
