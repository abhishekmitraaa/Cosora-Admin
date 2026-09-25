import { useQuery } from "@tanstack/react-query";
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
      // `database.types.ts` is generated and predates this RPC, so the typed
      // client does not know the name yet. Cast at the boundary only, matching
      // the pattern already used in ChatKeywords / FlagLog / AccountStatus —
      // HealthRow above is the contract, and it mirrors the function's declared
      // RETURNS TABLE exactly.
      const { data, error } = await supabase.rpc(
        "admin_embedding_pipeline_health" as never,
        { p_limit: 60 } as never,
      );
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
  const failureRows = failures.data ?? [];
  const refused = failureRows.reduce((n, r) => n + r.count, 0);

  const rows = data ?? [];
  const latest = rows[0];
  // "Has this been unhealthy at all recently?" is the question this page is for,
  // and it is not answered by the newest row alone — a pipeline that failed for
  // an hour and recovered still needs looking at.
  const unhealthy = rows.filter((r) => r.status !== "OK");

  return (
    <Page>
      <PageHeader
        title="System Health"
        subtitle="Embedding pipeline status, sampled every 10 minutes, and analytics events that couldn't be recorded. Read-only."
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
