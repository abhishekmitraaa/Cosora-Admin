import { supabase } from "@/lib/supabase";

/**
 * Physical verification-certificate fulfilment — REAL DATA.
 *
 * Replaces src/lib/devSeed/certificates.ts, which carried nine invented orders
 * for invented mills and wrote to a local store. That file's header said the
 * whole screen was "BUILT PENDING ANDY'S CONFIRMATION that certificates are a
 * physical, printed-and-couriered product". Mitra confirmed exactly that on
 * 2026-09-13, so the assumption became a requirement and the table now exists
 * (migration 20260913130000_certificate_orders.sql).
 *
 * The status vocabulary, the pipeline order and the courier list below are
 * unchanged from the dev-seed module on purpose: the screen's tabs and its
 * forward-only workflow were already right, and only the data source moved.
 *
 * Every write goes through a SECURITY DEFINER RPC that checks the caller's role
 * inside itself and RAISES. There is no UPDATE policy on certificate_orders for
 * any role, so a bare client UPDATE would match zero rows and PostgREST would
 * report SUCCESS — a clerk would read "marked dispatched" on a parcel nothing
 * had happened to.
 */

export type CertStatus =
  | "processing"
  | "printed"
  | "dispatched"
  | "delivered"
  | "returned"
  | "cancelled";

export const CERT_STATUS_LABELS: Record<CertStatus, string> = {
  processing: "Processing",
  printed: "Printed",
  dispatched: "Dispatched",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
};

/**
 * The forward path, in order. A status can only move to the next one, or to
 * `cancelled` / `returned`, which is why this is a list and not a free choice:
 * a certificate that goes from "delivered" back to "processing" is a data entry
 * mistake, not a workflow. The database enforces the same table — this copy
 * only decides which button to show.
 */
export const CERT_PIPELINE: CertStatus[] = ["processing", "printed", "dispatched", "delivered"];

/** What the next forward step is, or null at the end of the pipeline. */
export function nextStatus(current: CertStatus): CertStatus | null {
  const i = CERT_PIPELINE.indexOf(current);
  if (i === -1 || i === CERT_PIPELINE.length - 1) return null;
  return CERT_PIPELINE[i + 1];
}

export const COURIERS = ["Blue Dart", "Delhivery", "DTDC", "India Post Speed Post", "Ekart", "Xpressbees"];

export interface CertificateOrder {
  id: string;
  reference: string;
  vendorId: string;
  adId: string | null;
  vendorName: string | null;
  /** Snapshot taken at purchase, not a live read of the vendor profile. */
  contactName: string | null;
  contactPhone: string | null;
  addressLine: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  status: CertStatus;
  courier: string | null;
  trackingNumber: string | null;
  /** Set when a parcel comes back or an order is cancelled, so the tab shows why. */
  returnReason: string | null;
  purchasedAt: string;
  printedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
}

interface RawCertificateOrder {
  id: string; reference: string; vendor_id: string; ad_id: string | null;
  vendor_name: string | null; contact_name: string | null; contact_phone: string | null;
  address_line: string | null; area: string | null; city: string | null;
  state: string | null; postal_code: string | null;
  status: string; courier: string | null; tracking_number: string | null;
  return_reason: string | null; purchased_at: string;
  printed_at: string | null; dispatched_at: string | null; delivered_at: string | null;
}

function mapOrder(r: RawCertificateOrder): CertificateOrder {
  return {
    id: r.id, reference: r.reference, vendorId: r.vendor_id, adId: r.ad_id,
    vendorName: r.vendor_name, contactName: r.contact_name, contactPhone: r.contact_phone,
    addressLine: r.address_line, area: r.area, city: r.city, state: r.state,
    postalCode: r.postal_code, status: r.status as CertStatus,
    courier: r.courier, trackingNumber: r.tracking_number, returnReason: r.return_reason,
    purchasedAt: r.purchased_at, printedAt: r.printed_at,
    dispatchedAt: r.dispatched_at, deliveredAt: r.delivered_at,
  };
}

/** Oldest first: the parcel that has been waiting longest is the one to action. */
export async function fetchCertificateOrders(): Promise<CertificateOrder[]> {
  const { data, error } = await supabase
    .from("certificate_orders")
    .select("*")
    .order("purchased_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as RawCertificateOrder[]).map(mapOrder);
}

/**
 * A parcel cannot be labelled without an address, and the address is the
 * snapshot taken at purchase — so a vendor who has since filled their profile
 * in does NOT fix an order placed before they did. Surfaced on the card rather
 * than discovered at the dispatch button, which is where the database refuses.
 */
export function missingAddress(c: CertificateOrder): boolean {
  return !c.addressLine?.trim() || !c.postalCode?.trim();
}

export async function markPrinted(id: string): Promise<void> {
  const { error } = await supabase.rpc("certificate_mark_printed", { p_ad_certificate_id: id });
  if (error) throw error;
}

export async function dispatchCertificate(id: string, courier: string, tracking: string): Promise<void> {
  const { error } = await supabase.rpc("certificate_dispatch", {
    p_ad_certificate_id: id, p_courier: courier, p_tracking: tracking,
  });
  if (error) throw error;
}

export async function markDelivered(id: string): Promise<void> {
  const { error } = await supabase.rpc("certificate_mark_delivered", { p_ad_certificate_id: id });
  if (error) throw error;
}

export async function markReturned(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("certificate_mark_returned", {
    p_ad_certificate_id: id, p_reason: reason,
  });
  if (error) throw error;
}

export async function cancelCertificate(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("certificate_cancel_order", {
    p_ad_certificate_id: id, p_reason: reason,
  });
  if (error) throw error;
}
