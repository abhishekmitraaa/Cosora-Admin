import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { describeWriteError, supabase } from "@/lib/supabase";
import { Badge, Button, Empty, Field, Modal, Note, Panel, SkeletonList, Textarea } from "@/components/ui";

interface Incident {
  id: string;
  kind: "activation_failed" | "invoice_incomplete" | "dispute" | "reconcile_mismatch";
  vendor_id: string | null;
  vendor_name: string | null;
  order_ref: string | null;
  payment_ref: string | null;
  detail: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolution: string | null;
}

const KIND: Record<Incident["kind"], { label: string; tone: "critical" | "caution" | "neutral"; help: string }> = {
  activation_failed: {
    label: "Paid, plan not activated",
    tone: "critical",
    help: "Razorpay took the money but the plan couldn't change (for example, a paid next period was already waiting). Change the plan by hand, or refund the payment from the Invoices list.",
  },
  invoice_incomplete: {
    label: "Receipt without GST details",
    tone: "caution",
    help: "A live payment was received before Cosora's billing details were set, so the vendor got a payment receipt, not a tax invoice. Set the billing details, then issue the tax invoice.",
  },
  dispute: {
    label: "Payment disputed",
    tone: "critical",
    help: "The vendor's bank raised a dispute (chargeback). Respond in the Razorpay dashboard before its deadline.",
  },
  reconcile_mismatch: {
    label: "Needs reconciling",
    tone: "caution",
    help: "Razorpay and Cosora disagree about this payment.",
  },
};

const rupees = (paise: unknown) =>
  typeof paise === "number" ? `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : null;

/**
 * Billing incidents (subscriptions P1, 2026-10-08): money-side events a person has to
 * look at, opened by the payment functions (public.subscription_fulfil, the webhook):
 * a paid order whose plan couldn't be activated, a live receipt issued without
 * Cosora's billing details, a payment dispute. Each one also rings the bell for super
 * and finance admins. Resolving one needs a note of what was done, which goes to the
 * Admin Log (admin_billing_incident_resolve). Support can read them.
 *
 * Shows nothing before the billing-core migration is applied (the reader doesn't exist).
 */
export function BillingIncidentsPanel({ writable }: { writable: boolean }) {
  const qc = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState<Incident | null>(null);
  const [note, setNote] = useState("");

  const incidents = useQuery({
    queryKey: ["billing-incidents", showResolved],
    queryFn: async (): Promise<Incident[] | null> => {
      const { data, error } = await supabase.rpc("admin_billing_incidents", { p_open_only: !showResolved });
      // Not applied yet (PGRST202), or a role that doesn't see billing (42501).
      if (error?.code === "PGRST202" || error?.code === "42501") return null;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Incident[];
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ id, why }: { id: string; why: string }) => {
      const { error } = await supabase.rpc("admin_billing_incident_resolve", { p_id: id, p_resolution: why });
      if (error) throw new Error(describeWriteError(error));
    },
    onSuccess: () => {
      toast.success("Incident resolved");
      setResolving(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["billing-incidents"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  if (incidents.isPending) return <SkeletonList rows={1} height="h-24" />;
  if (incidents.data === null) return null;
  if (incidents.error) return <Note>{(incidents.error as Error).message}</Note>;
  const rows = incidents.data ?? [];

  return (
    <Panel
      title="Billing incidents"
      description="Payments that need a person: a plan that didn't activate after payment, a receipt issued without Cosora's GST details, a disputed payment. Resolve each with a note of what you did; it goes to the Admin Log."
      actions={
        <Button size="sm" onClick={() => setShowResolved((v) => !v)}>
          {showResolved ? "Open only" : "Show resolved"}
        </Button>
      }
    >
      {rows.length === 0 ? (
        <Empty>{showResolved ? "No billing incidents." : "No open billing incidents."}</Empty>
      ) : (
        <div className="space-y-3" data-testid="billing-incidents">
          {rows.map((r) => {
            const k = KIND[r.kind] ?? KIND.reconcile_mismatch;
            const amount = rupees(r.detail?.amount_paise ?? r.detail?.amount);
            const reason = typeof r.detail?.reason === "string" ? r.detail.reason : null;
            const number = typeof r.detail?.invoice_number === "string" ? r.detail.invoice_number : null;
            return (
              <div key={r.id} className="rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.resolved_at ? "neutral" : k.tone}>{k.label}</Badge>
                      <span className="text-sm font-medium text-ink">{r.vendor_name ?? "Unknown vendor"}</span>
                      {amount && <span className="text-sm tabular-nums text-ink-muted">{amount}</span>}
                    </div>
                    <p className="mt-1 text-2xs text-ink-faint">
                      {format(new Date(r.created_at), "d MMM yyyy, HH:mm")}
                      {r.order_ref && <> · order <span className="font-mono">{r.order_ref}</span></>}
                      {r.payment_ref && <> · payment <span className="font-mono">{r.payment_ref}</span></>}
                      {number && <> · <span className="font-mono">{number}</span></>}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {k.help}
                      {reason && <> Refused because: <span className="font-mono">{reason}</span>.</>}
                    </p>
                    {r.resolved_at && (
                      <p className="mt-1 text-xs text-ink">
                        {`Resolved ${format(new Date(r.resolved_at), "d MMM yyyy")}${r.resolved_by_name ? ` by ${r.resolved_by_name}` : ""}: ${r.resolution ?? ""}`}
                      </p>
                    )}
                  </div>
                  {!r.resolved_at && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!writable || resolve.isPending}
                      title={writable ? undefined : "Only super admins and finance admins resolve billing incidents"}
                      onClick={() => {
                        setNote("");
                        setResolving(r);
                      }}
                    >
                      Resolve
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={resolving !== null} title="Resolve the billing incident" onClose={() => setResolving(null)}>
        {resolving && (
          <>
            <Note className="mb-3">{KIND[resolving.kind]?.help}</Note>
            <Field label="What was done" htmlFor="incident-note" hint="Required. Recorded in the Admin Log.">
              <Textarea
                id="incident-note"
                rows={3}
                autoFocus
                value={note}
                placeholder="Plan changed by hand to Gold; vendor told by phone."
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="mt-3 flex justify-end gap-2">
              <Button onClick={() => setResolving(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!note.trim() || resolve.isPending}
                onClick={() => resolve.mutate({ id: resolving.id, why: note.trim() })}
              >
                {resolve.isPending ? "Working…" : "Mark resolved"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </Panel>
  );
}
