/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADS MONITORING - WHAT THIS SCHEMA CAN AND CANNOT TELL YOU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Read this before adding a figure to the monitoring dashboard. Two of the
 * three numbers the brief asked for do not exist in the database, and the
 * difference between "derived" and "invented" is the whole point of this file.
 *
 * ── 1. THERE IS NO RUNNING SPEND, AND IT CANNOT BE DERIVED FROM DELIVERY. ──
 *
 * Cosora ads are NOT auction-priced. `razorpay-create-order` computes the
 * amount server-side as:
 *
 *     amount = SUM(AD_PRICE[placementId] * days) * itemCount
 *
 * A flat rupee rate per placement per day, charged in full up front. There is
 * no CPM, no CPC, and no per-impression cost anywhere in the codebase, so
 * `impressions x rate` is not a spend figure - it is a made-up one. An
 * impression on a Cosora ad costs the vendor exactly nothing, because they
 * already paid for the slot.
 *
 * `advertisements.daily_budget` looks like a cap and is not one. It is written
 * once by `razorpay-verify-payment` as:
 *
 *     daily_budget = round(prepaidTotalForThisProduct / days)
 *
 * A DISPLAY figure, derived from money that has already moved. Nothing
 * decrements it, no trigger checks it, and delivery does not stop when it is
 * "used up" - `active_ads` filters on status alone.
 *
 * So: "spend today" on this dashboard is REVENUE BOOKED today, read from
 * `ad_orders` (status='paid', amount in PAISE), which is a real number about
 * real money. And "budget utilisation" is a SCHEDULE burn-down: how far a
 * prepaid campaign has run against how much of it was bought. Both are labelled
 * as exactly that on screen.
 *
 * ── 2. THERE IS NO CONVERSIONS COLUMN. ──
 *
 * The brief asked for a "clicks with zero conversions" flag. Cosora records no
 * conversion event of any kind: `advertisements` has `impressions` and `clicks`
 * and nothing else, and no table links an ad to an RFQ, a quote or an order.
 * Inventing a conversion number would be worse than omitting the flag.
 *
 * What CAN be flagged honestly, from the two counters that do exist:
 *   - a campaign served a meaningful number of times and was never clicked, and
 *   - a campaign whose CTR is far below what the rest of the platform gets.
 * Both are real signals that a vendor is paying for nothing. Neither is a
 * conversion metric, and the UI does not call them one.
 *
 * ── 3. ad_orders CANNOT BE JOINED TO advertisements. ──
 *
 * The order carries a `spec` JSON of placement ids and product ids; the ad rows
 * it produced carry no order id. So per-campaign "what was actually paid for
 * this row" is not answerable, and revenue is reported at the platform level
 * only, never per campaign.
 */

/** Rupees, from a paise column. `ad_orders.amount` is the only paise column. */
export const paiseToRupees = (paise: number) => paise / 100;

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ *
 * Rates
 * ------------------------------------------------------------------ */

/**
 * Click-through rate as a fraction, or `null` when it is unmeasured.
 *
 * Zero impressions is NOT zero CTR. A campaign that has never been served has
 * no rate at all, and rendering it as "0.00%" ranks it beside a campaign that
 * was served ten thousand times and ignored. Those are opposite problems.
 */
export function ctr(clicks: number, impressions: number): number | null {
  if (impressions <= 0) return null;
  return clicks / impressions;
}

export function formatCtr(rate: number | null): string {
  if (rate === null) return "no data";
  return `${(rate * 100).toFixed(2)}%`;
}

/* ------------------------------------------------------------------ *
 * Schedule (what "budget utilisation" actually means here)
 * ------------------------------------------------------------------ */

export interface Schedule {
  /** Whole days the campaign was bought for. Null when the dates are missing. */
  totalDays: number | null;
  /** Days elapsed, clamped into [0, totalDays]. */
  elapsedDays: number | null;
  /** 0..1 of the purchased run that has been served. Null when unknowable. */
  fraction: number | null;
  /** Rupees of the prepaid total the elapsed days account for. */
  committed: number | null;
  /** Rupees the whole run was bought for (daily_budget x totalDays). */
  prepaid: number | null;
  ended: boolean;
  notStarted: boolean;
}

/**
 * Turn a campaign's dates and its `daily_budget` display figure into a
 * burn-down.
 *
 * This is a SCHEDULE measurement, not a spend measurement (see the header).
 * `committed` answers "how much of what this vendor already paid has been
 * delivered so far", which is the honest version of the question "how much of
 * their budget is used". Nothing here implies money moving during the run.
 */
export function schedule(
  ad: { daily_budget: number | null; starts_at: string | null; ends_at: string | null },
  now = Date.now(),
): Schedule {
  const start = ad.starts_at ? new Date(ad.starts_at).getTime() : null;
  const end = ad.ends_at ? new Date(ad.ends_at).getTime() : null;

  if (start === null || end === null || end <= start) {
    return {
      totalDays: null,
      elapsedDays: null,
      fraction: null,
      committed: null,
      prepaid: null,
      ended: end !== null && end <= now,
      notStarted: start !== null && start > now,
    };
  }

  const totalDays = Math.max(1, Math.round((end - start) / DAY_MS));
  const rawElapsed = (now - start) / DAY_MS;
  const elapsedDays = Math.min(totalDays, Math.max(0, Math.round(rawElapsed)));
  const fraction = Math.min(1, Math.max(0, (now - start) / (end - start)));

  const daily = ad.daily_budget;
  return {
    totalDays,
    elapsedDays,
    fraction,
    committed: daily != null ? daily * elapsedDays : null,
    prepaid: daily != null ? daily * totalDays : null,
    ended: now >= end,
    notStarted: now < start,
  };
}

