import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assertWrote, supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

/**
 * LEADS: THE RFQ PIPELINE (admin completion Phase 7, migration 20260928071643 in
 * textile-spark-net).
 *
 * admin.lead_rows gives every RFQ one stage:
 *   new         active, no quote yet, under 24 hours old
 *   unanswered  active, no quote, 24 hours or older ("overdue" from 48 hours)
 *   quoted      active, at least one quote, none accepted
 *   won         a quote was accepted
 *   closed      no longer active, none accepted
 *   removed     taken down by an admin (admin_lead_remove), whatever its stage was;
 *               checked first (RFQ/leads R3, migration 20261003090200 in textile-spark-net)
 * An RFQ addressed to one vendor is "direct". Readable by super_admin, vendor_ops,
 * product_moderator, support. super_admin and product_moderator may remove a lead
 * (with a reason the buyer reads) or flag it; the database checks the role again.
 */

type GeneratedRow = Database["public"]["Functions"]["admin_leads_list"]["Returns"][number];

/** One RFQ. The generated type calls every column non-null; these can be null. */
export type LeadRow = Omit<
  GeneratedRow,
  | "category" | "quantity" | "budget_min" | "budget_max" | "target_vendor_id" | "target_vendor_name"
  | "first_quote_at" | "accepted_vendor_id" | "accepted_vendor_name"
> & {
  category: string | null;
  quantity: number | null;
  budget_min: number | null;
  budget_max: number | null;
  target_vendor_id: string | null;
  target_vendor_name: string | null;
  first_quote_at: string | null;
  accepted_vendor_id: string | null;
  accepted_vendor_name: string | null;
};

export type LeadStage = "new" | "unanswered" | "quoted" | "won" | "closed" | "removed";
export type StageFilter = LeadStage | "overdue" | "all";

export const STAGE_LABELS: Record<LeadStage | "overdue", string> = {
  new: "New",
  unanswered: "Unanswered",
  overdue: "Overdue",
  quoted: "Quoted",
  won: "Won",
  closed: "Closed",
  removed: "Removed",
};

export const STAGE_RULES: Record<LeadStage | "overdue", string> = {
  new: "Active, no quote yet, under 24 hours old.",
  unanswered: "Active, no quote, 24 hours or older.",
  overdue: "Unanswered for 48 hours or more.",
  quoted: "At least one quote, none accepted yet.",
  won: "The buyer accepted a quote.",
  closed: "Closed by the buyer without accepting a quote.",
  removed: "Taken down by Cosora, with a reason the buyer reads.",
};

export interface LeadFilters {
  stage: StageFilter;
  /** "all" | "marketplace" | "direct" */
  audience: "all" | "marketplace" | "direct";
  minAgeHours: number | null;
  search: string;
}

export const NO_FILTERS: LeadFilters = { stage: "all", audience: "all", minAgeHours: null, search: "" };

export interface LeadsSummary {
  generated_at: string;
  days: number | null;
  open: { new: number; unanswered: number; overdue: number; quoted: number };
  window: {
    rfqs: number;
    direct: number;
    won: number;
    closed: number;
    removed: number;
    answered: number;
    median_first_quote_hours: number | null;
    eligible_24h: number;
    answered_24h: number;
  };
}

export interface LeadDetail {
  id: string;
  created_at: string;
  title: string;
  product_name: string | null;
  category: string | null;
  quantity: number | null;
  budget_min: number | null;
  budget_max: number | null;
  description: string | null;
  images: string[];
  rfq_status: string;
  stage: LeadStage;
  overdue: boolean;
  direct: boolean;
  buyer: { id: string; name: string };
  target_vendor: { id: string; name: string | null } | null;
  /** Set when an admin removed the RFQ; `by` is the admin's name. */
  removal: { at: string; by: string | null; reason: string } | null;
  quotes: {
    id: string;
    vendor_id: string;
    vendor_name: string | null;
    currency: string;
    price_per_unit: number | null;
    price_inr: number | null;
    moq: number | null;
    lead_time: string | null;
    status: string;
    created_at: string;
  }[];
}

export const LEADS_PAGE = 50;

interface Cursor {
  at: string;
  id: string;
}

export function useLeads(f: LeadFilters) {
  return useInfiniteQuery({
    queryKey: ["leads", "list", f],
    initialPageParam: null as Cursor | null,
    queryFn: async ({ pageParam }): Promise<LeadRow[]> => {
      const { data, error } = await supabase.rpc("admin_leads_list", {
        p_stage: f.stage === "all" ? undefined : f.stage,
        p_direct: f.audience === "all" ? undefined : f.audience === "direct",
        p_min_age_hours: f.minAgeHours ?? undefined,
        p_search: f.search.trim() || undefined,
        p_cursor_at: pageParam?.at,
        p_cursor_id: pageParam?.id,
        p_limit: LEADS_PAGE,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as LeadRow[];
    },
    getNextPageParam: (last): Cursor | undefined =>
      last.length === LEADS_PAGE ? { at: last[last.length - 1].created_at, id: last[last.length - 1].id } : undefined,
  });
}

export function useLeadsSummary(days: number | null) {
  return useQuery({
    queryKey: ["leads", "summary", days],
    queryFn: async (): Promise<LeadsSummary> => {
      const { data, error } = await supabase.rpc("admin_leads_summary", { p_days: days ?? undefined });
      if (error) throw new Error(error.message);
      return data as unknown as LeadsSummary;
    },
  });
}

export function useLeadDetail(id: string | null) {
  return useQuery({
    queryKey: ["leads", "detail", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<LeadDetail> => {
      const { data, error } = await supabase.rpc("admin_lead_detail", { p_rfq_id: id! });
      if (error) throw new Error(error.message);
      return data as unknown as LeadDetail;
    },
  });
}

/** Take a lead down (super_admin, product_moderator). The reason is shown to the buyer. */
export function useRemoveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      assertWrote(await supabase.rpc("admin_lead_remove", { p_rfq_id: id, p_reason: reason.trim() }), "remove lead");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

/** Hours between two ISO times, rounded for display ("3 h", "2.5 d"). */
export function hoursBetween(fromIso: string, toIso: string): string {
  const h = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 3_600_000;
  if (h < 48) return `${Math.max(0, Math.round(h))} h`;
  return `${(h / 24).toFixed(1).replace(/\.0$/, "")} d`;
}
