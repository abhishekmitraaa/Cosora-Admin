import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * TRENDING SEARCHES (2026-10-18; migration 20261018120000_search_trends in textile-spark-net).
 *
 * The buyer's /search page lists "Trending yesterday" (or "this week" / "this month" when yesterday is
 * thin) and the most searched categories. The database computes it every night at 00:10 India time from
 * the searches buyers make on Cosora (admin.search_trends_refresh): a typed term is listed only once at
 * least 3 different visitors searched it, staff don't count, and terms with a phone number, an email or
 * a link never are. The site shows words only; this page shows the counts behind them.
 *
 *   admin_search_trends()                    the list in force, with counts; the hidden terms; recent runs
 *   admin_search_trend_hide(term, reason)    leaves a term (or a category of that name) out of every list
 *   admin_search_trend_unhide(term, reason)  lets it back; the row stays as history
 *
 * Reading: super_admin, support and manager. Hiding: super_admin and support (admin.require_search_trends).
 * A hide or unhide recomputes the list at once and is in the Admin Log with its reason; the site has it in
 * about a minute (the site-config snapshot).
 */

export type TrendWindow = "day" | "week" | "month";

export interface TrendItem {
  rank: number;
  label: string;
  visitors: number;
  /** Visitor-days: (visitor, day) pairs. Over one day it equals visitors. */
  searches: number;
}

export interface HiddenTerm {
  term: string;
  hidden: boolean;
  reason: string;
  updated_at: string;
  updated_by_name: string | null;
}

export interface TrendRun {
  id: number;
  computed_at: string;
  ist_day: string;
  window: TrendWindow;
  window_start?: string;
  source: "job" | "hide" | "unhide" | "manual";
}

export interface RecentRun extends TrendRun {
  terms: number;
  categories: number;
}

export interface SearchTrendsAdmin {
  switch: { enabled: boolean; listed: number } | null;
  /** search_trending_terms (2026-10-18): typed terms reach the site only where this is on. Off: categories only.
   *  Missing before textile-spark-net migration 20261018150000. */
  terms_switch?: { enabled: boolean; listed: number } | null;
  run: TrendRun | null;
  terms: TrendItem[];
  categories: TrendItem[];
  hidden: HiddenTerm[];
  recent_runs: RecentRun[];
}

export const WINDOW_LABEL: Record<TrendWindow, string> = {
  day: "Trending yesterday",
  week: "Trending this week",
  month: "Trending this month",
};

export const RUN_SOURCE_LABEL: Record<TrendRun["source"], string> = {
  job: "Nightly job",
  hide: "After a hide",
  unhide: "After an unhide",
  manual: "Manual",
};

export function useSearchTrends() {
  return useQuery({
    queryKey: ["search-trends"],
    queryFn: async (): Promise<SearchTrendsAdmin> => {
      const { data, error } = await supabase.rpc("admin_search_trends");
      if (error) throw new Error(error.message);
      return data as unknown as SearchTrendsAdmin;
    },
  });
}

function useTrendWrite(rpc: "admin_search_trend_hide" | "admin_search_trend_unhide") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ term, reason }: { term: string; reason: string }) => {
      const { data, error } = await supabase.rpc(rpc, { p_term: term, p_reason: reason });
      if (error) throw new Error(error.message);
      return data as number;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["search-trends"] }),
  });
}

export const useHideTrend = () => useTrendWrite("admin_search_trend_hide");
export const useUnhideTrend = () => useTrendWrite("admin_search_trend_unhide");

/** How the site normalises a term before counting it: lower case, trimmed, one space between words. */
export function normaliseTerm(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
