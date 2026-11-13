import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Seller registrations and premises photos waiting on Cosora (2026-11-13; buyer repo migrations
// 20261113100000_vendor_registration_core and 20261113100300_registration_admin).
//
// Every read and decision is a definer RPC that checks the caller's role itself: the pages only hide buttons.
// Queues are read oldest first, 50 at a time, by keyset (waiting_since, id), so a long queue never loads whole.
// ─────────────────────────────────────────────────────────────

export const QUEUE_PAGE = 50;
/** A registration or document waiting longer than this many days is overdue (Mitra: 3–5 days promised). */
export const OVERDUE_DAYS = 5;

export interface QueueCounts { approval: number; documents: number; photos: number; overdue: number }

/** Counts for the nav and the Registrations tabs; refreshed every minute. */
export function useRegistrationCounts(enabled = true) {
  return useQuery({
    queryKey: ["registrations", "counts"],
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<QueueCounts> => {
      const { data, error } = await supabase.rpc("admin_registration_queue_counts");
      if (error) throw new Error(error.message);
      const c = (data ?? {}) as Partial<QueueCounts>;
      return { approval: c.approval ?? 0, documents: c.documents ?? 0, photos: c.photos ?? 0, overdue: c.overdue ?? 0 };
    },
  });
}

export type QueueKind = "approval" | "documents";

export interface RegistrationQueueRow {
  vendor_id: string;
  brand_name: string | null;
  country_code: string | null;
  kind: QueueKind;
  waiting_since: string;
  days_waiting: number;
  pending_docs: number;
  submission_id: string | null;
}

export interface Cursor { at: string; id: string }

export async function fetchRegistrationQueue(kind: QueueKind, after: Cursor | null): Promise<RegistrationQueueRow[]> {
  const { data, error } = await supabase.rpc("admin_registration_queue", {
    p_kind: kind,
    p_limit: QUEUE_PAGE,
    p_after: after?.at ?? undefined,
    p_after_id: after?.id ?? undefined,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RegistrationQueueRow[];
}

const DECIDE_ERRORS: Record<string, string> = {
  not_pending: "This registration isn't waiting any more, or the seller sent a newer one. Reload and review it again.",
  no_contract: "The seller hasn't signed the Supplier Agreement, so the registration can't be approved yet.",
};

/**
 * Approve or reject an overseas registration: the submission the admin reviewed, so a stale screen can't approve a
 * newer one nobody looked at. A rejection needs a reason the seller can act on.
 */
export async function decideRegistration(vendorId: string, submissionId: string, approve: boolean, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc("admin_vendor_registration_decide", {
    p_vendor: vendorId,
    p_submission: submissionId,
    p_approve: approve,
    // Always sent: p_reason has no default, so leaving it out matches no function. Empty reads as none.
    p_reason: reason?.trim() ?? "",
  });
  if (error) throw new Error(DECIDE_ERRORS[error.message] ?? error.message);
}

export interface PhotoQueueRow { id: string; vendor_id: string; brand_name: string | null; url: string; created_at: string }

export async function fetchPhotoQueue(after: Cursor | null): Promise<PhotoQueueRow[]> {
  const { data, error } = await supabase.rpc("admin_premises_photo_queue", {
    p_limit: QUEUE_PAGE,
    p_after: after?.at ?? undefined,
    p_after_id: after?.id ?? undefined,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as PhotoQueueRow[];
}

/**
 * Approved photos, most recently reviewed first, so one can be pulled down later (the review function accepts
 * rejecting a live photo). vendor_premises_photos' read policy admits the photo roles; keyset on (reviewed_at, id).
 */
export async function fetchApprovedPhotos(after: Cursor | null): Promise<PhotoQueueRow[]> {
  let q = supabase
    .from("vendor_premises_photos")
    .select("id, vendor_id, url, created_at, reviewed_at")
    .eq("status", "live")
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(QUEUE_PAGE);
  if (after) q = q.or(`reviewed_at.lt.${after.at},and(reviewed_at.eq.${after.at},id.lt.${after.id})`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; vendor_id: string; url: string; created_at: string; reviewed_at: string | null }[];
  const ids = [...new Set(rows.map((r) => r.vendor_id))];
  const names = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: v, error: ve } = await supabase.from("vendor_profiles").select("id, brand_name").in("id", ids.slice(i, i + 100));
    if (ve) throw new Error(ve.message);
    for (const x of v ?? []) names.set(x.id, x.brand_name);
  }
  return rows.map((r) => ({
    id: r.id, vendor_id: r.vendor_id, url: r.url, brand_name: names.get(r.vendor_id) ?? null,
    // The cursor field for this list: when it was approved.
    created_at: r.reviewed_at ?? r.created_at,
  }));
}

/** Approve a premises photo (it reaches the store) or reject it with a reason the seller sees. */
export async function reviewPhoto(photoId: string, approve: boolean, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc("admin_premises_photo_review", {
    p_photo: photoId,
    p_approve: approve,
    p_reason: reason?.trim() ?? "",
  });
  if (error) throw new Error(error.message);
}

export interface VendorRegistration {
  id: string;
  country_code: string;
  status: "pending_review" | "registered" | "rejected";
  reason: string | null;
  created_at: string;
  decided_at: string | null;
}

/** A seller's latest registration (vendor_registrations' read policy admits super admin, vendor ops and support). */
export function useVendorRegistration(vendorId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["registrations", "vendor", vendorId],
    enabled: Boolean(vendorId) && enabled,
    queryFn: async (): Promise<VendorRegistration | null> => {
      const { data, error } = await supabase
        .from("vendor_registrations")
        .select("id, country_code, status, reason, created_at, decided_at")
        .eq("vendor_id", vendorId as string)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as VendorRegistration | null) ?? null;
    },
  });
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/** "United Arab Emirates (AE)"; the code alone when the browser can't name it. */
export function countryLabel(code: string | null | undefined): string {
  if (!code) return "Not given";
  const name = regionNames?.of(code);
  return name && name !== code ? `${name} (${code})` : code;
}
