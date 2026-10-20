import { toast } from "sonner";

/**
 * Where an invoice's refund stands, from refund_status alone.
 *
 * Not from razorpay_refund_id: a refund Razorpay marks failed keeps its id (admin-refund-payment and
 * subscription_refund_event both store it), so "has an id" read a failed refund as done. That disabled
 * Refund for good and let the 7-day guarantee be closed on money that never went back (2026-10-20 audit).
 */
export type RefundState = "none" | "pending" | "processed" | "failed";

export function refundState(inv: { refund_status: string | null }): RefundState {
  const s = inv.refund_status;
  return s === "pending" || s === "processed" || s === "failed" ? s : "none";
}

/** Money is back with the vendor, or Razorpay has accepted it and it is on its way. */
export function refundSettledOrUnderway(inv: { refund_status: string | null }): boolean {
  const s = refundState(inv);
  return s === "processed" || s === "pending";
}

/** A paid gateway invoice with no refund done or in flight; a failed one may be tried again. */
export function canRefund(inv: { refund_status: string | null; razorpay_payment_id: string | null; status: string }): boolean {
  return Boolean(inv.razorpay_payment_id) && inv.status === "paid" && !refundSettledOrUnderway(inv);
}

export interface RefundResult {
  refundId: string;
  refundStatus: string;
  /** False when Razorpay refunded but the invoice couldn't be updated (admin-refund-payment, 2026-10-20). */
  recorded?: boolean;
}

/** The message for a finished admin-refund-payment call, the same on Subscriptions and the 7-day guarantee panel. */
export function announceRefund(d: RefundResult): void {
  if (d.refundStatus === "failed") {
    toast.error(`Razorpay refused the refund (${d.refundId}). Nothing was refunded; you can try again.`, { duration: 10000 });
  } else if (d.recorded === false) {
    toast.warning(
      `Razorpay took the refund (${d.refundId}), but the invoice wasn't updated. Don't refund it again: Razorpay's confirmation will finish it, and the Admin Log has the refund id.`,
      { duration: 15000 },
    );
  } else if (d.refundStatus === "processed") {
    toast.success(`Refund processed by Razorpay (${d.refundId})`);
  } else {
    toast.success(`Refund accepted by Razorpay, status: ${d.refundStatus} (${d.refundId})`);
  }
}
