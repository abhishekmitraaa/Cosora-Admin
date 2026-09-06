import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarRange, IndianRupee, MousePointerClick, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchVendorsByIds } from "@/lib/vendors";
import {
  attentionFlag,
  bookedBetween,
  ctr,
  formatCtr,
  inr,
  monthWindow,
  rollUpByVendor,
  schedule,
  todayWindow,
  FLAG_MIN_IMPRESSIONS,
  type PaidOrder,
} from "@/lib/adsAnalytics";
import {
  Badge,
  Card,
  Empty,
  ErrorNote,
  Meter,
  Note,
  Panel,
  ROW_HOVER,
  SkeletonList,
  Stack,
  Stat,
  Table,
} from "@/components/ui";

/**
 * B1 - AGGREGATE ADS DASHBOARD. Real rows, no schema change, no seed.
 *
 * Everything on this screen is computed in src/lib/adsAnalytics.ts, which
 * carries the long note on what this schema can and cannot support. The two
 * honesty points that shape the whole layout:
 *
 *   - There is no running spend. Cosora ads are prepaid at a flat rate per
 *     placement per day, so the money figure here is REVENUE BOOKED (paid
 *     `ad_orders`, converted from paise) and the bars are a SCHEDULE burn-down
 *     of a campaign that is already paid for. Both are labelled as such.
 *   - There is no conversions column anywhere in the database, so the
 *     attention flags report zero-click and very-low-CTR delivery instead, and
 *     say plainly that they are not conversion metrics.
 *
 * Read-only by construction: this component has no mutation. It inherits the
 * `ads` section's role gate from the page that mounts it.
 */
