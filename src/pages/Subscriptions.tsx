import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { describeWriteError, supabase } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  Badge,
  Button,
  Empty,
  ErrorNote,
  Field,
  Modal,
  Note,
  Page,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  ROW_HOVER,
  Select,
  SkeletonList,
  Stack,
  StatusBadge,
  Table,
  Textarea,
} from "@/components/ui";
import { RefundGuaranteePanel } from "@/components/RefundGuaranteePanel";
import { BillingIncidentsPanel } from "@/components/BillingIncidentsPanel";

/** Rows per page. Both lists grow with the vendor base; neither loads it whole. */
const PAGE = 50;

/** A plan change or a cancel, waiting for its reason. */
type Pending =
  | { kind: "plan"; sub: SubRow; planId: string }
  | { kind: "cancel"; sub: SubRow };

interface SubRow {
  id: string;
  vendor_id: string;
  plan_id: string;
  billing_cycle: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  auto_renew: boolean;
  vendor: { brand_name: string | null; city: string | null } | null;
  /** A paid downgrade waiting for the period to end (2026-10-02); absent before that migration. */
  scheduled_plan_id?: string | null;
  scheduled_from?: string | null;
}

interface InvoiceRow {
  id: string;
  vendor_id: string;
  plan_id: string | null;
  amount: number;
  gst_amount: number | null;
  currency: string;
  status: string;
  invoice_number: string | null;
  razorpay_payment_id: string | null;
  razorpay_refund_id: string | null;
  refund_status: string | null;
  refunded_at: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  created_at: string;
  vendor: { brand_name: string | null } | null;
  /** Subscriptions P1 (2026-10-08); absent before the billing-core migration. */
  document_type?: "tax_invoice" | "receipt" | "test" | "demo" | null;
  payment_mode?: "live" | "test" | "demo" | "free" | null;
  total_paise?: number | null;
}

/** What each kind of document is, as the list shows it. */
const DOCUMENT: Record<string, { label: string; tone: "positive" | "neutral" | "info" | "caution" }> = {
  tax_invoice: { label: "Tax invoice", tone: "positive" },
  receipt: { label: "Receipt", tone: "neutral" },
  test: { label: "Test", tone: "info" },
  demo: { label: "Demo", tone: "caution" },
};

