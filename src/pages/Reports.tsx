import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Boxes, IndianRupee, Layers, Store, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge, Card, Empty, ErrorNote, PageHeader, Spinner, Table } from "@/components/ui";

/**
 * Part 7 — reporting, from real rows only.
 *
 * Two unit traps are handled here, both verified against the edge functions that
 * write the rows:
 *   - subscription_invoices.amount is RUPEES, ex-GST (gst_amount is separate).
 *   - ad_orders.amount is PAISE (razorpay-create-order does `rupees * 100`).
 * Summing them naively would overstate ad revenue by 100x.
 */

// Single-series charts throughout, so there is no categorical palette to collide:
// monochrome graphite for magnitude, and the reserved status palette (always
// paired with a text label, never colour alone) for product state.
const SERIES_INK = "#26262a";
const STATUS_COLOR: Record<string, string> = {
  live: "#0ca30c", // good
  under_review: "#fab219", // warning
  draft: "#94a3b8", // neutral — not a status signal
  rejected: "#d03b3b", // critical
};

interface ReportData {
  vendorCount: number;
  productsByStatus: { status: string; count: number }[];
  categories: { name: string; count: number }[];
  revenueByDay: { day: string; subscriptions: number; ads: number; total: number }[];
  subscriptionRevenue: number;
  adRevenue: number;
  adOrderCount: number;
  topVendors: { id: string; brand: string; plan: string; boost: number; active: boolean }[];
}

