import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * REQUIREMENT REVIEW (2026-10-17). Mitra: "RFQs should go through the admin panel for approval… usually takes 3–5
 * minutes. If the admin doesn't approve it, they pick a proper reason made in advance (by a manager), and the buyer
 * is notified." A buyer's open requirement is an rfq_submissions row until reviewed; approving copies it into rfqs,
 * where sellers see it (textile-spark-net migration 20261017140000).
 *
 *   admin_rfq_submissions(state)    the queue / the decisions (super_admin, product_moderator, manager)
 *   admin_rfq_pending_count()       the navigation's count
 *   admin_rfq_review(id, decision, reason, note)    approve, or reject with a reason; notifies the buyer
 *   admin_rfq_review_reasons() / admin_rfq_review_reason_save()    the reasons (written by managers, super admins)
 */

export type SubmissionState = "pending" | "approved" | "rejected";

export interface RfqSubmission {
  id: string;
  buyerId: string;
  buyerName: string | null;
  buyerPhoneUnverified: boolean;
  title: string;
  productName: string | null;
  quantity: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  description: string | null;
  images: string[];
  category: string | null;
  attributes: { label: string; value: string }[];
  state: SubmissionState;
  reasonLabel: string | null;
  buyerMessage: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  rfqId: string | null;
  createdAt: string;
}

export interface ReviewReason {
  id: string;
  label: string;
  buyerMessage: string;
  active: boolean;
  sort: number;
  updatedAt: string;
}

/** Buyer-written links are shown only if plain http(s). */
function safeHttp(u: string): string | null {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function label(key: string): string {
  const w = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export async function fetchSubmissions(state: SubmissionState): Promise<RfqSubmission[]> {
  const { data, error } = await supabase.rpc("admin_rfq_submissions", { p_state: state, p_limit: 200 });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const attrs = (r.attributes ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      buyerId: r.buyer_id,
      buyerName: r.buyer_name,
      buyerPhoneUnverified: r.buyer_phone_unverified,
      title: r.title,
      productName: r.product_name,
      quantity: r.quantity,
      budgetMin: r.budget_min,
      budgetMax: r.budget_max,
      description: r.description,
      images: (r.images ?? []).map(safeHttp).filter((u): u is string => u !== null),
      category: r.category,
      attributes: Object.keys(attrs)
        // Answers already shown as their own line (title, quantity, budget, description) aren't repeated.
        .filter((k) => !["quantity", "productName", "description", "budget", "budgetMin", "budgetMax"].includes(k))
        .filter((k) => attrs[k] !== null && attrs[k] !== "" && !(Array.isArray(attrs[k]) && (attrs[k] as unknown[]).length === 0))
        .map((k) => ({ label: label(k), value: Array.isArray(attrs[k]) ? (attrs[k] as unknown[]).join(", ") : String(attrs[k]) })),
      state: r.state as SubmissionState,
      reasonLabel: r.reason_label,
      buyerMessage: r.buyer_message,
      reviewNote: r.review_note,
      reviewedAt: r.reviewed_at,
      reviewerName: r.reviewer_name,
      rfqId: r.rfq_id,
      createdAt: r.created_at,
    };
  });
}

/** How many requirements are waiting; refreshed every 30 s (the promise to buyers is minutes). */
export function useRfqPendingCount(enabled = true) {
  return useQuery({
    queryKey: ["rfq-review", "count"],
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_rfq_pending_count");
      if (error) throw new Error(error.message);
      return (data as number) ?? 0;
    },
  });
}

export async function reviewSubmission(id: string, decision: "approve" | "reject", reasonId?: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc("admin_rfq_review", {
    p_id: id,
    p_decision: decision,
    p_reason_id: reasonId,
    p_note: note?.trim() || undefined,
  });
  if (error) throw new Error(error.message);
}

export async function fetchReasons(): Promise<ReviewReason[]> {
  const { data, error } = await supabase.rpc("admin_rfq_review_reasons");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, label: r.label, buyerMessage: r.buyer_message, active: r.active, sort: r.sort, updatedAt: r.updated_at,
  }));
}

export async function saveReason(r: { id: string | null; label: string; buyerMessage: string; active: boolean }): Promise<void> {
  const { error } = await supabase.rpc("admin_rfq_review_reason_save", {
    p_id: r.id, p_label: r.label, p_buyer_message: r.buyerMessage, p_active: r.active,
  });
  if (error) throw new Error(error.message);
}
