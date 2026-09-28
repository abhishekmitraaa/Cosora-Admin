import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ExternalLink, Eye, MousePointerClick, Users } from "lucide-react";
import { useRole } from "@/hooks/useAdminSession";
import { canSee } from "@/lib/roles";
import { tokenColor, useResolvedTheme } from "@/lib/theme";
import { EVENT_LABELS, LIVE_REFRESH_MS, WINDOWS, useLiveActivity, type LiveActivity as Live } from "@/lib/liveActivity";
import {
  Badge,
  Button,
  Empty,
  ErrorNote,
  Note,
  Notice,
  Page,
  PageHeader,
  Panel,
  Select,
  SkeletonList,
  Stack,
  Stat,
} from "@/components/ui";

/**
 * LIVE ACTIVITY: the buyer site right now (admin completion Phase 8; Mitra's choice,
 * "native dashboard + Clarity").
 *
 * The figures are Cosora's own. admin_live_activity() (lib/liveActivity.ts) reads the
 * event log the buyer site already writes: product and storefront views, searches,
 * clicks, button taps and ad impressions. The page asks again every 30 seconds and
 * pauses while its tab is hidden.
 *
 * Session recordings and heatmaps are Microsoft Clarity's, reached by link. Clarity's
 * dashboard sends X-Frame-Options and sits behind a Microsoft sign-in, so it can't be
 * embedded here. The buyer site loads Clarity only in production and only when
 * VITE_CLARITY_PROJECT_ID is set (textile-spark-net lib/analytics/clarity.ts), with
 * sign-in, chats, onboarding, KYC, profile, requirement and billing screens masked.
 *
 * roles.ts section "traction": every role reads it, nobody writes. Seller names link
 * to their detail page only for the roles that can open it.
 */

/** Not a secret: it is in the tag URL every buyer-site visitor downloads. */
const CLARITY_ID = (import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined)?.trim() || null;
const CLARITY = CLARITY_ID
  ? {
      dashboard: `https://clarity.microsoft.com/projects/view/${CLARITY_ID}/dashboard`,
      recordings: `https://clarity.microsoft.com/projects/view/${CLARITY_ID}/impressions`,
      heatmaps: `https://clarity.microsoft.com/projects/view/${CLARITY_ID}/heatmaps`,
    }
  : null;

type Minute = Live["per_minute"][number];

