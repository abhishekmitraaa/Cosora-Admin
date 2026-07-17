import { supabase } from "./supabase";

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
  account_status: string;
}

export async function fetchVendorsByIds(ids: string[]): Promise<Map<string, VendorSummary>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from("vendor_profiles")
    .select("id, brand_name, city, is_verified, account_status")
    .in("id", unique);
  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((v) => [v.id, v as VendorSummary]));
}
