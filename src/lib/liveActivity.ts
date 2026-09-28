import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * LIVE ACTIVITY (admin completion Phase 8, migration 20260928145827 in
 * textile-spark-net).
 *
 * admin_live_activity(minutes) reads the buyer site's own event log
 * (engagement_events, written by log_engagement_event()) and answers in one call:
 *   active_now      visitors in the last 5 minutes
 *   active_window   visitors and events in the chosen window (5 min to 24 h)
 *   per_minute      the last 60 minutes, minute by minute, whatever the window
 *   by_type         events per type in the window
 *   top_products, top_vendors, top_searches   the window's top 5 / 5 / 10
 *
 * A visitor is a signed-in account, or a signed-out browser tab session. A search
 * shows only when at least 3 different visitors typed it: a rare search can identify
 * the person who typed it. Every active admin role reads it (section "traction").
 */

export interface VisitorCounts {
  visitors: number;
  signed_in: number;
  guests: number;
}

export interface LiveActivity {
  generated_at: string;
  window_minutes: number;
  active_now: VisitorCounts;
  active_window: VisitorCounts & { events: number };
  per_minute: { minute: string; events: number; visitors: number }[];
  by_type: Partial<Record<EventType, number>>;
  top_products: { id: string; name: string | null; vendor: string | null; views: number; visitors: number }[];
  top_vendors: { id: string; name: string | null; actions: number; visitors: number }[];
  top_searches: { query: string; visitors: number }[];
}

export type EventType =
  | "product_view"
  | "profile_view"
  | "search_impression"
  | "search_click"
  | "ad_impression"
  | "ad_click"
  | "cta_click";

/** In the order the page lists them: buyer actions first, then impressions. */
export const EVENT_LABELS: [EventType, string][] = [
  ["product_view", "Product views"],
  ["profile_view", "Storefront views"],
  ["search_click", "Search result clicks"],
  ["ad_click", "Ad clicks"],
  ["cta_click", "Button taps (call, message, WhatsApp)"],
  ["search_impression", "Sellers shown in search results"],
  ["ad_impression", "Ad impressions"],
];

export const WINDOWS = [
  { minutes: 15, label: "Last 15 minutes" },
  { minutes: 60, label: "Last hour" },
  { minutes: 360, label: "Last 6 hours" },
  { minutes: 1440, label: "Last 24 hours" },
] as const;

export const LIVE_REFRESH_MS = 30_000;

/**
 * Asked again every 30 seconds while the tab is visible. React Query stops the timer
 * in a hidden tab (refetchIntervalInBackground is false), so a panel left open
 * overnight costs nothing.
 */
export function useLiveActivity(minutes: number) {
  return useQuery({
    queryKey: ["live-activity", minutes],
    queryFn: async (): Promise<LiveActivity> => {
      const { data, error } = await supabase.rpc("admin_live_activity", { p_minutes: minutes });
      if (error) throw new Error(error.message);
      return data as unknown as LiveActivity;
    },
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
  });
}
