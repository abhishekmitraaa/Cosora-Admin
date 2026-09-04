import { supabase } from "./supabase";
import { fetchAccountStatuses } from "./accounts";

/**
 * Vendor identity as shown next to moderated content.
 *
 * Note the schema shape: products.vendor_id and advertisements.vendor_id both
 * FK to `profiles`, while the brand information lives in `vendor_profiles`
 * (whose id FKs to profiles.id). So there is no single-hop PostgREST embed from
 * a product to its brand — we look vendors up by id and merge client-side,
 * which is cheaper to read than a nested embed and immune to relationship
 * ambiguity.
 */
export interface VendorSummary {
  id: string;
  brand_name: string | null;
  city: string | null;
  is_verified: boolean;
  /**
   * From `profiles`, not `vendor_profiles` — see lib/accounts.ts. Selecting it
   * off `vendor_profiles` (as this did until 20260801095820 was accounted for)
   * is a 400, and because this helper runs inside the SAME queryFn as the
   * product/ad list, that 400 took the whole Products and Ads pages down, not
   * just the vendor badge.
   */
  account_status: string;
}

export async function fetchVendorsByIds(ids: string[]): Promise<Map<string, VendorSummary>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const [{ data, error }, statuses] = await Promise.all([
    supabase.from("vendor_profiles").select("id, brand_name, city, is_verified").in("id", unique),
    fetchAccountStatuses(unique),
  ]);
  if (error) throw new Error(error.message);

  return new Map(
    (data ?? []).map((v) => [
      v.id,
      { ...v, account_status: statuses.get(v.id) ?? "active" } as VendorSummary,
    ]),
  );
}
