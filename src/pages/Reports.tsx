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
import { Boxes, IndianRupee, Layers, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { tokenColor, useResolvedTheme } from "@/lib/theme";
import {
  Badge,
  Empty,
  ErrorNote,
  Note,
  Page,
  PageHeader,
  Panel,
  ROW_HOVER,
  SkeletonList,
  Spinner,
  Stack,
  Stat,
  Table,
} from "@/components/ui";

/**
 * Part 7 - reporting, from real rows only.
 *
 * Two unit traps are handled here, both verified against the edge functions that
 * write the rows:
 *   - subscription_invoices.amount is RUPEES, ex-GST (gst_amount is separate).
 *   - ad_orders.amount is PAISE (razorpay-create-order does `rupees * 100`).
 * Summing them naively would overstate ad revenue by 100x.
 */

/**
 * CHART COLOURS COME FROM THE TOKEN SET, NOT FROM A SECOND PALETTE.
 *
 * Recharts takes colours as string props, so it cannot read a Tailwind class.
 * The obvious shortcut is to hardcode hexes here, and that is exactly how a
 * chart ends up rendering graphite gridlines on a near-black ground in dark
 * mode. `tokenColor()` reads the live computed value of the same CSS variable
 * the rest of the app uses, and `useResolvedTheme()` is what re-runs it when
 * the mode flips.
 *
 * Single-series charts throughout, so there is no categorical palette to
 * collide: monochrome for magnitude, and the reserved status tones (always
 * paired with a text label, never colour alone) for product state.
 */
function useChartInk() {
  // Subscribing to the resolved theme is the point of this line: it forces a
  // re-render on the mode change, after which the reads below return the new
  // values. The variable itself is deliberately unused.
  useResolvedTheme();
  return {
    series: tokenColor("viz-series"),
    grid: tokenColor("viz-grid"),
    axis: tokenColor("viz-axis"),
    axisText: tokenColor("ink-faint"),
    surface: tokenColor("surface"),
    line: tokenColor("line"),
    ink: tokenColor("ink"),
    hover: tokenColor("surface-2"),
    status: {
      live: tokenColor("tone-positive-dot"),
      under_review: tokenColor("tone-caution-dot"),
      draft: tokenColor("tone-neutral-dot"),
      rejected: tokenColor("tone-critical-dot"),
    } as Record<string, string>,
  };
}

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

const SUBTITLE = "Read-only. Every figure is computed from live rows.";

export default function Reports() {
  const ink = useChartInk();

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

      // Revenue - paid rows only, both sources normalised to rupees.
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
      // Newest 25 across all entities, via the admin_flags RPC (admin-schema
      // separation, Phase 3b); author_full_name / author_email are on each row.
      const { data, error } = await supabase.rpc("admin_flag_list", { p_limit: 25 });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (report.isLoading) {
    return (
      <Page>
        <PageHeader title="Reports" subtitle={SUBTITLE} />
        <SkeletonList rows={3} height="h-48" />
      </Page>
    );
  }
  if (report.error) return <ErrorNote message={(report.error as Error).message} />;

  const d = report.data!;
  const totalRevenue = d.subscriptionRevenue + d.adRevenue;

  // One tooltip treatment for both charts, on tokens, so the popup does not
  // stay white when the page goes dark.
  const tooltipStyle = {
    background: ink.surface,
    border: `1px solid ${ink.line}`,
    borderRadius: "0.5rem",
    color: ink.ink,
    fontSize: 12,
  } as const;

  return (
    <Page>
      <PageHeader title="Reports" subtitle={SUBTITLE} />

      <Stack>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<Store size={18} />} label="Vendors" value={String(d.vendorCount)} />
          <Stat
            icon={<Boxes size={18} />}
            label="Products"
            value={String(d.productsByStatus.reduce((s, x) => s + x.count, 0))}
          />
          <Stat
            icon={<IndianRupee size={18} />}
            label="Revenue, all time"
            value={`₹${totalRevenue.toLocaleString("en-IN")}`}
          />
          <Stat icon={<Layers size={18} />} label="Categories in use" value={String(d.categories.length)} />
        </div>

        <Panel title="Products by status">
          <div className="flex flex-wrap gap-2">
            {d.productsByStatus.map((s) => (
              <div
                key={s.status}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2"
              >
                {/* Colour AND label, never colour alone. */}
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: ink.status[s.status] ?? ink.status.draft }}
                  aria-hidden
                />
                <span className="text-sm text-ink-muted">{s.status.replace("_", " ")}</span>
                <span className="text-sm font-semibold tabular-nums text-ink">{s.count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Revenue over time"
          description={
            <>
              Paid subscription invoices (incl. GST) plus paid ad orders, by day.{" "}
              {d.adOrderCount === 0 && (
                <span className="font-medium text-caution-fg">
                  No paid ad orders exist yet, so this is subscription revenue only.
                </span>
              )}
            </>
          }
        >
          {d.revenueByDay.length === 0 ? (
            <Empty>No paid invoices or ad orders yet.</Empty>
          ) : d.revenueByDay.length === 1 ? (
            // One day of data is not a trend; a line would imply movement that
            // isn't there, so state the figure instead.
            <Note>
              All revenue to date falls on a single day (
              {format(new Date(d.revenueByDay[0].day), "d MMM yyyy")}):{" "}
              <span className="font-semibold tabular-nums text-ink">
                ₹{d.revenueByDay[0].total.toLocaleString("en-IN")}
              </span>
              . A trend line needs at least two days of activity.
            </Note>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.revenueByDay} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={ink.grid} vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(v: string) => format(new Date(v), "d MMM")}
                    tick={{ fontSize: 11, fill: ink.axisText }}
                    stroke={ink.axis}
                  />
                  <YAxis tick={{ fontSize: 11, fill: ink.axisText }} stroke={ink.axis} width={48} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Revenue"]}
                    labelFormatter={(v: string) => format(new Date(v), "d MMM yyyy")}
                  />
                  <Line type="monotone" dataKey="total" stroke={ink.series} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-4 flex gap-8 border-t border-line pt-3 text-sm">
            <div>
              <div className="text-xs text-ink-faint">Subscriptions</div>
              <div className="font-semibold tabular-nums text-ink">
                ₹{d.subscriptionRevenue.toLocaleString("en-IN")}
              </div>
            </div>
            <div>
              <div className="text-xs text-ink-faint">Ads ({d.adOrderCount} paid orders)</div>
              <div className="font-semibold tabular-nums text-ink">
                ₹{d.adRevenue.toLocaleString("en-IN")}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Products per category">
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
                  <CartesianGrid stroke={ink.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: ink.axisText }}
                    stroke={ink.axis}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: ink.axisText }}
                    stroke={ink.axis}
                    width={130}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => [String(v), "Products"]}
                    cursor={{ fill: ink.hover }}
                  />
                  <Bar dataKey="count" fill={ink.series} radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Vendors on a plan"
          description={
            <>
              Ranked by search boost tier, which comes from the plan's{" "}
              <span className="font-mono text-2xs">limits.search_boost_tier</span>.
            </>
          }
        >
          {d.topVendors.length === 0 ? (
            <Empty>No vendor is on a paid plan.</Empty>
          ) : (
            <Table head={["Vendor", "Plan", "Boost tier", "Plan active"]}>
              {d.topVendors.map((v) => (
                <tr key={v.id} className={ROW_HOVER}>
                  <td className="px-3 py-2 font-medium text-ink">{v.brand}</td>
                  <td className="px-3 py-2 text-ink-muted">{v.plan}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-muted">{v.boost}</td>
                  <td className="px-3 py-2">
                    {v.active ? (
                      <Badge tone="positive" dot>active</Badge>
                    ) : (
                      <Badge tone="critical" dot>expired</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel
          title="Flagged items log"
          description="Internal tracking notes attached to vendors, products and ads. Not a dispute or workflow system. Add notes from the relevant vendor, product or ad screen."
        >
          {flags.isLoading ? (
            <Spinner label="Loading log…" />
          ) : (flags.data ?? []).length === 0 ? (
            <Empty>Nothing flagged.</Empty>
          ) : (
            <div className="space-y-2">
              {(flags.data ?? []).map((f) => (
                <div key={f.id} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge tone="info">{f.entity_type}</Badge>
                    <span className="font-mono text-2xs text-ink-faint">{f.entity_id.slice(0, 8)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-ink">{f.note}</p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {f.author_full_name || f.author_email || "Unknown admin"} ·{" "}
                    {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </Stack>
    </Page>
  );
}