/** Chart colours from the token set, re-read when the theme flips (as on Reports). */
function useChartInk() {
  useResolvedTheme();
  return {
    series: tokenColor("viz-series"),
    grid: tokenColor("viz-grid"),
    axis: tokenColor("viz-axis"),
    axisText: tokenColor("ink-faint"),
    hover: tokenColor("surface-2"),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

function MinuteTooltip({ active, payload }: { active?: boolean; payload?: { payload: Minute }[] }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink shadow-card">
      <div className="font-semibold tabular-nums">{format(new Date(m.minute), "HH:mm")}</div>
      <div className="text-ink-muted">
        {plural(m.events, "event")} · {plural(m.visitors, "visitor")}
      </div>
    </div>
  );
}

/**
 * A ranked list for a half-width panel. Not <Table>: its 640px minimum width would
 * scroll the figures out of sight at this size.
 */
function RankList({
  rows,
}: {
  rows: { key: string; primary: ReactNode; secondary?: ReactNode; figure: string; detail?: string }[];
}) {
  return (
    <ol className="divide-y divide-line text-sm">
      {rows.map((r, i) => (
        <li key={r.key} className="flex items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="w-4 shrink-0 text-right text-2xs tabular-nums text-ink-faint">{i + 1}</span>
            <div className="min-w-0">
              <div className="truncate text-ink">{r.primary}</div>
              {r.secondary && <div className="truncate text-2xs text-ink-faint">{r.secondary}</div>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-semibold tabular-nums text-ink">{r.figure}</div>
            {r.detail && <div className="text-2xs tabular-nums text-ink-faint">{r.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function LiveActivity() {
  const role = useRole();
  const ink = useChartInk();
  const [minutes, setMinutes] = useState<number>(60);
  const live = useLiveActivity(minutes);
  const windowLabel = WINDOWS.find((w) => w.minutes === minutes)?.label ?? `Last ${minutes} minutes`;
  const linkVendors = canSee(role, "vendors");

  const header = (
    <PageHeader
      title="Live Activity"
      subtitle="What people are doing on the buyer site right now, from Cosora's own event log."
      actions={
        <Select aria-label="Window" value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))}>
          {WINDOWS.map((w) => (
            <option key={w.minutes} value={w.minutes}>
              {w.label}
            </option>
          ))}
        </Select>
      }
    />
  );

  if (live.isLoading) {
    return (
      <Page>
        {header}
        <SkeletonList rows={3} height="h-40" />
      </Page>
    );
  }
  if (live.error) {
    return (
      <Page>
        {header}
        <ErrorNote message={(live.error as Error).message} />
      </Page>
    );
  }

  const d = live.data!;
  const lastHourEvents = d.per_minute.reduce((s, m) => s + m.events, 0);
  const count = (t: (typeof EVENT_LABELS)[number][0]) => d.by_type[t] ?? 0;

  return (
    <Page>
      {header}

      <Stack>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone="neutral">
            refreshes every {LIVE_REFRESH_MS / 1000} s while this tab is open
            {live.dataUpdatedAt ? ` · updated ${format(new Date(live.dataUpdatedAt), "HH:mm:ss")}` : ""}
          </Badge>
          {live.isFetching && <span className="text-2xs text-ink-faint">Updating…</span>}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            icon={<Activity size={18} />}
            label="Active, last 5 minutes"
            value={d.active_now.visitors.toLocaleString("en-IN")}
            sub={`${d.active_now.signed_in} signed in · ${d.active_now.guests} guests`}
            tone={d.active_now.visitors > 0 ? "positive" : undefined}
          />
          <Stat
            icon={<Users size={18} />}
            label={`Visitors, ${windowLabel.toLowerCase()}`}
            value={d.active_window.visitors.toLocaleString("en-IN")}
            sub={`${d.active_window.signed_in} signed in · ${d.active_window.guests} guests`}
          />
          <Stat
            icon={<Eye size={18} />}
            label={`Product views, ${windowLabel.toLowerCase()}`}
            value={count("product_view").toLocaleString("en-IN")}
            sub={`${plural(count("profile_view"), "storefront view")}`}
          />
          <Stat
            icon={<MousePointerClick size={18} />}
            label={`Events, ${windowLabel.toLowerCase()}`}
            value={d.active_window.events.toLocaleString("en-IN")}
            sub={`${count("ad_impression").toLocaleString("en-IN")} ${count("ad_impression") === 1 ? "is an ad impression" : "are ad impressions"}`}
          />
        </div>

        <Panel
          title="The last 60 minutes"
          description="Events per minute, whatever the window above. Hover a bar for its visitors."
        >
          {lastHourEvents === 0 ? (
            <Empty>Nothing was tracked on the buyer site in the last hour.</Empty>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.per_minute} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={ink.grid} vertical={false} />
                  <XAxis
                    dataKey="minute"
                    interval={9}
                    tickFormatter={(v: string) => format(new Date(v), "HH:mm")}
                    tick={{ fontSize: 11, fill: ink.axisText }}
                    stroke={ink.axis}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: ink.axisText }}
                    stroke={ink.axis}
                    width={32}
                  />
                  <Tooltip content={<MinuteTooltip />} cursor={{ fill: ink.hover }} />
                  <Bar dataKey="events" fill={ink.series} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Most-viewed products" description={windowLabel}>
            {d.top_products.length === 0 ? (
              <Empty>No product was viewed in this window.</Empty>
            ) : (
              <RankList
                rows={d.top_products.map((p) => ({
                  key: p.id,
                  primary: p.name ?? "Removed product",
                  secondary: p.vendor ?? undefined,
                  figure: plural(p.views, "view"),
                  detail: plural(p.visitors, "visitor"),
                }))}
              />
            )}
          </Panel>

          <Panel
            title="Busiest sellers"
            description={`${windowLabel}. Buyer actions: views, clicks and button taps; impressions are left out.`}
          >
            {d.top_vendors.length === 0 ? (
              <Empty>No buyer action reached a seller in this window.</Empty>
            ) : (
              <RankList
                rows={d.top_vendors.map((v) => ({
                  key: v.id,
                  primary: linkVendors ? (
                    <Link to={`/vendors/${v.id}`} className="underline-offset-2 hover:underline">
                      {v.name ?? "Unnamed vendor"}
                    </Link>
                  ) : (
                    (v.name ?? "Unnamed vendor")
                  ),
                  figure: plural(v.actions, "action"),
                  detail: plural(v.visitors, "visitor"),
                }))}
              />
            )}
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Searches"
            description="Shown only once at least 3 different visitors made the same search in this window. A rarer one could identify the person who typed it."
          >
            {d.top_searches.length === 0 ? (
              <Empty>No search reached 3 different visitors in this window.</Empty>
            ) : (
              <RankList
                rows={d.top_searches.map((s) => ({ key: s.query, primary: s.query, figure: plural(s.visitors, "visitor") }))}
              />
            )}
          </Panel>

          <Panel title="Events by type" description={windowLabel}>
            <ul className="divide-y divide-line text-sm">
              {EVENT_LABELS.map(([type, label]) => (
                <li key={type} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-ink-muted">{label}</span>
                  <span className="font-semibold tabular-nums text-ink">{count(type).toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Note>
          <span className="font-semibold text-ink">What counts.</span> A visitor is a signed-in account, or a
          signed-out browser tab session, so one signed-out person with two tabs counts twice. Active means at
          least one tracked event: viewing a product or a storefront, searching, clicking a result or an ad,
          tapping call, message or WhatsApp, or loading a page with sponsored cards. Someone reading a page
          without doing any of those isn't counted.
        </Note>

        {CLARITY ? (
          <Panel
            title="Recordings and heatmaps"
            description="Microsoft Clarity: replays of real visits, heatmaps, rage and dead clicks."
          >
            <div className="flex flex-wrap gap-2">
              <a href={CLARITY.dashboard} target="_blank" rel="noopener noreferrer">
                <Button variant="primary">
                  Open Clarity <ExternalLink size={14} />
                </Button>
              </a>
              <a href={CLARITY.recordings} target="_blank" rel="noopener noreferrer">
                <Button>
                  Session recordings <ExternalLink size={14} />
                </Button>
              </a>
              <a href={CLARITY.heatmaps} target="_blank" rel="noopener noreferrer">
                <Button>
                  Heatmaps <ExternalLink size={14} />
                </Button>
              </a>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              These open in a new tab and need a Microsoft account with access to the Cosora Clarity project.
              Signing in here doesn't sign you in there. Clarity can't be embedded on this page: its dashboard
              refuses to load in a frame.
            </p>
          </Panel>
        ) : (
          <Notice tone="caution" title="Clarity isn't connected yet">
            <p className="mt-1">
              Session recordings and heatmaps come from Microsoft Clarity, which isn't set up. To turn it on:
              create a Clarity project, set <span className="font-mono text-2xs">VITE_CLARITY_PROJECT_ID</span> to
              its id in both Vercel projects (the buyer site loads Clarity; this panel links to it), set the
              project's masking mode to Strict, and redeploy both. The figures above don't depend on it.
            </p>
          </Notice>
        )}
      </Stack>
    </Page>
  );
}
