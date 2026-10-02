import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { describeWriteError, supabase } from "@/lib/supabase";
import { Badge, Button, Empty, Modal, Note, Panel, SkeletonList, Table, Textarea } from "@/components/ui";

interface GuaranteeInvoice {
  id: string;
  invoice_number: string | null;
  plan_id: string | null;
  total_rupees: number;
  status: string;
  razorpay_payment_id: string | null;
  razorpay_refund_id: string | null;
  refund_status: string | null;
}

interface GuaranteeRequest {
  id: string;
  vendor_id: string;
  vendor_name: string | null;
  requested_at: string;
  reason: string | null;
  total_rupees: number;
  status: string;
  invoices: GuaranteeInvoice[];
}

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

/**
 * The 7-day money-back guarantee (2026-10-02), finance's side.
 *
 * The Subscription FAQ promises first-time subscribers "a 7-day money-back guarantee
 * … contact us for a full refund". A seller asks on /subscription
 * (refund_guarantee_request); the request lists every payment from their first
 * 7 days that went through Razorpay. Refund each one here (admin-refund-payment, the
 * same function the Invoices table uses: Razorpay first, recorded only with a refund
 * id), then close the request, which ends the plan and tells the seller
 * (admin_refund_guarantee_close). The database refuses to close while a payment in it
 * has no refund.
 *
 * Shows nothing before that migration is applied (the reader doesn't exist yet).
 */
export function RefundGuaranteePanel({ writable }: { writable: boolean }) {
  const qc = useQueryClient();
  const [closing, setClosing] = useState<GuaranteeRequest | null>(null);
  const [note, setNote] = useState("");

  const requests = useQuery({
    queryKey: ["refund-guarantee-requests"],
    queryFn: async (): Promise<GuaranteeRequest[] | null> => {
      const { data, error } = await supabase.rpc("admin_refund_guarantee_requests", { p_status: "open" });
      // Not applied yet (PGRST202), or a role that doesn't handle refunds (42501).
      if (error?.code === "PGRST202" || error?.code === "42501") return null;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as GuaranteeRequest[];
    },
  });

  const refund = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-refund-payment", { body: { invoiceId } });
      if (error) {
        let detail = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            detail = body.detail || body.error || detail;
          } catch {
            /* keep the original message */
          }
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.detail || data.error);
      return data as { refundId: string; refundStatus: string };
    },
    onSuccess: (d) => {
      toast.success(`Refund ${d.refundStatus === "processed" ? "processed" : `accepted (${d.refundStatus})`} by Razorpay (${d.refundId})`);
      void qc.invalidateQueries({ queryKey: ["refund-guarantee-requests"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const close = useMutation({
    mutationFn: async ({ id, why }: { id: string; why: string }) => {
      const { error } = await supabase.rpc("admin_refund_guarantee_close", { p_request_id: id, p_note: why || undefined });
      if (error) throw new Error(describeWriteError(error));
    },
    onSuccess: () => {
      toast.success("Request closed. The plan has ended and the seller has been told.");
      setClosing(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["refund-guarantee-requests"] });
      void qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  if (requests.isPending) return <SkeletonList rows={1} height="h-24" />;
  if (requests.data === null) return null;
  if (requests.error) return <Note>{(requests.error as Error).message}</Note>;
  const rows = requests.data ?? [];

  return (
    <Panel
      title="7-day money-back guarantee"
      description="First-time subscribers who asked for their money back within 7 days of their first payment. Refund each payment through Razorpay, then close the request: that ends the plan and tells the seller."
    >
      {rows.length === 0 ? (
        <Empty>No open refund requests.</Empty>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const allRefunded = r.invoices.every((i) => Boolean(i.razorpay_refund_id));
            return (
              <div key={r.id} className="rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{r.vendor_name ?? "Unknown vendor"}</p>
                    <p className="text-2xs text-ink-faint">
                      Asked {format(new Date(r.requested_at), "d MMM yyyy, HH:mm")} · {inr(r.total_rupees)} in full
                    </p>
                    {r.reason && <p className="mt-1 text-xs text-ink-muted">“{r.reason}”</p>}
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!writable || !allRefunded || close.isPending}
                    title={allRefunded ? undefined : "Refund every payment first"}
                    onClick={() => { setNote(""); setClosing(r); }}
                  >
                    Close and end the plan
                  </Button>
                </div>
                <Table head={["Invoice", "Plan", "Amount", "Refund", ""]}>
                  {r.invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2 font-mono text-xs text-ink-muted">{i.invoice_number ?? i.id.slice(0, 8)}</td>
                      <td className="px-3 py-2 text-ink-muted">{i.plan_id ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-ink">{inr(i.total_rupees)}</td>
                      <td className="px-3 py-2">
                        {i.razorpay_refund_id ? (
                          <Badge tone={i.refund_status === "processed" ? "positive" : "caution"}>{i.refund_status ?? "pending"}</Badge>
                        ) : i.refund_status === "failed" ? (
                          <Badge tone="critical">failed</Badge>
                        ) : (
                          <span className="text-2xs text-ink-ghost">not yet</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          disabled={!writable || Boolean(i.razorpay_refund_id) || refund.isPending}
                          onClick={() => {
                            if (!confirm(`Refund ${inr(i.total_rupees)} to ${r.vendor_name ?? "this vendor"} via Razorpay?`)) return;
                            refund.mutate(i.id);
                          }}
                        >
                          Refund
                        </Button>
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={closing !== null} title="Close the refund request" onClose={() => setClosing(null)}>
        <p className="mb-2 text-sm text-ink-muted">
          {`Ends ${closing?.vendor_name ?? "this seller"}'s plan now and tells them their ${closing ? inr(closing.total_rupees) : ""} refund is on its way. The note goes to the Admin Log.`}
        </p>
        <Textarea rows={3} value={note} placeholder="Refunded under the 7-day guarantee." onChange={(e) => setNote(e.target.value)} />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setClosing(null)}>Cancel</Button>
          <Button variant="primary" disabled={close.isPending} onClick={() => closing && close.mutate({ id: closing.id, why: note.trim() })}>
            Close and end the plan
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}
