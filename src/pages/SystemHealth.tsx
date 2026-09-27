import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Badge,
  Empty,
  ErrorNote,
  Note,
  Page,
  PageHeader,
  Panel,
  SkeletonList,
  Stack,
  Stat,
  Table,
} from "@/components/ui";

/**
 * SYSTEM HEALTH — embedding pipeline.
 *
 * WHY THIS PAGE EXISTS. This project lost three days to a silent 100% failure:
 * the embedding worker's Vault secret was missing, so every run was a no-op,
 * and because a SQL statement that does nothing still SUCCEEDS, pg_cron
 * recorded `status = 'succeeded'` 3,960 consecutive times over a dead pipeline.
 * Nothing was embedded, no search was semantic, and nothing anywhere said so.
 *
 * `embedding_pipeline_health()` was written afterwards to catch exactly that,
 * and a cron now samples it every 10 minutes into
 * `embedding_pipeline_health_log`. But until this page, the only places that
 * history surfaced were `cron.job_run_details` (a failed run) and the
 * buyer/vendor app's own /notifications page — checked, it does render these,
 * because it filters no `kind` and falls back gracefully on unknown ones. That
 * is the wrong app: admins work here.
 *
 * READ PATH. `admin_embedding_pipeline_health()` — a SECURITY DEFINER reader
 * gated on super_admin/vendor_ops. The log table itself stays service_role-only
 * with RLS on and no policies; nothing in a browser should be able to write it,
 * so it is not granted to `authenticated` just to make a page possible.
 *
 * Read-only. There is no mutation on this page — the correct response to a bad
 * status is to go and fix the pipeline, not to dismiss a row.
 *
 * REFUSED ANALYTICS EVENTS (MPF-23, 2026-09-25). log_engagement_event() used to
 * swallow every error, so an event with a bad type or source vanished without a
 * trace. It now records each such failure in admin.engagement_event_failures, one
 * row per hour per error with a count, and this page lists the last 7 days through
 * admin_engagement_event_failures() (same super_admin/vendor_ops gate). An unknown
 * product, ad or vendor id stays quiet: that is junk a client can send.
 *
 * SCHEDULED JOBS (admin completion, Phase 2, 2026-09-27). Every pg_cron job was
 * deleted on 2026-09-26 and the essential ones came back on 2026-09-27 (textile-spark-net
 * migration 20260927153142). This page shows each job's last run and its last 24 hours
 * through admin_cron_status() (same super_admin/vendor_ops gate), and warns when the
 * health history itself has gone quiet, because a sample that stops arriving looks
 * exactly like a healthy one that hasn't changed.
 */

interface FailureRow {
  hour: string;
  error_code: string;
  constraint_name: string;
  count: number;
  message: string | null;
  last_event_type: string | null;
  last_source: string | null;
  last_at: string;
}

interface CronRow {
  jobname: string;
  schedule: string;
  active: boolean;
  last_status: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_message: string | null;
  runs_24h: number;
  failures_24h: number;
}

/**
 * What each job is for, and how long a gap between runs is still normal. The gap
 * is twice the schedule, so one missed tick is noticed without every delayed run
 * turning the badge amber. A job not listed here shows its status and nothing else.
 */
const JOBS: Record<string, { purpose: string; maxGapMinutes: number }> = {
  "ads-schedule-sweep": { purpose: "Starts scheduled campaigns and ends finished ones", maxGapMinutes: 10 },
  "embedding-health-log": { purpose: "Samples the embedding pipeline for this page", maxGapMinutes: 20 },
  "faq-snapshots-refresh": { purpose: "Rebuilds the FAQ files the site reads", maxGapMinutes: 120 },
  "subscription-expiry-sweep": { purpose: "Expires subscriptions past their end date", maxGapMinutes: 48 * 60 },
  "account-deletion-sweep": { purpose: "Anonymizes accounts past their 14-day cooling-off", maxGapMinutes: 48 * 60 },
  "account-deletion-sweep-alarm": {
    purpose: "Fails loudly if the deletion sweep cannot authenticate",
    maxGapMinutes: 48 * 60,
  },
  "fx-rates-refresh": { purpose: "Refreshes display-currency rates", maxGapMinutes: 48 * 60 },
  "cron-history-prune": { purpose: "Deletes job history older than 14 days", maxGapMinutes: 48 * 60 },
};

/** Minutes between now and an ISO instant. */
const minutesSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60_000;