const inr = (rupees: number) => `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Open an invoice's PDF: invoice-render draws it once, the admin's own session signs it for 5 minutes. */
async function openInvoicePdf(invoiceId: string): Promise<void> {
  // Opened first, in the click, so a popup blocker allows it; pointed at the PDF once signed.
  const win = window.open("about:blank", "_blank");
  try {
    const { data, error } = await supabase.functions.invoke("invoice-render", { body: { invoiceId } });
    const path = (data as { path?: string } | null)?.path;
    if (error || !path) throw new Error("The PDF couldn't be prepared.");
    const signed = await supabase.storage.from("invoices").createSignedUrl(path, 300);
    if (signed.error || !signed.data?.signedUrl) throw new Error("The PDF couldn't be signed.");
    if (win) win.location.href = signed.data.signedUrl;
    else window.location.assign(signed.data.signedUrl);
  } catch (e) {
    win?.close();
    toast.error((e as Error).message);
  }
}

interface PlanRow {
  id: string;
  name: string;
  monthly_price: number;
  yearly_price: number;
}

const SUBTITLE = "Plans, invoices, refunds and billing incidents.";

export default function Subscriptions() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "subscriptions");

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async (): Promise<PlanRow[]> => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, monthly_price, yearly_price")
        .order("sort_order");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // Both lists page by created_at, newest first: the next page starts strictly
  // before the last row shown. vendor_subscriptions.vendor_id FKs vendor_profiles,
  // so the embed is a real single-hop relationship (unlike products -> vendor).
  const subs = useInfiniteQuery({
    queryKey: ["subscriptions"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<(SubRow & { created_at: string })[]> => {
      const base = `id, vendor_id, plan_id, billing_cycle, status, current_period_start,
           current_period_end, auto_renew, created_at, vendor:vendor_profiles(brand_name, city)`;
      const read = (columns: string) => {
        let q = supabase.from("vendor_subscriptions").select(columns).order("created_at", { ascending: false }).limit(PAGE);
        if (pageParam) q = q.lt("created_at", pageParam);
        return q;
      };
      let { data, error } = await read(`${base}, scheduled_plan_id, scheduled_from`);
      // Before the 2026-10-02 migration there are no scheduled_* columns (42703).
      if (error?.code === "42703") ({ data, error } = await read(base));
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as (SubRow & { created_at: string })[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].created_at : undefined),
  });

  const invoices = useInfiniteQuery({
    queryKey: ["invoices"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<InvoiceRow[]> => {
      const base = `id, vendor_id, plan_id, amount, gst_amount, currency, status, invoice_number,
           razorpay_payment_id, razorpay_refund_id, refund_status, refunded_at,
           billing_period_start, billing_period_end, created_at,
           vendor:vendor_profiles(brand_name)`;
      const read = (columns: string) => {
        let q = supabase.from("subscription_invoices").select(columns).order("created_at", { ascending: false }).limit(PAGE);
        if (pageParam) q = q.lt("created_at", pageParam);
        return q;
      };
      let { data, error } = await read(`${base}, document_type, payment_mode, total_paise`);
      // Before the billing-core migration (2026-10-08) there are no such columns (42703).
      if (error?.code === "42703") ({ data, error } = await read(base));
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as InvoiceRow[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].created_at : undefined),
  });

  /**
   * Plan changes and cancels go through admin_subscription_change_plan() /
   * admin_subscription_cancel() (admin completion, Phase 3b). They used to be
   * direct UPDATEs of vendor_subscriptions with no reason, and they left
   * vendor_profiles.plan_id / plan_expires_at (the trust seal and search boost) on
   * the old values. The functions change both in one transaction, record the reason
   * in the Admin Log, and notify the vendor.
   */
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");

  const decide = useMutation({
    mutationFn: async ({ action, why }: { action: Pending; why: string }) => {
      const { error } =
        action.kind === "plan"
          ? await supabase.rpc("admin_subscription_change_plan", {
              p_subscription_id: action.sub.id,
              p_plan_id: action.planId,
              p_reason: why,
            })
          : await supabase.rpc("admin_subscription_cancel", {
              p_subscription_id: action.sub.id,
              p_reason: why,
            });
      if (error) throw new Error(describeWriteError(error));
    },
    onSuccess: (_d, { action }) => {
      toast.success(action.kind === "plan" ? "Plan changed" : "Subscription canceled");
      setPending(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["subscriptions"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  /**
   * Refunds go through the admin-refund-payment edge function, never a direct
   * table write. The function calls Razorpay first and only records the refund
   * if the gateway returns a refund id, so nothing is ever marked refunded on
   * this screen without the money actually moving.
   */
  const refund = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-refund-payment", {
        body: { invoiceId },
      });
      // A non-2xx from the function surfaces as FunctionsHttpError; dig out the
      // real reason so the admin sees Razorpay's / the function's own words.
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
      toast.success(
        d.refundStatus === "processed"
          ? `Refund processed by Razorpay (${d.refundId})`
          : `Refund accepted by Razorpay, status: ${d.refundStatus} (${d.refundId})`,
      );
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  if (subs.isPending || invoices.isPending) {
    return (
      <Page width="wide">
        <PageHeader title="Subscriptions & billing" subtitle={SUBTITLE} />
        <SkeletonList rows={2} height="h-64" />
      </Page>
    );
  }
  if (subs.error) return <ErrorNote message={(subs.error as Error).message} />;
  if (invoices.error) return <ErrorNote message={(invoices.error as Error).message} />;

  const subRows = subs.data?.pages.flat() ?? [];
  const invRows = invoices.data?.pages.flat() ?? [];
  const planName = (id: string) => (plans.data ?? []).find((p) => p.id === id)?.name ?? id;

  return (
    <Page width="wide">
      <PageHeader title="Subscriptions & billing" subtitle={SUBTITLE} />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "subscriptions")} />}

      <Stack>
        <BillingIncidentsPanel writable={writable} />

        <RefundGuaranteePanel writable={writable} />

        <Panel title="Subscriptions">
          {subRows.length === 0 ? (
            <Empty>No vendor subscriptions.</Empty>
          ) : (
            <Table head={["Vendor", "Plan", "Cycle", "Status", "Current period", "Autopay", "Actions"]}>
              {subRows.map((s) => (
                <tr key={s.id} className={ROW_HOVER}>
                  <td className="px-3 py-2 font-medium text-ink">
                    {s.vendor?.brand_name ?? "Unknown vendor"}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      aria-label={`Plan for ${s.vendor?.brand_name ?? "this vendor"}`}
                      value={s.plan_id}
                      disabled={!writable || decide.isPending || s.status === "canceled" || s.status === "expired"}
                      onChange={(e) => {
                        setReason("");
                        setPending({ kind: "plan", sub: s, planId: e.target.value });
                      }}
                    >
                      {(plans.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{s.billing_cycle}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums text-ink-muted">
                    {s.current_period_start && s.current_period_end ? (
                      <>
                        {format(new Date(s.current_period_start), "d MMM yyyy")} to{" "}
                        {format(new Date(s.current_period_end), "d MMM yyyy")}
                        {s.scheduled_plan_id && s.scheduled_from && (
                          <span className="block text-2xs text-ink-faint">
                            {`${planName(s.scheduled_plan_id)} (paid) from ${format(new Date(s.scheduled_from), "d MMM yyyy")}`}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-ghost">not set</span>
                    )}
                  </td>
                  {/* auto_renew means autopay since subscriptions P3: a Razorpay mandate renews the plan. */}
                  <td className="px-3 py-2 text-xs text-ink-muted">{s.auto_renew ? <Badge tone="positive">on</Badge> : "off"}</td>
                  <td className="px-3 py-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={!writable || s.status === "canceled" || s.status === "expired" || decide.isPending}
                      onClick={() => {
                        setReason("");
                        setPending({ kind: "cancel", sub: s });
                      }}
                    >
                      Cancel
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          {subs.hasNextPage && (
            <div className="mt-3 flex justify-center">
              <Button size="sm" disabled={subs.isFetchingNextPage} onClick={() => void subs.fetchNextPage()}>
                {subs.isFetchingNextPage ? "Loading…" : "Load more subscriptions"}
              </Button>
            </div>
          )}
        </Panel>

        {/*
          Refund honesty: the button is only enabled where a real gateway payment
          exists. Seeded/simulated invoices have no razorpay_payment_id and there
          is nothing to reverse - the edge function refuses them too.
        */}
        <Panel
          title="Invoices"
          description={
            <>
              Refunds call Razorpay's API server-side and are only recorded if the gateway confirms
              them. Invoices without a <span className="font-mono text-2xs">razorpay_payment_id</span>{" "}
              were not paid through the gateway and cannot be refunded.
            </>
          }
        >
          {invRows.length === 0 ? (
            <Empty>No invoices.</Empty>
          ) : (
            <Table head={["Invoice", "Vendor", "Plan", "Amount", "Period", "Status", "Refund", ""]}>
              {invRows.map((inv) => {
                const total = inv.total_paise != null ? inv.total_paise / 100 : inv.amount + (inv.gst_amount ?? 0);
                const refundable = Boolean(inv.razorpay_payment_id) && inv.status === "paid" && !inv.razorpay_refund_id;
                const doc = inv.document_type ? DOCUMENT[inv.document_type] : null;
                return (
                  <tr key={inv.id} className={ROW_HOVER}>
                    <td className="px-3 py-2 font-mono text-xs text-ink-muted">
                      {inv.invoice_number ?? inv.id.slice(0, 8)}
                      {doc && (
                        <span className="mt-0.5 block font-sans">
                          <Badge tone={doc.tone}>{doc.label}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {inv.vendor?.brand_name ?? <span className="text-ink-ghost">unknown</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {inv.plan_id ?? <span className="text-ink-ghost">none</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink">
                      {inr(total)}
                      {inv.gst_amount ? (
                        <span className="block text-2xs text-ink-faint">
                          {inr(inv.amount)} + {inr(inv.gst_amount)} GST
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-ink-muted">
                      {inv.billing_period_start && inv.billing_period_end
                        ? `${format(new Date(inv.billing_period_start), "d MMM")} to ${format(new Date(inv.billing_period_end), "d MMM yyyy")}`
                        : format(new Date(inv.created_at), "d MMM yyyy")}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {inv.razorpay_refund_id ? (
                        <span>
                          <Badge tone={inv.refund_status === "processed" ? "positive" : "caution"}>
                            {inv.refund_status}
                          </Badge>
                          <span className="mt-0.5 block font-mono text-2xs text-ink-faint">
                            {inv.razorpay_refund_id}
                          </span>
                        </span>
                      ) : inv.refund_status === "failed" ? (
                        <Badge tone="critical">failed</Badge>
                      ) : (
                        <span className="text-ink-ghost">none</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => void openInvoicePdf(inv.id)}>
                          PDF
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={!writable || !refundable || refund.isPending}
                          title={
                            !inv.razorpay_payment_id
                              ? "No gateway payment on this invoice, so there is nothing to refund"
                              : undefined
                          }
                          onClick={() => {
                            if (!confirm(`Refund ${inr(total)} to ${inv.vendor?.brand_name ?? "this vendor"} via Razorpay?`))
                              return;
                            refund.mutate(inv.id);
                          }}
                        >
                          Refund
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
          {invoices.hasNextPage && (
            <div className="mt-3 flex justify-center">
              <Button
                size="sm"
                disabled={invoices.isFetchingNextPage}
                onClick={() => void invoices.fetchNextPage()}
              >
                {invoices.isFetchingNextPage ? "Loading…" : "Load more invoices"}
              </Button>
            </div>
          )}
        </Panel>
      </Stack>

      <Modal
        open={pending !== null}
        title={
          pending?.kind === "plan"
            ? `Move ${pending.sub.vendor?.brand_name ?? "this vendor"} to ${planName(pending.planId)}`
            : `Cancel ${pending?.sub.vendor?.brand_name ?? "this vendor"}'s subscription`
        }
        onClose={() => setPending(null)}
      >
        {pending && (
          <>
            <Note className="mb-3">
              {pending.kind === "plan" ? (
                <>
                  The vendor moves from {planName(pending.sub.plan_id)} to {planName(pending.planId)} now,
                  with the same period end. No money moves: nothing is charged or refunded. Their trust
                  seal and search boost follow the new plan while the subscription runs.
                </>
              ) : (
                <>
                  The plan ends now, with its trust seal and search boost. Nothing is refunded here: refund
                  a paid invoice from the Invoices list below.
                </>
              )}{" "}
              The vendor is notified, and the reason goes into the Admin Log.
            </Note>
            <Field label="Reason" htmlFor="sub-reason" hint="Required. Recorded in the Admin Log, not shown to the vendor.">
              <Textarea
                id="sub-reason"
                rows={3}
                autoFocus
                value={reason}
                placeholder={pending.kind === "plan" ? "Why is this plan changing?" : "Why is this subscription being canceled?"}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setPending(null)}>Keep as is</Button>
              <Button
                variant={pending.kind === "cancel" ? "danger" : "primary"}
                disabled={!reason.trim() || decide.isPending}
                onClick={() => decide.mutate({ action: pending, why: reason.trim() })}
              >
                {decide.isPending ? "Working…" : pending.kind === "plan" ? "Change plan" : "Cancel subscription"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </Page>
  );
}
