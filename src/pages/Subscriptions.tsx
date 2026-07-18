import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase, assertWrote } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  PageHeader,
  ReadOnlyBanner,
  Select,
  Spinner,
  Table,
} from "@/components/ui";

type SubUpdate = Database["public"]["Tables"]["vendor_subscriptions"]["Update"];

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
}

interface PlanRow {
  id: string;
  name: string;
  monthly_price: number;
  yearly_price: number;
}

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

  const subs = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async (): Promise<SubRow[]> => {
      // vendor_subscriptions.vendor_id FKs vendor_profiles, so this embed is a
      // real single-hop relationship (unlike products -> vendor).
      const { data, error } = await supabase
        .from("vendor_subscriptions")
        .select(
          `id, vendor_id, plan_id, billing_cycle, status, current_period_start,
           current_period_end, auto_renew, vendor:vendor_profiles(brand_name, city)`,
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SubRow[];
    },
  });

  const invoices = useQuery({
    queryKey: ["invoices"],
    queryFn: async (): Promise<InvoiceRow[]> => {
      const { data, error } = await supabase
        .from("subscription_invoices")
        .select(
          `id, vendor_id, plan_id, amount, gst_amount, currency, status, invoice_number,
           razorpay_payment_id, razorpay_refund_id, refund_status, refunded_at,
           billing_period_start, billing_period_end, created_at,
           vendor:vendor_profiles(brand_name)`,
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as InvoiceRow[];
    },
  });

  /** Plan change / cancel are direct writes, gated by vendor_subscriptions_admin RLS. */
  const updateSub = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SubUpdate }) => {
      assertWrote(
        await supabase.from("vendor_subscriptions").update(patch).eq("id", id).select("id"),
        "update subscription",
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscriptions"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Refunds go through the admin-refund-payment edge function — never a direct
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

  if (subs.isLoading || invoices.isLoading) return <Spinner />;
  if (subs.error) return <ErrorNote message={(subs.error as Error).message} />;
  if (invoices.error) return <ErrorNote message={(invoices.error as Error).message} />;

  const subRows = subs.data ?? [];
  const invRows = invoices.data ?? [];

  return (
    <div className="max-w-6xl">
      <PageHeader title="Subscriptions & billing" subtitle="Plans, invoices and refunds." />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "subscriptions")} />}

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Subscriptions</h2>
        {subRows.length === 0 ? (
          <Empty>No vendor subscriptions.</Empty>
        ) : (
          <Table head={["Vendor", "Plan", "Cycle", "Status", "Current period", "Auto-renew", "Actions"]}>
            {subRows.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 font-medium text-slate-900">
                  {s.vendor?.brand_name ?? "Unknown vendor"}
                </td>
                <td className="px-3 py-2">
                  <Select
                    value={s.plan_id}
                    disabled={!writable || updateSub.isPending}
                    onChange={(e) =>
                      updateSub.mutate(
                        { id: s.id, patch: { plan_id: e.target.value } },
                        { onSuccess: () => toast.success("Plan changed") },
                      )
                    }
                  >
                    {(plans.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2 text-slate-600">{s.billing_cycle}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {s.current_period_start && s.current_period_end ? (
                    <>
                      {format(new Date(s.current_period_start), "d MMM yyyy")} –{" "}
                      {format(new Date(s.current_period_end), "d MMM yyyy")}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{s.auto_renew ? "yes" : "no"}</td>
                <td className="px-3 py-2">
                  <Button
                    variant="danger"
                    disabled={!writable || s.status === "canceled" || updateSub.isPending}
                    onClick={() => {
                      if (!confirm(`Cancel the subscription for ${s.vendor?.brand_name ?? "this vendor"}?`)) return;
                      updateSub.mutate(
                        { id: s.id, patch: { status: "canceled", auto_renew: false } },
                        { onSuccess: () => toast.success("Subscription canceled") },
                      );
                    }}
                  >
                    Cancel
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Invoices</h2>
        {/*
          Refund honesty: the button is only enabled where a real gateway payment
          exists. Seeded/simulated invoices have no razorpay_payment_id and there
          is nothing to reverse — the edge function refuses them too.
        */}
        <p className="mb-3 text-xs text-slate-500">
          Refunds call Razorpay's API server-side and are only recorded if the gateway confirms them.
          Invoices without a <span className="font-mono text-[11px]">razorpay_payment_id</span> were
          not paid through the gateway and cannot be refunded.
        </p>

        {invRows.length === 0 ? (
          <Empty>No invoices.</Empty>
        ) : (
          <Table head={["Invoice", "Vendor", "Plan", "Amount", "Period", "Status", "Refund", ""]}>
            {invRows.map((inv) => {
              const total = inv.amount + (inv.gst_amount ?? 0);
              const refundable = Boolean(inv.razorpay_payment_id) && inv.status === "paid" && !inv.razorpay_refund_id;
              return (
                <tr key={inv.id}>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">
                    {inv.invoice_number ?? inv.id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{inv.vendor?.brand_name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{inv.plan_id ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">
                    ₹{total}
                    {inv.gst_amount ? (
                      <span className="block text-[11px] text-slate-400">
                        ₹{inv.amount} + ₹{inv.gst_amount} GST
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {inv.billing_period_start && inv.billing_period_end
                      ? `${format(new Date(inv.billing_period_start), "d MMM")} – ${format(new Date(inv.billing_period_end), "d MMM yyyy")}`
                      : format(new Date(inv.created_at), "d MMM yyyy")}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {inv.razorpay_refund_id ? (
                      <span>
                        <Badge tone={inv.refund_status === "processed" ? "green" : "amber"}>
                          {inv.refund_status}
                        </Badge>
                        <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                          {inv.razorpay_refund_id}
                        </span>
                      </span>
                    ) : inv.refund_status === "failed" ? (
                      <Badge tone="red">failed</Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="danger"
                      disabled={!writable || !refundable || refund.isPending}
                      title={
                        !inv.razorpay_payment_id
                          ? "No gateway payment on this invoice — nothing to refund"
                          : undefined
                      }
                      onClick={() => {
                        if (!confirm(`Refund ₹${total} to ${inv.vendor?.brand_name ?? "this vendor"} via Razorpay?`))
                          return;
                        refund.mutate(inv.id);
                      }}
                    >
                      Refund
                    </Button>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active" || status === "paid"
      ? "green"
      : status === "canceled" || status === "failed"
        ? "red"
        : status === "refunded"
          ? "blue"
          : "amber";
  return (
    <Badge tone={tone as "green" | "red" | "blue" | "amber"} dot>
      {status}
    </Badge>
  );
}
