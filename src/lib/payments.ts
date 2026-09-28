import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

/**
 * THE PAYMENTS LEDGER (admin completion Phase 5, migration 20260928043917 in
 * textile-spark-net).
 *
 * One row per money movement, from admin.payment_entries:
 *   - a subscription invoice (the payment);
 *   - its refund, as a negative row of its own;
 *   - a subscription checkout that never completed;
 *   - an ad or certificate order.
 *
 * Every amount is in PAISE. The database converts the invoice rupees, so nothing
 * here multiplies by 100. The summary uses Reports' definitions
 * (admin_report_summary), so the two pages agree over the same window.
 *
 * Readable by super_admin, finance_admin and support: the RPCs refuse everyone
 * else, whatever roles.ts renders.
 */

type GeneratedRow = Database["public"]["Functions"]["admin_payments_ledger"]["Returns"][number];

/**
 * One ledger row. The generated type calls every column non-null; these can be
 * null (a vendor since deleted, a row with no GST line, no gateway id yet).
 */
export type LedgerRow = Omit<
  GeneratedRow,
  "vendor_id" | "vendor_name" | "vendor_city" | "net_paise" | "gst_paise" | "gateway_ref"
> & {
  vendor_id: string | null;
  vendor_name: string | null;
  vendor_city: string | null;
  net_paise: number | null;
  gst_paise: number | null;
  gateway_ref: string | null;
};

export type LedgerKind = "subscription" | "ad_purchase" | "certificate" | "refund";
export type LedgerStatus = "paid" | "pending" | "abandoned" | "failed" | "review" | "refunded";

export const KIND_LABELS: Record<LedgerKind, string> = {
  subscription: "Subscription",
  ad_purchase: "Ad purchase",
  certificate: "Certificate",
  refund: "Refund",
};

/** What each status means, for the filter and the legend. */
export const STATUS_HELP: Record<LedgerStatus, string> = {
  paid: "money captured",
  pending: "a checkout under 24 hours old, or a refund the gateway hasn't settled",
  abandoned: "a checkout left unpaid for 24 hours",
  failed: "a payment or refund that failed",
  review: "an ad order paid but not fulfilled: refund it by hand",
  refunded: "money returned to the vendor",
};

export interface LedgerFilters {
  kind: LedgerKind | "all";
  status: LedgerStatus | "all";
  /** yyyy-mm-dd, an IST day, inclusive. Empty means no bound. */
  from: string;
  to: string;
  search: string;
}

export const NO_FILTERS: LedgerFilters = { kind: "all", status: "all", from: "", to: "", search: "" };

/** What admin_payments_summary() returns. Money is in paise. */
export interface PaymentsSummary {
  generated_at: string;
  entries: number;
  paid: number;
  pending: number;
  abandoned: number;
  failed: number;
  review: number;
  refunds: number;
  paid_paise: number;
  subscriptions_net_paise: number;
  gst_paise: number;
  ads_paise: number;
  refunded_paise: number;
  review_paise: number;
  unverified_paise: number;
  unverified: number;
}

const IST = "+05:30";
const DAY_MS = 86_400_000;

/**
 * Filters as RPC arguments. A date is a whole IST day: `from` starts at its
 * 00:00 IST and `to` ends at the next day's 00:00 IST, exclusive, which is how
 * Reports groups days (Asia/Kolkata). An empty field is no bound, not the epoch.
 */
function rpcArgs(f: LedgerFilters) {
  return {
    p_kinds: f.kind === "all" ? undefined : [f.kind],
    p_statuses: f.status === "all" ? undefined : [f.status],
    p_from: f.from ? new Date(`${f.from}T00:00:00${IST}`).toISOString() : undefined,
    p_to: f.to ? new Date(new Date(`${f.to}T00:00:00${IST}`).getTime() + DAY_MS).toISOString() : undefined,
    p_search: f.search.trim() || undefined,
  };
}

export const LEDGER_PAGE = 50;

interface Cursor {
  at: string;
  key: string;
}

/** The ledger, newest first, 50 rows a page, paged by (occurred_at, entry_key). */
export function useLedger(filters: LedgerFilters) {
  return useInfiniteQuery({
    queryKey: ["payments-ledger", filters],
    initialPageParam: null as Cursor | null,
    queryFn: async ({ pageParam }): Promise<LedgerRow[]> => {
      const { data, error } = await supabase.rpc("admin_payments_ledger", {
        ...rpcArgs(filters),
        p_cursor_at: pageParam?.at,
        p_cursor_key: pageParam?.key,
        p_limit: LEDGER_PAGE,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as LedgerRow[];
    },
    getNextPageParam: (last): Cursor | undefined =>
      last.length === LEDGER_PAGE
        ? { at: last[last.length - 1].occurred_at, key: last[last.length - 1].entry_key }
        : undefined,
  });
}

/** Totals for exactly the rows the filters select. */
export function usePaymentsSummary(filters: LedgerFilters) {
  return useQuery({
    queryKey: ["payments-summary", filters],
    queryFn: async (): Promise<PaymentsSummary> => {
      const { data, error } = await supabase.rpc("admin_payments_summary", rpcArgs(filters));
      if (error) throw new Error(error.message);
      return data as unknown as PaymentsSummary;
    },
  });
}

/** How many rows the Latest strip holds, and how often it asks again. */
export const LATEST_COUNT = 20;
export const LATEST_REFRESH_MS = 30_000;

/**
 * The most recent rows, unfiltered, asked again every 30 seconds. React Query
 * stops the timer while the tab is hidden (refetchIntervalInBackground is
 * false), so an admin tab left open overnight costs nothing.
 */
export function useLatestPayments() {
  return useQuery({
    queryKey: ["payments-latest"],
    queryFn: async (): Promise<LedgerRow[]> => {
      const { data, error } = await supabase.rpc("admin_payments_ledger", { p_limit: LATEST_COUNT });
      if (error) throw new Error(error.message);
      return (data ?? []) as LedgerRow[];
    },
    refetchInterval: LATEST_REFRESH_MS,
    refetchIntervalInBackground: false,
  });
}