interface HealthRow {
  checked_at: string;
  status: string;
  reason: string | null;
  queue_depth: number | null;
  products_missing: number | null;
  rfqs_missing: number | null;
  videos_missing: number | null;
  vault_secret_ok: boolean | null;
}

// OK / WARN / CRITICAL are the three values embedding_pipeline_health() returns.
// Anything else is treated as a warning rather than assumed benign — an
// unrecognised status is not evidence of health.
function toneFor(status: string): "positive" | "caution" | "critical" {
  if (status === "OK") return "positive";
  if (status === "CRITICAL") return "critical";
  return "caution";
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function SystemHealth() {
  const { data, isPending, error } = useQuery({
    queryKey: ["admin_embedding_pipeline_health"],
    queryFn: async (): Promise<HealthRow[]> => {
      const { data, error } = await supabase.rpc("admin_embedding_pipeline_health", { p_limit: 60 });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as HealthRow[];
    },
    // The cron samples every 10 minutes, so anything tighter is just polling an
    // unchanged row.
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const failures = useQuery({
    queryKey: ["admin_engagement_event_failures"],
    queryFn: async (): Promise<FailureRow[]> => {
      const { data, error } = await supabase.rpc("admin_engagement_event_failures", { p_days: 7 });
      if (error) throw new Error(error.message);
      return (data ?? []) as FailureRow[];
    },
    staleTime: 5 * 60_000,
  });
  const cron = useQuery({
    queryKey: ["admin_cron_status"],
    queryFn: async (): Promise<CronRow[]> => {
      const { data, error } = await supabase.rpc("admin_cron_status");
      if (error) throw new Error(error.message);
      return (data ?? []) as CronRow[];
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const cronRows = cron.data ?? [];

  const failureRows = failures.data ?? [];
  const refused = failureRows.reduce((n, r) => n + r.count, 0);

  const rows = data ?? [];
  const latest = rows[0];
  // "Has this been unhealthy at all recently?" is the question this page is for,
  // and it is not answered by the newest row alone — a pipeline that failed for
  // an hour and recovered still needs looking at.
  const unhealthy = rows.filter((r) => r.status !== "OK");
  // A sample that stops arriving looks like a healthy one that hasn't changed.
  // embedding-health-log runs every 10 minutes; past 20, say so.
  const sampleAge = latest ? minutesSince(latest.checked_at) : null;
  const stale = sampleAge !== null && sampleAge > 20;

  return (
    <Page>
      <PageHeader
        title="System Health"
        subtitle="Scheduled jobs, the embedding pipeline (sampled every 10 minutes) and analytics events that couldn't be recorded. Read-only."
        actions={
          latest ? (
            <Badge tone={toneFor(latest.status)} dot>
              {latest.status}
            </Badge>
          ) : undefined
        }
      />

      <Stack>
        {error && <ErrorNote message={(error as Error).message} />}

        <Panel
          title="Current status"
          description="The most recent sample of embedding_pipeline_health()."
        >
          {isPending ? (
            <SkeletonList rows={1} height="h-20" />
          ) : !latest ? (
            <Empty>
              No samples recorded yet. The embedding-health-log cron writes one every 10 minutes.
            </Empty>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Status" value={latest.status} tone={toneFor(latest.status)} />
              <Stat label="Queue depth" value={String(latest.queue_depth ?? 0)} />
              <Stat label="Products missing" value={String(latest.products_missing ?? 0)} />
              <Stat label="RFQs missing" value={String(latest.rfqs_missing ?? 0)} />
              <Stat label="Videos missing" value={String(latest.videos_missing ?? 0)} />
            </div>
          )}
          {latest && stale && (
            <Note className="mt-4">
              <strong>No new sample for {Math.round(sampleAge!)} minutes.</strong> The
              embedding-health-log job samples every 10 minutes, so this status may be out of date.
              Check its last run under Scheduled jobs below.
            </Note>
          )}
          {latest && (
            <Note className="mt-4">
              {latest.reason ?? "no reason reported"} — checked {fmt(latest.checked_at)}.
              {latest.vault_secret_ok === false && (
                <>
                  {" "}
                  <strong>The worker's Vault secret is missing.</strong> This is the exact condition
                  that caused the three-day silent outage; the pipeline is a no-op until it is
                  restored.
                </>
              )}
            </Note>
          )}
        </Panel>

        <Panel
          title="Scheduled jobs"
          description="Database jobs that run on a timer. The every-minute embedding worker is off until OpenAI billing is on, so the pipeline above reports its queue growing."
        >
          {cron.error ? (
            <ErrorNote message={(cron.error as Error).message} />
          ) : cron.isPending ? (
            <SkeletonList rows={4} height="h-10" />
          ) : cronRows.length === 0 ? (
            <Empty>No scheduled jobs exist.</Empty>
          ) : (
            <Table head={["Job", "Schedule (UTC)", "Last run", "Last 24 h", "Last message"]}>
              {cronRows.map((j) => {
                const info = JOBS[j.jobname];
                const late =
                  info !== undefined &&
                  j.last_started_at !== null &&
                  minutesSince(j.last_started_at) > info.maxGapMinutes;
                return (
                  <tr key={j.jobname}>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-ink">{j.jobname}</span>
                      {info && <span className="block text-2xs text-ink-faint">{info.purpose}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-2xs text-ink-muted">
                      {j.schedule}
                      {!j.active && (
                        <span className="ml-2">
                          <Badge tone="caution">paused</Badge>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {j.last_started_at === null ? (
                        <span className="text-ink-faint">not run yet</span>
                      ) : (
                        <>
                          <Badge
                            tone={
                              j.last_status === "succeeded"
                                ? "positive"
                                : j.last_status === "failed"
                                  ? "critical"
                                  : "neutral"
                            }
                            dot
                          >
                            {j.last_status ?? "unknown"}
                          </Badge>
                          <span
                            className={`ml-2 text-2xs ${late ? "font-medium text-caution-fg" : "text-ink-faint"}`}
                          >
                            {formatDistanceToNow(new Date(j.last_started_at), { addSuffix: true })}
                            {late && " (overdue)"}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-muted">
                      {j.runs_24h}
                      {j.failures_24h > 0 && (
                        <span className="ml-2">
                          <Badge tone="critical">{j.failures_24h} failed</Badge>
                        </span>
                      )}
                    </td>
                    <td
                      className="max-w-[20rem] truncate px-3 py-2 text-2xs text-ink-muted"
                      title={j.last_message ?? undefined}
                    >
                      {j.last_message || "—"}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>

        <Panel
          title="Recent samples"
          description={
            unhealthy.length > 0
              ? `${unhealthy.length} of the last ${rows.length} samples were not OK.`
              : "Last 60 samples (about 10 hours)."
          }
        >
          {isPending ? (
            <SkeletonList rows={4} height="h-10" />
          ) : rows.length === 0 ? (
            <Empty>Nothing recorded yet.</Empty>
          ) : (
            <Table head={["Checked", "Status", "Queue", "Missing (P/R/V)", "Vault", "Reason"]}>
              {rows.map((r) => (
                <tr key={r.checked_at}>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{fmt(r.checked_at)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={toneFor(r.status)} dot>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.queue_depth ?? 0}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.products_missing ?? 0} / {r.rfqs_missing ?? 0} / {r.videos_missing ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    {r.vault_secret_ok === false ? (
                      <Badge tone="critical">missing</Badge>
                    ) : (
                      <span className="text-ink-faint">ok</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{r.reason ?? "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel
          title="Analytics events refused"
          description={
            refused > 0
              ? `${refused} event${refused === 1 ? "" : "s"} in the last 7 days couldn't be recorded. Vendors' view and click counts are missing them.`
              : "Events log_engagement_event() couldn't record, last 7 days. An unknown product, ad or vendor id is not counted here."
          }
        >
          {failures.error ? (
            <ErrorNote message={(failures.error as Error).message} />
          ) : failures.isPending ? (
            <SkeletonList rows={2} height="h-10" />
          ) : failureRows.length === 0 ? (
            <Empty>None in the last 7 days.</Empty>
          ) : (
            <Table head={["Hour", "Error", "Count", "Last event type / source", "Message"]}>
              {failureRows.map((r) => (
                <tr key={`${r.hour}-${r.error_code}-${r.constraint_name}`}>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{fmt(r.hour)}</td>
                  <td className="px-3 py-2">
                    <Badge tone="caution">{r.constraint_name || r.error_code}</Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.count}</td>
                  <td className="px-3 py-2 font-mono text-2xs">
                    {r.last_event_type ?? "—"} / {r.last_source ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{r.message ?? "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Note>
          <Activity className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
          A non-OK transition also writes an in-app notification to every admin, and — if an admin
          has created the <code>embedding_alert_webhook_url</code> Vault secret — POSTs CRITICAL
          (not WARN) to that URL. No webhook is configured by default, so that path is inert until
          someone opts in; it needs no redeploy to enable.
        </Note>
      </Stack>
    </Page>
  );
}
