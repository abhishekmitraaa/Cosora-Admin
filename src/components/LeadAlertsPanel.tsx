import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/hooks/useAdminSession";
import { Badge, Note, Panel } from "@/components/ui";

interface Stats {
  since: string;
  requirements_matched: number;
  match_errors: number;
  /** Requirements that told nobody because their buyer had raised too many alerts that day. */
  skipped_buyer_cap?: number;
  alerts: number;
  vendors_told: number;
  as_it_happened: number;
  held: Partial<Record<"off" | "digest_only" | "rate_limit" | "quiet_hours", number>>;
  waiting_for_digest: number;
  last_error: { rfq_id: string; at: string; error: string } | null;
}

const HELD_LABEL: Record<keyof Stats["held"], string> = {
  digest_only: "for the daily summary (the plan's channel)",
  rate_limit: "by the hourly limit",
  quiet_hours: "by the vendor's quiet hours",
  off: "because the vendor turned instant alerts off",
};

/**
 * Lead alerts (subscriptions P6, 2026-10-09): whether vendors are being told about buyer
 * requirements that suit them. Counts for the last 7 days from admin_lead_alert_stats():
 * requirements matched, alerts raised, how many went out as they happened and why the rest
 * were held, what is waiting for the next daily summary, how many requirements told nobody
 * because their buyer had already raised the day's limit of alerts, and the last matching
 * error (a failed match never stops the requirement being posted; the daily run retries it).
 *
 * Shows nothing before the P6 migration is applied, or to a role the figures aren't for.
 */
export function LeadAlertsPanel() {
  // admin_lead_alert_stats is for super_admin, manager and support; the other roles that open
  // Leads don't ask (it was a 403; subscriptions sweep, 2026-10-09).
  const role = useRole();
  const stats = useQuery({
    queryKey: ["lead-alert-stats"],
    enabled: role === "super_admin" || role === "manager" || role === "support",
    queryFn: async (): Promise<Stats | null> => {
      const { data, error } = await supabase.rpc("admin_lead_alert_stats", { p_days: 7 });
      if (error) {
        if (error.code === "PGRST202" || error.code === "42501") return null;
        throw new Error(error.message);
      }
      return data as unknown as Stats;
    },
    staleTime: 60_000,
  });
  const s = stats.data;
  if (!s) return null;
  const held = Object.entries(s.held) as [keyof Stats["held"], number][];

  return (
    <Panel
      title="Lead alerts"
      description="Vendors told about requirements that suit them, in the last 7 days. Each plan's channels decide how; nobody is told while the Lead alerts switch doesn't list them."
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted" data-testid="lead-alert-stats">
        <Badge tone="info">{`${s.requirements_matched} requirement${s.requirements_matched === 1 ? "" : "s"} matched`}</Badge>
        <Badge>{`${s.alerts} alert${s.alerts === 1 ? "" : "s"} to ${s.vendors_told} vendor${s.vendors_told === 1 ? "" : "s"}`}</Badge>
        <Badge tone="positive">{`${s.as_it_happened} as they happened`}</Badge>
        {s.waiting_for_digest > 0 && <Badge tone="caution">{`${s.waiting_for_digest} waiting for the daily summary`}</Badge>}
        {s.match_errors > 0 && <Badge tone="critical">{`${s.match_errors} not matched yet`}</Badge>}
        {(s.skipped_buyer_cap ?? 0) > 0 && <Badge tone="caution">{`${s.skipped_buyer_cap} told nobody: the buyer's daily limit`}</Badge>}
      </div>
      {held.length > 0 && (
        <p className="mt-2 text-xs text-ink-faint">
          Held: {held.map(([k, n]) => `${n} ${HELD_LABEL[k]}`).join("; ")}.
        </p>
      )}
      {s.last_error && (
        <Note className="mt-3">
          The last requirement that couldn't be matched ({formatDistanceToNow(new Date(s.last_error.at), { addSuffix: true })}):{" "}
          <span className="font-mono text-2xs">{s.last_error.error}</span>. It was still posted; the daily run tries it again.
        </Note>
      )}
    </Panel>
  );
}
