import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { describeWriteError, supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Subscriptions admin tooling (subscriptions P12, 2026-10-09; textile-spark-net's
// 20261009194403_subscriptions_p12_admin_tooling).
//
// - KPIs: admin_subscription_kpis(), one set-based read.
// - Worklists: admin_subscription_worklist(view, days, plan, search), one row per vendor,
//   paged by (sort_at, vendor_id).
// - Prices: subscription_plan_prices keeps every price and the change waiting for its day;
//   admin_plan_price_set() applies now or schedules it for a date's morning billing run
//   (about 9:00 IST), which copies it into subscription_plans, so checkout and the plans
//   page always agree. Orders already made and autopay mandates keep their own price.
// - Complimentary plans: admin_subscription_grant(), no charge and no invoice; refused over
//   a paid period or autopay.
// Reading is for super_admin, finance_admin and support; prices and grants for super_admin
// and finance_admin (the database says the same).
// ─────────────────────────────────────────────────────────────

/** The function isn't there (the migration isn't applied) or the role can't read it. */
const absent = (code?: string) => code === "PGRST202" || code === "42501" || code === "42883";

export interface SubscriptionKpis {
  as_of: string;
  running: number;
  in_grace: number;
  by_plan: Record<string, number>;
  granted: number;
  expiring_7d: number;
  expiring_7d_manual: number;
  expiring_30d: number;
  autopay_on: number;
  /** A month's recurring revenue in rupees, before GST, by money mode. */
  mrr_live: number;
  mrr_test: number;
  billed: number;
  lapsed_30d: number;
  mandates_pending: number;
  mandates_halted: number;
  failed_payments_7d: number;
  open_incidents: number;
  delivery_7d: Record<string, Partial<Record<"queued" | "sending" | "sent" | "failed" | "skipped", number>>>;
}

export function useSubscriptionKpis() {
  return useQuery({
    queryKey: ["subscription-kpis"],
    queryFn: async (): Promise<SubscriptionKpis | null> => {
      const { data, error } = await supabase.rpc("admin_subscription_kpis");
      if (error) {
        if (absent(error.code)) return null;
        throw new Error(error.message);
      }
      return data as unknown as SubscriptionKpis;
    },
    staleTime: 60_000,
  });
}

export type WorklistView = "all" | "expiring" | "grace" | "autopay_trouble" | "granted" | "downgrade" | "lapsed";

export interface WorklistRow {
  /** The subscription; null for a vendor whose first payment failed (no subscription yet). */
  id: string | null;
  vendor_id: string;
  brand_name: string | null;
  city: string | null;
  plan_id: string | null;
  billing_cycle: string | null;
  status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  auto_renew: boolean | null;
  scheduled_plan_id: string | null;
  scheduled_from: string | null;
  created_at: string | null;
  sort_at: string | null;
  grace_until: string | null;
  mandate_status: string | null;
  granted: boolean;
  last_failed_at: string | null;
}

export const WORKLIST_PAGE = 50;

/** null data: the worklist function isn't there yet (the page falls back to the plain list). */
export function useSubscriptionWorklist(view: WorklistView, days: number, plan: string | null, search: string) {
  return useInfiniteQuery({
    queryKey: ["subscription-worklist", view, days, plan, search],
    initialPageParam: null as { at: string; vendor: string } | null,
    queryFn: async ({ pageParam }): Promise<WorklistRow[] | null> => {
      const { data, error } = await supabase.rpc("admin_subscription_worklist", {
        p_view: view,
        p_days: days,
        p_plan: plan ?? undefined,
        p_search: search.trim() || undefined,
        p_after_at: pageParam?.at,
        p_after_vendor: pageParam?.vendor,
        p_limit: WORKLIST_PAGE,
      });
      if (error) {
        if (absent(error.code)) return null;
        throw new Error(error.message);
      }
      return (data ?? []) as unknown as WorklistRow[];
    },
    getNextPageParam: (last) => {
      if (!last || last.length < WORKLIST_PAGE) return undefined;
      const row = last[last.length - 1];
      return row.sort_at ? { at: row.sort_at, vendor: row.vendor_id } : undefined;
    },
  });
}

export interface PlanPriceRow {
  id: string;
  plan_id: string;
  monthly_price: number;
  yearly_price: number;
  effective_from: string;
  status: "scheduled" | "applied" | "canceled";
  applied_at: string | null;
  previous_monthly: number | null;
  previous_yearly: number | null;
  reason: string;
  created_at: string;
}

export interface PlanWithPrice {
  id: string;
  name: string;
  monthly_price: number;
  yearly_price: number;
}

/** The plans with today's prices, and their price history (newest first); null before P12. */
export function usePlanPrices() {
  return useQuery({
    queryKey: ["plan-prices"],
    queryFn: async (): Promise<{ plans: PlanWithPrice[]; history: PlanPriceRow[] } | null> => {
      const [plans, history] = await Promise.all([
        supabase.from("subscription_plans").select("id, name, monthly_price, yearly_price").order("sort_order"),
        supabase
          .from("subscription_plan_prices")
          .select("id, plan_id, monthly_price, yearly_price, effective_from, status, applied_at, previous_monthly, previous_yearly, reason, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (plans.error) throw new Error(plans.error.message);
      if (history.error) {
        if (history.error.code === "42P01" || history.error.code === "PGRST205") return null;
        throw new Error(history.error.message);
      }
      return { plans: plans.data ?? [], history: (history.data ?? []) as PlanPriceRow[] };
    },
  });
}

export async function setPlanPrice(args: { plan: string; monthly: number; yearly: number; effective: string | null; reason: string }) {
  const { data, error } = await supabase.rpc("admin_plan_price_set", {
    p_plan: args.plan,
    p_monthly: args.monthly,
    p_yearly: args.yearly,
    p_effective: args.effective ?? undefined,
    p_reason: args.reason,
  });
  if (error) throw new Error(describeWriteError(error));
  return data as unknown as { id: string; status: "applied" | "scheduled"; effective_from: string; replaced: string | null };
}

export async function cancelPlanPrice(id: string, reason: string) {
  const { error } = await supabase.rpc("admin_plan_price_cancel", { p_id: id, p_reason: reason });
  if (error) throw new Error(describeWriteError(error));
}

export async function grantPlan(args: { vendorId: string; plan: string; until: string; reason: string }) {
  const { data, error } = await supabase.rpc("admin_subscription_grant", {
    p_vendor: args.vendorId,
    p_plan: args.plan,
    p_until: args.until,
    p_reason: args.reason,
  });
  if (error) throw new Error(describeWriteError(error));
  return data as unknown as { ok: boolean; ends_at: string; vendor: string; plan: string };
}

export interface VendorHit { id: string; brand_name: string | null; city: string | null; plan_id: string | null }

/** Vendors whose brand name has the text in it, for picking one (8 at most). */
export async function searchVendors(text: string): Promise<VendorHit[]> {
  const q = text.trim();
  if (q.length < 2) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await supabase
    .from("vendor_profiles")
    .select("id, brand_name, city, plan_id")
    .ilike("brand_name", pattern)
    .order("brand_name")
    .limit(8);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** "₹1,499" */
export const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Today in India as yyyy-mm-dd, for date inputs (the database counts days in IST). */
export function todayIST(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}
