import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CalendarClock, Gift, Hourglass, IndianRupee, RefreshCw, TrendingDown, Users } from "lucide-react";
import { Badge, Panel, Stat } from "@/components/ui";
import { rupees, useSubscriptionKpis, type SubscriptionKpis as Kpis } from "@/lib/subscriptionAdmin";

const PLAN_ORDER = ["basic", "silver", "gold", "vip"];
const PLAN_LABEL: Record<string, string> = { basic: "Basic", silver: "Silver", gold: "Gold", vip: "VIP" };
const CHANNEL_LABEL: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS" };

/** Stat truncates its sub-line; these may take two lines. */
const wrap = (text: string) => <span className="whitespace-normal">{text}</span>;

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

/**
 * The subscription figures (subscriptions P12, 2026-10-09), from admin_subscription_kpis():
 * paid plans running and in their grace days by plan, recurring revenue a month (before GST;
 * each plan at what its renewal charges, complimentary plans and demo payments left out),
 * renewals coming up, churn over 30 days, the share on autopay, payment trouble, and how
 * many emails and WhatsApp messages went out in the last 7 days.
 *
 * Shows nothing before the P12 migration is applied, or to a role the figures aren't for.
 */
export function SubscriptionKpis() {
  const kpis = useSubscriptionKpis();
  const k = kpis.data;
  if (!k) return null;

  const inForce = k.running + k.in_grace;
  const churnBase = inForce + k.lapsed_30d;
  const trouble = k.mandates_pending + k.mandates_halted + k.failed_payments_7d;
  const byPlan = PLAN_ORDER.filter((p) => (k.by_plan[p] ?? 0) > 0)
    .map((p) => `${PLAN_LABEL[p]} ${k.by_plan[p]}`)
    .join(" · ");

  return (
    <Panel
      title="At a glance"
      description={`Paid plans, recurring revenue and what needs attention. Worked out ${formatDistanceToNow(new Date(k.as_of), { addSuffix: true })}.`}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="subscription-kpis">
        <Stat icon={<Users className="h-5 w-5" />} label="Paid plans running" value={String(k.running)} sub={wrap(byPlan || "none yet")} />
        <Stat
          icon={<IndianRupee className="h-5 w-5" />}
          label="Recurring revenue a month"
          value={rupees(k.mrr_live)}
          sub={wrap(k.mrr_test > 0 ? `before GST · ${rupees(k.mrr_test)} more in test mode` : "before GST")}
        />
        <Stat
          icon={<CalendarClock className="h-5 w-5" />}
          label="Ending in 7 days"
          value={String(k.expiring_7d)}
          sub={wrap(`${k.expiring_7d_manual} without autopay · ${k.expiring_30d} in 30 days`)}
          tone={k.expiring_7d_manual > 0 ? "caution" : undefined}
        />
        <Stat icon={<Hourglass className="h-5 w-5" />} label="In their grace days" value={String(k.in_grace)} sub={wrap("period over, plan still on")} tone={k.in_grace > 0 ? "caution" : undefined} />
        <Stat icon={<TrendingDown className="h-5 w-5" />} label="Churn, 30 days" value={pct(k.lapsed_30d, churnBase)} sub={`${k.lapsed_30d} paid plan${k.lapsed_30d === 1 ? "" : "s"} ended`} />
        <Stat icon={<RefreshCw className="h-5 w-5" />} label="On autopay" value={pct(k.autopay_on, k.running)} sub={`${k.autopay_on} of ${k.running} running`} />
        <Stat
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Payment trouble"
          value={String(trouble)}
          sub={wrap(`${k.mandates_halted} halted · ${k.mandates_pending} retrying · ${k.failed_payments_7d} failed in 7 days`)}
          tone={trouble > 0 ? "critical" : undefined}
        />
        <Stat icon={<Gift className="h-5 w-5" />} label="Complimentary" value={String(k.granted)} sub="given by Cosora, no charge" />
      </div>
      <DeliveryLine delivery={k.delivery_7d} incidents={k.open_incidents} />
    </Panel>
  );
}

function DeliveryLine({ delivery, incidents }: { delivery: Kpis["delivery_7d"]; incidents: number }) {
  const channels = Object.entries(delivery);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted" data-testid="subscription-delivery">
      <span>Messages in the last 7 days:</span>
      {channels.length === 0 && <span className="text-ink-faint">none sent</span>}
      {channels.map(([channel, by]) => {
        const sent = by.sent ?? 0;
        const failed = by.failed ?? 0;
        return (
          <Badge key={channel} tone={failed > 0 ? "caution" : "positive"}>
            {`${CHANNEL_LABEL[channel] ?? channel}: ${sent} sent${failed ? `, ${failed} failed` : ""} (${pct(sent, sent + failed)})`}
          </Badge>
        );
      })}
      {incidents > 0 && <Badge tone="critical">{`${incidents} billing incident${incidents === 1 ? "" : "s"} open`}</Badge>}
    </div>
  );
}
