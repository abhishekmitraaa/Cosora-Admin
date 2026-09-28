import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

/**
 * CUSTOMERS (admin completion Phase 6, migration 20260928070410 in
 * textile-spark-net).
 *
 * admin.customer_summary is a materialized view: one row per account that isn't
 * deleted and isn't active Cosora staff. It holds joined / last-active times, an
 * interaction count and lifetime spend in paise. admin_customer_refresh()
 * rebuilds it at most once every 10 minutes: the page asks on open, and there is
 * no scheduled job. Segments are computed at read time from the stored times, so
 * they're never stale. Tags are live tables, so a tag change shows at once.
 *
 * Read: super_admin, support, finance_admin. Tags: super_admin, support.
 */

type GeneratedRow = Database["public"]["Functions"]["admin_customer_list"]["Returns"][number];

/** One customer. The generated type calls every column non-null; these can be null. */
export type CustomerRow = Omit<GeneratedRow, "email" | "city" | "last_active_at" | "tags" | "segments"> & {
  email: string | null;
  city: string | null;
  last_active_at: string | null;
  segments: Segment[];
  tags: { id: string; label: string }[];
};

export type CustomerKind = "buyer" | "vendor";
export type Segment = "new" | "active" | "high_value" | "at_risk" | "dormant" | "never_transacted";
export type CustomerSort = "spend" | "recent" | "joined" | "name";

export const SEGMENT_LABELS: Record<Segment, string> = {
  new: "New this month",
  active: "Active",
  high_value: "High value",
  at_risk: "At risk",
  dormant: "Dormant",
  never_transacted: "Never transacted",
};

/**
 * What each segment means. These sentences are the rules admin.customer_rows
 * computes; change one only together with the view.
 */
export const SEGMENT_RULES: Record<Segment, string> = {
  new: "Joined within the last 30 days.",
  active: "Sent a message, posted an RFQ or quoted within the last 30 days.",
  high_value: "Lifetime spend of ₹25,000 or more.",
  at_risk: "Last message, RFQ or quote was 60 to 120 days ago.",
  dormant: "Nothing at all, sign-ins included, for more than 120 days.",
  never_transacted: "Has never paid Cosora anything.",
};

export const SORT_LABELS: Record<CustomerSort, string> = {
  spend: "Lifetime spend",
  recent: "Last seen",
  joined: "Newest",
  name: "Name",
};

export interface CustomerFilters {
  kind: CustomerKind | "all";
  segment: Segment | "all";
  tag: string;
  search: string;
  sort: CustomerSort;
}

export const NO_FILTERS: CustomerFilters = { kind: "all", segment: "all", tag: "all", search: "", sort: "spend" };

export interface SegmentCounts {
  customers: number;
  vendors: number;
  buyers: number;
  new: number;
  active: number;
  high_value: number;
  at_risk: number;
  dormant: number;
  never_transacted: number;
  spend_paise: number;
  refreshed_at: string;
}

export interface CustomerTag {
  id: string;
  label: string;
  uses: number;
}

export const CUSTOMER_PAGE = 50;

/** The customer list, 50 rows at a time. Each row carries the filtered totals. */
export function useCustomerList(f: CustomerFilters) {
  return useInfiniteQuery({
    queryKey: ["customers", "list", f],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<CustomerRow[]> => {
      const { data, error } = await supabase.rpc("admin_customer_list", {
        p_kind: f.kind === "all" ? undefined : f.kind,
        p_segment: f.segment === "all" ? undefined : f.segment,
        p_tag: f.tag === "all" ? undefined : f.tag,
        p_search: f.search.trim() || undefined,
        p_sort: f.sort,
        p_offset: pageParam,
        p_limit: CUSTOMER_PAGE,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CustomerRow[];
    },
    getNextPageParam: (last, pages) => (last.length === CUSTOMER_PAGE ? pages.length * CUSTOMER_PAGE : undefined),
  });
}

export function useSegmentCounts() {
  return useQuery({
    queryKey: ["customers", "counts"],
    queryFn: async (): Promise<SegmentCounts> => {
      const { data, error } = await supabase.rpc("admin_customer_segment_counts");
      if (error) throw new Error(error.message);
      return data as unknown as SegmentCounts;
    },
  });
}

export function useCustomerTags() {
  return useQuery({
    queryKey: ["customers", "tags"],
    queryFn: async (): Promise<CustomerTag[]> => {
      const { data, error } = await supabase.rpc("admin_customer_tags");
      if (error) throw new Error(error.message);
      return (data ?? []) as CustomerTag[];
    },
  });
}

/**
 * Rebuild the summary. The database refuses to do it more than once every 10
 * minutes (and answers with the current data's time instead), so calling this
 * on every visit costs nothing when the data is fresh.
 */
export function useRefreshCustomers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ refreshed: boolean; refreshed_at: string; reason?: string }> => {
      const { data, error } = await supabase.rpc("admin_customer_refresh");
      if (error) throw new Error(error.message);
      return data as unknown as { refreshed: boolean; refreshed_at: string; reason?: string };
    },
    onSuccess: (r) => {
      if (r.refreshed) void qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

/** Tag writes, each followed by a refetch of the tags and the list. */
export function useTagWrites() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["customers"] });
  return {
    create: useMutation({
      mutationFn: async (label: string) => {
        const { error } = await supabase.rpc("admin_customer_tag_create", { p_label: label });
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (tagId: string) => {
        const { error } = await supabase.rpc("admin_customer_tag_delete", { p_tag_id: tagId });
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
    apply: useMutation({
      mutationFn: async (v: { profileId: string; tagId: string }) => {
        const { error } = await supabase.rpc("admin_customer_tag_apply", { p_profile_id: v.profileId, p_tag_id: v.tagId });
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
    unapply: useMutation({
      mutationFn: async (v: { profileId: string; tagId: string }) => {
        const { error } = await supabase.rpc("admin_customer_tag_remove", { p_profile_id: v.profileId, p_tag_id: v.tagId });
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
  };
}

/** The label rule admin_customer_tag_create() enforces, checked before sending. */
export const TAG_LABEL_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