/* ------------------------------------------------------------------ *
 * Revenue windows
 * ------------------------------------------------------------------ */

export interface PaidOrder {
  amount: number; // PAISE
  status: string;
  paid_at: string | null;
  created_at: string;
}

/**
 * `paid_at` is the moment the money landed and is the right clock for a
 * revenue window. It is nullable on rows the webhook has not stamped, so
 * `created_at` is the documented fallback - the same fallback Reports.tsx
 * already uses, kept identical so the two screens cannot disagree.
 */
const orderClock = (o: PaidOrder) => new Date(o.paid_at ?? o.created_at).getTime();

export function bookedBetween(orders: PaidOrder[], fromMs: number, toMs: number): number {
  let rupees = 0;
  for (const o of orders) {
    if (o.status !== "paid") continue;
    const t = orderClock(o);
    if (t >= fromMs && t < toMs) rupees += paiseToRupees(o.amount);
  }
  return rupees;
}

/** Local-midnight boundaries. Cosora is an IST product; the browser's zone is the admin's. */
export function todayWindow(now = new Date()): [number, number] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return [start, start + DAY_MS];
}

export function monthWindow(now = new Date()): [number, number] {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  return [start, end];
}

/* ------------------------------------------------------------------ *
 * Attention flags
 * ------------------------------------------------------------------ */

/**
 * Below this many impressions, neither flag fires. A campaign served 40 times
 * with no clicks is a small sample, not a problem; flagging it would make the
 * list noise and train people to ignore it.
 */
export const FLAG_MIN_IMPRESSIONS = 200;

/**
 * A CTR floor, not a target. Display advertising on a B2B marketplace runs well
 * under 1%, so this is set low deliberately: it is meant to catch a campaign
 * that is effectively invisible, not to grade good ones.
 */
export const FLAG_LOW_CTR = 0.001; // 0.1%

export type AdFlag = "never_clicked" | "low_ctr";

export interface FlagResult {
  flag: AdFlag | null;
  /** Plain-language reason, rendered next to the flag. Never a bare colour. */
  why: string | null;
}

/**
 * NOT a conversion check. Cosora records no conversion event (see the header),
 * so this reports the two things the impression and click counters can actually
 * support: served-and-never-clicked, and served-and-effectively-ignored.
 */
export function attentionFlag(ad: { impressions: number; clicks: number }): FlagResult {
  if (ad.impressions < FLAG_MIN_IMPRESSIONS) return { flag: null, why: null };
  if (ad.clicks === 0) {
    return {
      flag: "never_clicked",
      why: `Served ${ad.impressions.toLocaleString("en-IN")} times and never clicked.`,
    };
  }
  const rate = ctr(ad.clicks, ad.impressions);
  if (rate !== null && rate < FLAG_LOW_CTR) {
    return {
      flag: "low_ctr",
      why: `${formatCtr(rate)} click-through across ${ad.impressions.toLocaleString("en-IN")} impressions.`,
    };
  }
  return { flag: null, why: null };
}

/* ------------------------------------------------------------------ *
 * Per-vendor rollup
 * ------------------------------------------------------------------ */

export interface VendorPerformance {
  vendorId: string;
  campaigns: number;
  activeCampaigns: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  flagged: number;
}

export function rollUpByVendor(
  ads: {
    vendor_id: string;
    status: string;
    impressions: number;
    clicks: number;
  }[],
): VendorPerformance[] {
  const byVendor = new Map<string, VendorPerformance>();
  for (const ad of ads) {
    let row = byVendor.get(ad.vendor_id);
    if (!row) {
      row = {
        vendorId: ad.vendor_id,
        campaigns: 0,
        activeCampaigns: 0,
        impressions: 0,
        clicks: 0,
        ctr: null,
        flagged: 0,
      };
      byVendor.set(ad.vendor_id, row);
    }
    row.campaigns += 1;
    if (ad.status === "active") row.activeCampaigns += 1;
    row.impressions += ad.impressions;
    row.clicks += ad.clicks;
    if (attentionFlag(ad).flag !== null) row.flagged += 1;
  }

  const rows = [...byVendor.values()];
  for (const r of rows) r.ctr = ctr(r.clicks, r.impressions);

  /**
   * Vendors with no impressions sort LAST, not first. Their `ctr` is null,
   * which a naive numeric sort would treat as zero and place at the bottom of a
   * descending list beside genuinely poor performers - two very different
   * states. Unmeasured is its own bucket, after every measured one.
   */
  return rows.sort((a, b) => {
    if (a.ctr === null && b.ctr === null) return b.impressions - a.impressions;
    if (a.ctr === null) return 1;
    if (b.ctr === null) return -1;
    return b.ctr - a.ctr;
  });
}

/** Rupees, Indian digit grouping, no decimals. One formatter for all money. */
export function inr(rupees: number): string {
  return `₹${Math.round(rupees).toLocaleString("en-IN")}`;
}
