import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * DISCOUNT CODES (admin completion Phase 10, migrations 20260929080502 and
 * 20260929084703 in textile-spark-net).
 *
 * Only vendors pay Cosora, so a code discounts one of three purchases (Mitra,
 * 2026-09-27): a subscription plan, an ad order's campaign lines, or the Cosora
 * Verified Certificate. Everything here is an RPC that admits super_admin and
 * finance_admin and refuses everyone else in the database:
 *   admin_discount_codes / _code_save / _code_set_active / _redemptions
 *
 * The two things the old fixture said must never be client-side aren't:
 *   - uses are counted from admin.discount_redemptions, under a row lock on the
 *     code, so two vendors can't both take the last use;
 *   - the discount is worked out by the database when the payment functions
 *     price an order. This screen manages the codes and never prices anything.
 *
 * Once a code has a confirmed use, its text, discount and what it applies to are
 * fixed (the database refuses the edit). Dates, caps, the note and on/off can
 * still change. Both tables are in the Admin Log.
 */

export type DiscountKind = "percent" | "flat";
export type DiscountTarget = "vendor_plan" | "ad_purchase" | "certificate";
export type DiscountState = "live" | "inactive" | "exhausted" | "expired" | "scheduled";

export const TARGET_LABELS: Record<DiscountTarget, string> = {
  vendor_plan: "Subscription plan",
  ad_purchase: "Ad campaign",
  certificate: "Verified Certificate",
};

/** What each target takes money off, for the form. */
export const TARGET_HELP: Record<DiscountTarget, string> = {
  vendor_plan: "The plan's price, before GST. GST is charged on what's left.",
  ad_purchase: "Every line of an ad order except the Verified Certificate. The Trusted Seal counts as an ad line.",
  certificate: "The Cosora Verified Certificate line of an ad order (₹199), and nothing else in it.",
};

/** Why a code is or isn't redeemable now. Each calls for a different fix. */
export const STATE_COPY: Record<DiscountState, string> = {
  live: "redeemable now",
  inactive: "switched off by an admin",
  exhausted: "every use has been claimed or is in a checkout",
  expired: "past its end date",
  scheduled: "starts on a future date",
};

/** One row of admin_discount_codes(). Money is in paise. */
export interface DiscountCode {
  id: string;
  code: string;
  kind: DiscountKind;
  /** Percent (1-100) when kind is percent, whole rupees when flat. */
  value: number;
  applies_to: DiscountTarget;
  /** Plan ids a plan code is limited to; null means every self-serve plan. */
  plan_ids: string[] | null;
  /** Null means no cap. */
  max_uses: number | null;
  per_vendor_limit: number;
  valid_from: string;
  valid_to: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  /** Confirmed (paid) uses. */
  uses: number;
  /** Reservations held for checkouts that haven't finished (30 minutes each). */
  in_checkout: number;
  vendors: number;
  discount_paise: number;
  last_used_at: string | null;
  state: DiscountState;
}

export type RedemptionStatus = "reserved" | "confirmed" | "released" | "lapsed";

/** One row of admin_discount_redemptions(). */
export interface DiscountRedemption {
  id: string;
  vendor_id: string;
  vendor_name: string | null;
  order_kind: "subscription" | "ad";
  /** Razorpay order id; free_… for a ₹0 order; demo_… when no gateway is set up. */
  order_ref: string;
  status: RedemptionStatus;
  eligible_paise: number;
  discount_paise: number;
  reserved_at: string;
  confirmed_at: string | null;
  released_at: string | null;
}

export const REDEMPTION_COPY: Record<RedemptionStatus, string> = {
  confirmed: "paid",
  reserved: "in checkout",
  released: "checkout replaced or failed",
  lapsed: "checkout abandoned",
};

/** How a code's value reads to a person. */
export function formatValue(d: Pick<DiscountCode, "kind" | "value">): string {
  return d.kind === "percent" ? `${d.value}% off` : `₹${d.value.toLocaleString("en-IN")} off`;
}

/** The full state a save sends: the database reads a missing field as "none". */
export interface DiscountDraft {
  code: string;
  kind: DiscountKind;
  value: number;
  applies_to: DiscountTarget;
  plan_ids: string[];
  max_uses: number | null;
  per_vendor_limit: number;
  valid_from: string;
  valid_to: string | null;
  active: boolean;
  note: string;
}

export function useDiscountCodes() {
  return useQuery({
    queryKey: ["discounts", "codes"],
    queryFn: async (): Promise<DiscountCode[]> => {
      const { data, error } = await supabase.rpc("admin_discount_codes");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DiscountCode[];
    },
  });
}

export function useDiscountRedemptions(codeId: string | null) {
  return useQuery({
    queryKey: ["discounts", "redemptions", codeId],
    enabled: Boolean(codeId),
    queryFn: async (): Promise<DiscountRedemption[]> => {
      const { data, error } = await supabase.rpc("admin_discount_redemptions", { p_code_id: codeId!, p_limit: 200 });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DiscountRedemption[];
    },
  });
}

/** Creates (id null) or edits a code. The database validates every field again. */
export function useSaveDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: DiscountDraft }): Promise<string> => {
      const { data, error } = await supabase.rpc("admin_discount_code_save", {
        p_id: id ?? undefined,
        p_code: draft.code,
        p_kind: draft.kind,
        p_value: draft.value,
        p_applies_to: draft.applies_to,
        p_plan_ids: draft.applies_to === "vendor_plan" && draft.plan_ids.length ? draft.plan_ids : undefined,
        p_max_uses: draft.max_uses ?? undefined,
        p_per_vendor_limit: draft.per_vendor_limit,
        p_valid_from: draft.valid_from,
        p_valid_to: draft.valid_to ?? undefined,
        p_active: draft.active,
        p_note: draft.note.trim() || undefined,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["discounts"] }),
  });
}

export function useSetDiscountActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("admin_discount_code_set_active", { p_id: id, p_active: active });
      if (error) throw new Error(error.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["discounts"] }),
  });
}

/** The plans a plan code can be limited to: paid and self-serve, like the database checks. */
export function useSelfServePlans() {
  return useQuery({
    queryKey: ["discounts", "plans"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, monthly_price, yearly_price, is_invite_only, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((p) => !p.is_invite_only && (p.monthly_price > 0 || p.yearly_price > 0))
        .map((p) => ({ id: p.id, name: p.name }));
    },
  });
}
