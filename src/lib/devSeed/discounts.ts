import { createDevStore, daysAgo, daysAhead, devId, devSeed } from "./store";

/**
 * C4 - DISCOUNT CODES. DEV-SEED ONLY. No table exists.
 *
 * Phase 2, roughly:
 *   discount_codes(id, code, kind, value, applies_to, max_uses, used_count,
 *                  valid_from, valid_to, active, created_by, created_at)
 *   discount_redemptions(id, code_id, vendor_id, order_ref, redeemed_at)
 *
 * TWO THINGS THAT MUST NOT BE CLIENT-SIDE when this becomes real:
 *
 *   1. `used_count` has to be maintained by the database, from the redemptions
 *      table, not incremented by whatever applied the code. Two vendors
 *      redeeming the last use of a code at the same moment is the ordinary case
 *      for a launch promotion, and a client-side counter lets both through.
 *   2. The discount must be applied SERVER-SIDE, in the same edge function that
 *      computes the amount. `razorpay-create-order` already refuses to trust a
 *      client amount, for exactly this reason; a discount that a browser can
 *      name is a discount a browser can invent.
 *
 * Neither is a UI concern, which is why this screen has no "apply" anything: it
 * manages the list of codes and nothing else.
 */

export type DiscountKind = "percent" | "flat";
export type DiscountTarget = "vendor_plan" | "ad_purchase" | "certificate";

export const TARGET_LABELS: Record<DiscountTarget, string> = {
  vendor_plan: "Vendor subscription plan",
  ad_purchase: "Ad purchase",
  certificate: "Verification certificate",
};

export interface Discount {
  id: string;
  code: string;
  kind: DiscountKind;
  /** Percent (1-100) when kind is percent, rupees when kind is flat. */
  value: number;
  appliesTo: DiscountTarget;
  /** null means unlimited. Distinct from 0, which would mean unusable. */
  maxUses: number | null;
  usedCount: number;
  validFrom: string;
  validTo: string | null;
  active: boolean;
}

const SEED: Discount[] = [
  {
    id: "disc-seed-1",
    code: "MONSOON25",
    kind: "percent",
    value: 25,
    appliesTo: "vendor_plan",
    maxUses: 200,
    usedCount: 143,
    validFrom: daysAgo(20),
    validTo: daysAhead(10),
    active: true,
  },
  {
    id: "disc-seed-2",
    code: "TIRUPPUR500",
    kind: "flat",
    value: 500,
    appliesTo: "ad_purchase",
    maxUses: 50,
    usedCount: 50,
    validFrom: daysAgo(45),
    validTo: daysAhead(15),
    active: true,
  },
  {
    id: "disc-seed-3",
    code: "FIRSTMILL",
    kind: "percent",
    value: 100,
    appliesTo: "certificate",
    maxUses: null,
    usedCount: 27,
    validFrom: daysAgo(90),
    validTo: null,
    active: true,
  },
  {
    id: "disc-seed-4",
    code: "SURATEXPO",
    kind: "flat",
    value: 1000,
    appliesTo: "ad_purchase",
    maxUses: 120,
    usedCount: 118,
    validFrom: daysAgo(120),
    validTo: daysAgo(4),
    active: true,
  },
  {
    id: "disc-seed-5",
    code: "GOLDUPGRADE",
    kind: "percent",
    value: 15,
    appliesTo: "vendor_plan",
    maxUses: 500,
    usedCount: 61,
    validFrom: daysAgo(8),
    validTo: daysAhead(52),
    active: false,
  },
];

export const discountStore = createDevStore<Discount>(devSeed(SEED));

export function addDiscount(input: Omit<Discount, "id" | "usedCount">) {
  discountStore.update((rows) => [
    { ...input, id: devId("disc"), usedCount: 0 },
    ...rows,
  ]);
}

export function editDiscount(id: string, patch: Partial<Discount>) {
  discountStore.update((rows) => rows.map((d) => (d.id === id ? { ...d, ...patch } : d)));
}

/**
 * Why a code is or is not redeemable right now.
 *
 * Four independent reasons, reported separately rather than folded into one
 * boolean, because "switched off" and "ran out" and "expired" call for three
 * different actions from whoever is looking at the row.
 */
export type DiscountState = "live" | "inactive" | "exhausted" | "expired" | "scheduled";

export function discountState(d: Discount, now = Date.now()): DiscountState {
  if (!d.active) return "inactive";
  if (new Date(d.validFrom).getTime() > now) return "scheduled";
  if (d.validTo && new Date(d.validTo).getTime() < now) return "expired";
  if (d.maxUses !== null && d.usedCount >= d.maxUses) return "exhausted";
  return "live";
}

export const STATE_COPY: Record<DiscountState, string> = {
  live: "redeemable now",
  inactive: "switched off by an admin",
  exhausted: "every use has been claimed",
  expired: "past its end date",
  scheduled: "starts on a future date",
};

/** How a code's value reads to a human. */
export function formatValue(d: Discount): string {
  return d.kind === "percent" ? `${d.value}% off` : `₹${d.value.toLocaleString("en-IN")} off`;
}