export default function Reports() {
  const report = useQuery({
    queryKey: ["reports"],
    queryFn: async (): Promise<ReportData> => {
      const [vendors, products, cats, invoices, adOrders, plans] = await Promise.all([
        supabase.from("vendor_profiles").select("id, brand_name, plan_id, plan_expires_at"),
        supabase.from("products").select("status, category_id"),
        supabase.from("categories").select("id, name"),
        supabase.from("subscription_invoices").select("amount, gst_amount, status, created_at"),
        supabase.from("ad_orders").select("amount, status, paid_at, created_at"),
        supabase.from("subscription_plans").select("id, name, limits"),
      ]);

      for (const r of [vendors, products, cats, invoices, adOrders, plans]) {
        if (r.error) throw new Error(r.error.message);
      }

      // Products by status
      const statusCounts = new Map<string, number>();
      for (const p of products.data ?? []) statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);
      const productsByStatus = ["under_review", "live", "rejected", "draft"]
        .map((s) => ({ status: s, count: statusCounts.get(s) ?? 0 }))
        .filter((s) => s.count > 0);

      // Category distribution
      const catNames = new Map((cats.data ?? []).map((c) => [c.id, c.name]));
      const catCounts = new Map<string, number>();
      for (const p of products.data ?? []) {
        const name = p.category_id ? (catNames.get(p.category_id) ?? "Unknown") : "Uncategorised";
        catCounts.set(name, (catCounts.get(name) ?? 0) + 1);
      }
      const categories = [...catCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // Revenue — paid rows only, both sources normalised to rupees.
      const byDay = new Map<string, { subscriptions: number; ads: number }>();
      const bump = (iso: string, key: "subscriptions" | "ads", rupees: number) => {
        const day = iso.slice(0, 10);
        const row = byDay.get(day) ?? { subscriptions: 0, ads: 0 };
        row[key] += rupees;
        byDay.set(day, row);
      };

      let subscriptionRevenue = 0;
      for (const inv of invoices.data ?? []) {
        if (inv.status !== "paid") continue;
        const rupees = inv.amount + (inv.gst_amount ?? 0);
        subscriptionRevenue += rupees;
        bump(inv.created_at, "subscriptions", rupees);
      }

      let adRevenue = 0;
      let adOrderCount = 0;
      for (const o of adOrders.data ?? []) {
        if (o.status !== "paid") continue;
        adOrderCount += 1;
        const rupees = o.amount / 100; // ad_orders.amount is paise
        adRevenue += rupees;
        bump(o.paid_at ?? o.created_at, "ads", rupees);
      }

      const revenueByDay = [...byDay.entries()]
        .map(([day, v]) => ({ day, ...v, total: v.subscriptions + v.ads }))
        .sort((a, b) => a.day.localeCompare(b.day));

      // Top vendors by plan / search boost tier (boost lives in plans.limits).
      const planInfo = new Map(
        (plans.data ?? []).map((p) => [
          p.id,
          {
            name: p.name,
            boost: Number((p.limits as { search_boost_tier?: number })?.search_boost_tier ?? 0),
          },
        ]),
      );
      const topVendors = (vendors.data ?? [])
        .filter((v) => v.plan_id)
        .map((v) => {
          const info = planInfo.get(v.plan_id!);
          return {
            id: v.id,
            brand: v.brand_name ?? "Unnamed vendor",
            plan: info?.name ?? v.plan_id!,
            boost: info?.boost ?? 0,
            active: Boolean(v.plan_expires_at && new Date(v.plan_expires_at).getTime() > Date.now()),
          };
        })
        .sort((a, b) => b.boost - a.boost);

      return {
        vendorCount: (vendors.data ?? []).length,
        productsByStatus,
        categories,
        revenueByDay,
        subscriptionRevenue,
        adRevenue,
        adOrderCount,
        topVendors,
      };
    },
  });

  const flags = useQuery({
    queryKey: ["all-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_flags")
        .select("id, entity_type, entity_id, note, created_at, author:profiles!admin_flags_author_id_fkey(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw new Error(error.message);
      return data as unknown as {
        id: string;
        entity_type: string;
        entity_id: string;
        note: string;
        created_at: string;
        author: { full_name: string | null; email: string | null } | null;
      }[];
    },
  });

  if (report.isLoading) return <Spinner />;
  if (report.error) return <ErrorNote message={(report.error as Error).message} />;

  const d = report.data!;
  const totalRevenue = d.subscriptionRevenue + d.adRevenue;

  return (
    <div className="max-w-5xl">
      <PageHeader title="Reports" subtitle="Read-only. Every figure is computed from live rows." />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Store} label="Vendors" value={String(d.vendorCount)} />
        <Stat
          icon={Boxes}
          label="Products"
          value={String(d.productsByStatus.reduce((s, x) => s + x.count, 0))}
        />
        <Stat icon={IndianRupee} label="Revenue (all time)" value={`₹${totalRevenue.toLocaleString("en-IN")}`} />
        <Stat icon={Layers} label="Categories in use" value={String(d.categories.length)} />
      </div>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Products by status</h2>
        <div className="flex flex-wrap gap-2">
          {d.productsByStatus.map((s) => (
            <div key={s.status} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
              {/* colour + label, never colour alone */}
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[s.status] ?? "#94a3b8" }}
                aria-hidden
              />
              <span className="text-sm text-slate-700">{s.status.replace("_", " ")}</span>
              <span className="text-sm font-semibold text-slate-900">{s.count}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Revenue over time</h2>
        <p className="mb-3 text-xs text-slate-500">
          Paid subscription invoices (incl. GST) plus paid ad orders, by day.{" "}
          {d.adOrderCount === 0 && (
            <span className="text-amber-700">
              No paid ad orders exist yet, so this is subscription revenue only.
            </span>
          )}
        </p>

        {d.revenueByDay.length === 0 ? (
          <Empty>No paid invoices or ad orders yet.</Empty>
        ) : d.revenueByDay.length === 1 ? (
          // One day of data is not a trend; a line would imply movement that
          // isn't there, so state the figure instead.
          <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            All revenue to date falls on a single day (
            {format(new Date(d.revenueByDay[0].day), "d MMM yyyy")}):{" "}
            <span className="font-semibold">₹{d.revenueByDay[0].total.toLocaleString("en-IN")}</span>. A
            trend line needs at least two days of activity.
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.revenueByDay} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v: string) => format(new Date(v), "d MMM")}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  stroke="#cbd5e1"
                />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" width={48} />
                <Tooltip
                  formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Revenue"]}
                  labelFormatter={(v: string) => format(new Date(v), "d MMM yyyy")}
                />
                <Line type="monotone" dataKey="total" stroke={SERIES_INK} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-3 flex gap-6 border-t border-slate-100 pt-3 text-sm">
          <div>
            <div className="text-xs text-slate-400">Subscriptions</div>
            <div className="font-semibold text-slate-900">
              ₹{d.subscriptionRevenue.toLocaleString("en-IN")}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Ads ({d.adOrderCount} paid orders)</div>
            <div className="font-semibold text-slate-900">₹{d.adRevenue.toLocaleString("en-IN")}</div>
          </div>
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Products per category</h2>
        {d.categories.length === 0 ? (
          <Empty>No products.</Empty>
        ) : (
          <div style={{ height: Math.max(140, d.categories.length * 28 + 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={d.categories}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 8 }}
              >
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#334155" }}
                  stroke="#cbd5e1"
                  width={130}
                />
                <Tooltip formatter={(v: number) => [String(v), "Products"]} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="count" fill={SERIES_INK} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Vendors on a plan</h2>
        <p className="mb-3 text-xs text-slate-500">
          Ranked by search boost tier, which comes from the plan's{" "}
          <span className="font-mono text-[11px]">limits.search_boost_tier</span>.
        </p>
        {d.topVendors.length === 0 ? (
          <Empty>No vendor is on a paid plan.</Empty>
        ) : (
          <Table head={["Vendor", "Plan", "Boost tier", "Plan active"]}>
            {d.topVendors.map((v) => (
              <tr key={v.id}>
                <td className="px-3 py-2 font-medium text-slate-900">{v.brand}</td>
                <td className="px-3 py-2 text-slate-600">{v.plan}</td>
                <td className="px-3 py-2 text-slate-700">{v.boost}</td>
                <td className="px-3 py-2">
                  {v.active ? <Badge tone="green" dot>active</Badge> : <Badge tone="red" dot>expired</Badge>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Flagged items log</h2>
        <p className="mb-3 text-xs text-slate-500">
          Internal tracking notes attached to vendors, products and ads — not a dispute or workflow
          system. Add notes from the relevant vendor, product or ad screen.
        </p>
        {flags.isLoading ? (
          <Spinner label="Loading log…" />
        ) : (flags.data ?? []).length === 0 ? (
          <Empty>Nothing flagged.</Empty>
        ) : (
          <div className="space-y-2">
            {(flags.data ?? []).map((f) => (
              <div key={f.id} className="rounded border border-slate-200 p-2">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone="blue">{f.entity_type}</Badge>
                  <span className="font-mono text-[11px] text-slate-400">{f.entity_id.slice(0, 8)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-800">{f.note}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {f.author?.full_name || f.author?.email || "Unknown admin"} ·{" "}
                  {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <Card className="flex items-center gap-3.5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand ring-1 ring-inset ring-brand/10">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-muted">{label}</div>
        <div className="mt-0.5 truncate font-display text-[1.75rem] font-bold leading-none tracking-tight tabular-nums text-ink">
          {value}
        </div>
      </div>
    </Card>
  );
}
