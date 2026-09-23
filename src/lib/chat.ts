import { supabase } from "./supabase";

/**
 * Shared reads for the chat-moderation screens.
 *
 * Two schema facts drive the shape of everything here:
 *
 * 1. `conversations.user_a` and `user_b` BOTH FK to `profiles`, so PostgREST
 *    refuses to embed profiles from a conversation at all (PGRST201, verified
 *    against the live schema). Same for `account_suspensions`, which points at
 *    profiles three times. So participants are looked up by id and merged
 *    client-side — the same approach lib/vendors.ts already takes, and immune to
 *    relationship ambiguity.
 *
 * 2. Nothing on a conversation says which side is the buyer. The only honest
 *    signal is whether a participant has a `vendor_profiles` row, so that is
 *    what decides it. When neither or both do (data we shouldn't see, but might),
 *    callers must fall back to neutral "Participant A / B" labels rather than
 *    guess — blocking the wrong person is not a recoverable mistake.
 */

export interface Participant {
  id: string;
  full_name: string | null;
  email: string | null;
  /** profiles.account_status — the live flag buyers and vendors share. */
  account_status: string;
  /** Has a vendor_profiles row. */
  isVendor: boolean;
  brand_name: string | null;
}

export async function fetchParticipants(ids: string[]): Promise<Map<string, Participant>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();

  // Email through the admin-gated RPC: profiles.email is not client-selectable
  // (MPF-3). Every other column is still a plain select.
  const [profiles, emails, vendors] = await Promise.all([
    supabase.from("profiles").select("id, full_name, account_status").in("id", unique),
    supabase.rpc("admin_profile_emails", { p_ids: unique }),
    supabase.from("vendor_profiles").select("id, brand_name").in("id", unique),
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  if (emails.error) throw new Error(emails.error.message);
  if (vendors.error) throw new Error(vendors.error.message);

  const emailOf = new Map((emails.data ?? []).map((e) => [e.id, e.email]));
  const brands = new Map((vendors.data ?? []).map((v) => [v.id, v.brand_name]));

  return new Map(
    (profiles.data ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        full_name: p.full_name,
        email: emailOf.get(p.id) ?? null,
        account_status: p.account_status,
        isVendor: brands.has(p.id),
        brand_name: brands.get(p.id) ?? null,
      },
    ]),
  );
}

/** How a participant is named in a row. Falls back through brand → name → email → id. */
export function participantLabel(p: Participant | undefined, id: string): string {
  if (!p) return `Unknown account (${id.slice(0, 8)}…)`;
  return p.brand_name || p.full_name || p.email || `${id.slice(0, 8)}…`;
}

/**
 * Which participant is the buyer and which is the vendor.
 * `resolved` is false when the pair can't be told apart — the caller must then
 * refuse to offer "Block buyer" / "Block vendor" rather than pick one.
 */
export interface Sides {
  buyer: Participant | undefined;
  vendor: Participant | undefined;
  buyerId: string | null;
  vendorId: string | null;
  resolved: boolean;
}

export function resolveSides(
  userA: string,
  userB: string,
  people: Map<string, Participant>,
): Sides {
  const a = people.get(userA);
  const b = people.get(userB);
  const aVendor = a?.isVendor === true;
  const bVendor = b?.isVendor === true;

  if (aVendor && !bVendor) {
    return { buyer: b, vendor: a, buyerId: userB, vendorId: userA, resolved: true };
  }
  if (bVendor && !aVendor) {
    return { buyer: a, vendor: b, buyerId: userA, vendorId: userB, resolved: true };
  }
  // Both vendors, or neither — nothing here can honestly label the sides.
  return { buyer: undefined, vendor: undefined, buyerId: null, vendorId: null, resolved: false };
}

export interface BlockReason {
  id: string;
  reason: string;
}

/**
 * The reason picker's options: active reasons only, ordered by reason. Support
 * and super_admin can both read every row (chat_block_reasons_select has no
 * active filter), so the filter is what keeps a deactivated reason out of a NEW
 * suspension while it stays readable on historical rows that reference it.
 */
export async function fetchActiveBlockReasons(): Promise<BlockReason[]> {
  const { data, error } = await supabase.rpc("admin_block_reason_list", { p_active_only: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ id, reason }) => ({ id, reason }));
}

/** conversations.status → badge copy. */
export const CONVERSATION_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  under_review: "Under review",
};

/** conversation_reviews.status → badge copy. */
export const REVIEW_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  resumed: "Resumed",
  buyer_blocked: "Buyer blocked",
  vendor_blocked: "Vendor blocked",
  kept_locked: "Kept locked",
};
