import { useState } from "react";
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
  Select,
  SkeletonList,
  Spinner,
  Stack,
  Stat,
  Table,
} from "@/components/ui";

/**
 * Part 7 - reporting, from real rows only, computed in the database.
 *
 * admin_report_summary(from, to) (admin completion, Phase 3c) does the aggregation
 * and returns one small document. This page used to pull six whole tables into the
 * browser, which grows with the catalogue and would silently truncate at
 * PostgREST's row cap. The function handles both unit traps:
 *   - subscription_invoices.amount is RUPEES, ex-GST (gst_amount is separate);
 *   - ad_orders.amount is PAISE.
 * Every money figure it returns is in paise.
 *
 * Revenue is shown NET of GST: GST collected is owed to the government, not earned.
 * The part with no gateway payment id (demo-mode activations) is flagged, because
 * it is not money received.
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
      paused: tokenColor("tone-info-dot"),
    } as Record<string, string>,
  };
}

interface ReportData {
  vendorCount: number;
  productsByStatus: { status: string; count: number }[];
  categories: { name: string; count: number }[];
  /** Rupees per IST day: subscriptions net of GST plus ads, and the unverified part. */
  revenueByDay: { day: string; total: number; unverified: number }[];
  subscriptionRevenue: number;
  gst: number;
  unverified: number;
  adRevenue: number;
  adOrderCount: number;
  topVendors: { id: string; brand: string; plan: string; boost: number; active: boolean }[];
}

/** What admin_report_summary() returns. Money is in paise. */
interface Summary {
  vendors: number;
  products_by_status: { status: string; count: number }[];
  categories: { name: string; count: number }[];
  revenue_by_day: {
    day: string;
    subscriptions_net_paise: number;
    gst_paise: number;
    ads_paise: number;
    unverified_paise: number;
  }[];
  totals: {
    subscriptions_net_paise: number;
    gst_paise: number;
    ads_paise: number;
    ad_orders: number;
    unverified_paise: number;
  };
  vendors_on_plans: { id: string; brand: string; plan: string; boost: number; active: boolean }[];
}

const SUBTITLE = "Read-only. Every figure is computed from live rows.";

/** The revenue window. Counts of vendors, products and plans are always "now". */
const RANGES = [
  { id: "all", label: "All time", days: null },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "365", label: "Last 12 months", days: 365 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const rupees = (paise: number) => Math.round(paise / 100);

export default function Reports() {
  const ink = useChartInk();

  const [range, setRange] = useState<RangeId>("all");

  const report = useQuery({
    queryKey: ["reports", range],
    queryFn: async (): Promise<ReportData> => {
      const days = RANGES.find((r) => r.id === range)?.days ?? null;
      const { data, error } = await supabase.rpc("admin_report_summary", {
        p_from: days === null ? undefined : new Date(Date.now() - days * 86_400_000).toISOString(),
      });
      if (error) throw new Error(error.message);
      const r = data as unknown as Summary;

      return {
        vendorCount: r.vendors,
        productsByStatus: r.products_by_status,
        categories: r.categories,
        revenueByDay: r.revenue_by_day.map((d) => ({
          day: d.day,
          total: rupees(d.subscriptions_net_paise + d.ads_paise),
          unverified: rupees(d.unverified_paise),
        })),
        subscriptionRevenue: rupees(r.totals.subscriptions_net_paise),
        gst: rupees(r.totals.gst_paise),
        unverified: rupees(r.totals.unverified_paise),
        adRevenue: rupees(r.totals.ads_paise),
        adOrderCount: r.totals.ad_orders,
        topVendors: r.vendors_on_plans,
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
      <PageHeader
        title="Reports"
        subtitle={SUBTITLE}
        actions={
          <Select aria-label="Revenue window" value={range} onChange={(e) => setRange(e.target.value as RangeId)}>
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        }
      />

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
            label={`Revenue, ${RANGES.find((r) => r.id === range)?.label.toLowerCase()}`}
            value={`₹${totalRevenue.toLocaleString("en-IN")}`}
            sub={`net of ₹${d.gst.toLocaleString("en-IN")} GST collected`}
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
              Paid subscription invoices (net of GST) plus paid ad orders, by IST day.{" "}
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

          {d.unverified > 0 && (
            <Note className="mt-4">
              <span className="font-medium text-ink">
                ₹{d.unverified.toLocaleString("en-IN")} of this (GST included) has no gateway payment id.
              </span>{" "}
              Those invoices came from demo-mode activations while Razorpay was not configured, so no money
              was received for them.
            </Note>
          )}

          <div className="mt-4 flex flex-wrap gap-8 border-t border-line pt-3 text-sm">
            <div>
              <div className="text-xs text-ink-faint">Subscriptions (net)</div>
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
            <div>
              <div className="text-xs text-ink-faint">GST collected (not revenue)</div>
              <div className="font-semibold tabular-nums text-ink-muted">₹{d.gst.toLocaleString("en-IN")}</div>
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