export default function AdsMonitoring() {
  const data = useQuery({
    queryKey: ["ads-monitoring"],
    queryFn: async () => {
      // Every campaign, not one status tab: a monitoring view that hid paused
      // and rejected campaigns would report a platform CTR that quietly
      // excluded the campaigns most likely to be underperforming.
      const [ads, orders] = await Promise.all([
        supabase
          .from("advertisements")
          .select(
            "id, title, status, vendor_id, placement, daily_budget, impressions, clicks, starts_at, ends_at",
          )
          .order("impressions", { ascending: false }),
        supabase.from("ad_orders").select("amount, status, paid_at, created_at"),
      ]);
      if (ads.error) throw new Error(ads.error.message);
      if (orders.error) throw new Error(orders.error.message);

      const rows = ads.data ?? [];
      const vendors = await fetchVendorsByIds(rows.map((r) => r.vendor_id));
      return { rows, orders: (orders.data ?? []) as PaidOrder[], vendors };
    },
  });

  if (data.isLoading) return <SkeletonList rows={4} height="h-28" />;
  if (data.error) return <ErrorNote message={(data.error as Error).message} />;

  const { rows, orders, vendors } = data.data!;

  const now = new Date();
  const [dayFrom, dayTo] = todayWindow(now);
  const [monthFrom, monthTo] = monthWindow(now);
  const bookedToday = bookedBetween(orders, dayFrom, dayTo);
  const bookedMonth = bookedBetween(orders, monthFrom, monthTo);

  const active = rows.filter((r) => r.status === "active");
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const platformCtr = ctr(clicks, impressions);

  const leaderboard = rollUpByVendor(rows);
  const flagged = rows
    .map((r) => ({ ad: r, ...attentionFlag(r) }))
    .filter((r) => r.flag !== null);

  // Live campaigns with dates, worst-progressed first, so the ones with the
  // most run left to deliver are what an ops person sees before scrolling.
  const running = active
    .map((ad) => ({ ad, sched: schedule(ad, now.getTime()) }))
    .filter((r) => r.sched.fraction !== null)
    .sort((a, b) => (a.sched.fraction ?? 0) - (b.sched.fraction ?? 0));

  return (
    <Stack>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<IndianRupee size={18} />}
          label="Booked today"
          value={inr(bookedToday)}
          sub={format(now, "d MMM yyyy")}
        />
        <Stat
          icon={<CalendarRange size={18} />}
          label="Booked this month"
          value={inr(bookedMonth)}
          sub={format(now, "MMMM yyyy")}
        />
        <Stat
          icon={<Eye size={18} />}
          label="Impressions, all time"
          value={impressions.toLocaleString("en-IN")}
          sub={`${active.length} campaign${active.length === 1 ? "" : "s"} active now`}
        />
        <Stat
          icon={<MousePointerClick size={18} />}
          label="Platform click-through"
          value={formatCtr(platformCtr)}
          sub={`${clicks.toLocaleString("en-IN")} clicks`}
        />
      </div>

      {/*
        The single most important sentence on this screen. Without it, "Booked
        today" reads as delivery spend and the bars below read as a budget being
        consumed, and neither is what the schema says.
      */}
      <Note>
        <span className="font-semibold text-ink">These are not delivery costs.</span> Cosora ads are
        prepaid at a flat rate per placement per day, computed server-side by{" "}
        <span className="font-mono text-2xs">razorpay-create-order</span>. There is no CPM, no CPC and
        no running spend meter anywhere in the database, so the money above is{" "}
        <span className="font-medium text-ink">revenue booked</span> from paid{" "}
        <span className="font-mono text-2xs">ad_orders</span> in that window, and the bars below are a{" "}
        <span className="font-medium text-ink">schedule burn-down</span> of money that already moved.
        An impression costs the vendor nothing.
      </Note>

      <Panel
        title="Vendor click-through leaderboard"
        description="Every campaign a vendor has ever run, pooled. Vendors whose ads have never been served sort last rather than as a zero rate: unmeasured and ignored are different problems."
      >
        {leaderboard.length === 0 ? (
          <Empty>No campaigns exist yet.</Empty>
        ) : (
          <Table head={["Vendor", "Campaigns", "Impressions", "Clicks", "CTR", "Needs a look"]}>
            {leaderboard.map((v) => {
              const vendor = vendors.get(v.vendorId);
              return (
                <tr key={v.vendorId} className={ROW_HOVER}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink">
                      {vendor?.brand_name ?? "Unknown vendor"}
                    </span>
                    {vendor?.city && (
                      <span className="block text-2xs text-ink-faint">{vendor.city}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-muted">
                    {v.campaigns}
                    {v.activeCampaigns > 0 && (
                      <span className="text-2xs text-ink-faint"> ({v.activeCampaigns} active)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-muted">
                    {v.impressions.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-muted">
                    {v.clicks.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {v.ctr === null ? (
                      <span className="text-ink-ghost">no data</span>
                    ) : (
                      <span className="font-medium text-ink">{formatCtr(v.ctr)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {v.flagged > 0 ? (
                      <Badge tone="caution">
                        {v.flagged} campaign{v.flagged === 1 ? "" : "s"}
                      </Badge>
                    ) : (
                      <span className="text-2xs text-ink-ghost">nothing flagged</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      <Panel
        title="Prepaid schedule burn-down"
        description="How far each live campaign has run against the run it was bought for. The rupee figure is the share of the prepaid total those elapsed days account for, not money spent during delivery."
      >
        {running.length === 0 ? (
          <Empty>
            No active campaign carries both a start and an end date, so there is no schedule to
            measure.
          </Empty>
        ) : (
          <div className="divide-y divide-line">
            {running.map(({ ad, sched }) => {
              const vendor = vendors.get(ad.vendor_id);
              return (
                <div key={ad.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_16rem] sm:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{ad.title}</div>
                    <div className="mt-0.5 truncate text-2xs text-ink-faint">
                      {vendor?.brand_name ?? "Unknown vendor"}
                      {ad.placement ? ` · ${ad.placement}` : ""}
                    </div>
                  </div>
                  <Meter
                    value={sched.elapsedDays ?? 0}
                    max={sched.totalDays ?? 1}
                    tone={sched.fraction != null && sched.fraction > 0.9 ? "caution" : "neutral"}
                    title={`Day ${sched.elapsedDays} of ${sched.totalDays}`}
                    caption={
                      sched.prepaid != null && sched.committed != null ? (
                        <>
                          day {sched.elapsedDays} of {sched.totalDays} · {inr(sched.committed)} of{" "}
                          {inr(sched.prepaid)} delivered
                        </>
                      ) : (
                        <>
                          day {sched.elapsedDays} of {sched.totalDays} · no budget figure on this row
                        </>
                      )
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title="Campaigns worth a look"
        description={`Served at least ${FLAG_MIN_IMPRESSIONS} times and either never clicked, or clicked so rarely the placement is effectively invisible. Rendered for review only: nothing here pauses, rejects or emails anyone.`}
      >
        {/*
          Said explicitly, because the brief asked for a conversions ratio and
          this is deliberately not one. Quietly substituting a different metric
          under the same name is how a dashboard starts lying.
        */}
        <Note className="mb-3">
          <span className="font-semibold text-ink">Not a conversion metric.</span> Cosora records no
          conversion event: <span className="font-mono text-2xs">advertisements</span> has an
          impression counter and a click counter and nothing else, and no table links a campaign to
          an RFQ, a quote or an order. A "clicks with zero conversions" ratio cannot be computed
          without a table that does not exist, so these two delivery signals stand in until one does.
        </Note>

        {flagged.length === 0 ? (
          <Empty>
            Nothing is flagged. Every campaign with more than {FLAG_MIN_IMPRESSIONS} impressions is
            getting clicks.
          </Empty>
        ) : (
          <div className="space-y-2">
            {flagged.map(({ ad, flag, why }) => (
              <Card key={ad.id} padded={false} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{ad.title}</span>
                    <Badge tone="caution">
                      {flag === "never_clicked" ? "never clicked" : "very low CTR"}
                    </Badge>
                    {ad.status !== "active" && <Badge>{ad.status}</Badge>}
                  </div>
                  <div className="mt-0.5 text-2xs text-ink-faint">
                    {vendors.get(ad.vendor_id)?.brand_name ?? "Unknown vendor"} · {why}
                  </div>
                </div>
                <div className="text-right text-2xs tabular-nums text-ink-muted">
                  <div>{ad.impressions.toLocaleString("en-IN")} impressions</div>
                  <div>{ad.clicks.toLocaleString("en-IN")} clicks</div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Panel>
    </Stack>
  );
}
