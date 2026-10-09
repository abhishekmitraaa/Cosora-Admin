import { useQuery, useQueryClient } from "@tanstack/react-query";
import { describeWriteError, supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Account managers (subscriptions P9, 2026-10-09): the My vendors workspace.
//
// Everything here is an admin_am_* function in textile-spark-net's migration
// 20261009193949_subscriptions_p9_account_managers, and each checks the caller:
//   * super admins and managers serve every vendor and name a vendor's manager
//     (admin_am_assign);
//   * an account manager serves the vendors they are named for, and the shared team (every
//     entitled vendor with no named manager).
// A vendor's level: 'shared' (Silver), 'named' (Gold), 'vip' (VIP: also the sales concierge and
// the monthly success review). The vendor reads what is written here on their Account manager
// page; a named manager signs with their first name, everyone else as "Cosora account team".
// ─────────────────────────────────────────────────────────────────────────────

export type AmLevel = "shared" | "named" | "vip";
export type AmFilter = "mine" | "shared" | "unassigned" | "all";

export interface AmVendorRow {
  vendor_id: string;
  brand_name: string | null;
  city: string | null;
  level: AmLevel;
  plan_id: string | null;
  status: string | null;
  period_end: string | null;
  auto_renew: boolean | null;
  manager_id: string | null;
  manager_name: string | null;
  unread: number;
  last_message_at: string | null;
  callback: { id: string; date: string; window: "morning" | "afternoon" | "evening" } | null;
  pipeline: { open: number; open_value: number; won_30d: number } | null;
  review_due: boolean;
}

export interface AmMessage {
  id: string;
  author_kind: "vendor" | "staff";
  author_label: string;
  author_name: string | null;
  body: string;
  created_at: string;
}
export interface AmCallback {
  id: string;
  date: string;
  window: "morning" | "afternoon" | "evening";
  note: string | null;
  status: "requested" | "done" | "missed" | "cancelled";
  created_at: string;
}
export interface AmNote {
  id: string;
  kind: "concierge" | "success_review";
  body: string;
  rfq_id: string | null;
  period: string | null;
  author_label: string;
  created_at: string;
}
export interface AmVendorDetail {
  vendor_id: string;
  brand_name: string | null;
  level: AmLevel | "none";
  manager_id: string | null;
  manager_name: string | null;
  you_sign_as: string;
  messages: AmMessage[];
  callbacks: AmCallback[];
  notes: AmNote[];
  history: { manager: string; from: string; to: string | null; by: string | null }[];
}
export interface AmConciergeRow {
  rfq_id: string;
  title: string;
  category: string | null;
  quantity: number | null;
  created_at: string;
  overseas: boolean;
  quoted: boolean;
  noted: boolean;
}

export const WINDOW_LABEL: Record<AmCallback["window"], string> = {
  morning: "Morning (10–1)",
  afternoon: "Afternoon (1–4)",
  evening: "Evening (4–7)",
};
export const LEVEL_LABEL: Record<AmLevel, string> = { shared: "Silver · shared team", named: "Gold · named", vip: "VIP" };

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(describeWriteError(error));
  return data as T;
}

export function useAmVendors(filter: AmFilter) {
  return useQuery({
    queryKey: ["am", "vendors", filter],
    refetchInterval: 60_000,
    queryFn: () => rpc<AmVendorRow[]>("admin_am_vendors", { p_filter: filter }),
  });
}

export function useAmVendor(vendorId: string | null) {
  return useQuery({
    queryKey: ["am", "vendor", vendorId],
    enabled: Boolean(vendorId),
    refetchInterval: 30_000,
    queryFn: () => rpc<AmVendorDetail>("admin_am_vendor", { p_vendor: vendorId }),
  });
}

export function useAmConcierge(vendorId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["am", "concierge", vendorId],
    enabled: Boolean(vendorId) && enabled,
    queryFn: () => rpc<AmConciergeRow[]>("admin_am_concierge", { p_vendor: vendorId }),
  });
}

export function useAmManagers() {
  return useQuery({
    queryKey: ["am", "managers"],
    queryFn: () => rpc<{ id: string; name: string; vendors: number }[]>("admin_am_managers"),
  });
}

export const amSend = (vendorId: string, body: string) => rpc<string>("admin_am_send", { p_vendor: vendorId, p_body: body });
export const amMarkRead = (vendorId: string) => rpc<void>("admin_am_mark_read", { p_vendor: vendorId });
export const amCallbackSet = (id: string, status: "done" | "missed") => rpc<void>("admin_am_callback_set", { p_id: id, p_status: status });
export const amNote = (vendorId: string, kind: AmNote["kind"], body: string, rfqId?: string | null) =>
  rpc<string>("admin_am_note", { p_vendor: vendorId, p_kind: kind, p_body: body, p_rfq: rfqId ?? null });
export const amAssign = (vendorId: string, managerId: string | null) =>
  rpc<void>("admin_am_assign", { p_vendor: vendorId, p_manager: managerId });

export function useAmRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["am"] });
}
