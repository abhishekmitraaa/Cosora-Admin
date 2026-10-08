import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { describeWriteError, supabase } from "@/lib/supabase";
import { Badge, Button, Empty, Note, Panel, SkeletonList, Table } from "@/components/ui";

type Channel = "email" | "whatsapp" | "sms";

interface ChannelCounts {
  due: number;
  waiting: number;
  sending: number;
  sent_24h: number;
  failed_24h: number;
  skipped_24h: number;
  oldest_due_at: string | null;
}

interface Health {
  dispatcher: {
    last_run_at: string | null;
    configured: Partial<Record<Channel, boolean>>;
    last_claimed: number;
    last_sent: number;
    last_failed: number;
  };
  channels: Record<Channel, ChannelCounts>;
  recent_failures: {
    id: string;
    channel: Channel;
    template_key: string;
    to_masked: string;
    attempts: number;
    status: string;
    last_error: string | null;
    created_at: string;
  }[];
}

const CHANNELS: { key: Channel; label: string; provider: string }[] = [
  { key: "email", label: "Email", provider: "Resend" },
  { key: "whatsapp", label: "WhatsApp", provider: "Meta Cloud API" },
  { key: "sms", label: "SMS", provider: "not chosen yet" },
];

const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never");

/**
 * Notification delivery (subscriptions P2, 2026-10-08): the outbox that email, WhatsApp
 * and SMS go out from, as notification-dispatch sees it. Per channel: whether the
 * dispatcher's secrets configure it (as of its last run), what is due, waiting to retry
 * or being sent, and the last 24 hours' sent, failed and skipped (a channel that isn't
 * configured skips its messages rather than holding them). Recent failures show the
 * provider's own words. A super admin can send a test to their own address.
 *
 * Shows nothing before the P2 migration is applied (the reader doesn't exist yet).
 */
export function NotificationDeliveryPanel({ canTest }: { canTest: boolean }) {
  const qc = useQueryClient();
  const health = useQuery({
    queryKey: ["admin_notification_health"],
    queryFn: async (): Promise<Health | null> => {
      const { data, error } = await supabase.rpc("admin_notification_health");
      if (error?.code === "PGRST202") return null;
      if (error) throw new Error(error.message);
      return data as unknown as Health;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const test = useMutation({
    mutationFn: async (channel: Channel) => {
      const { data, error } = await supabase.rpc("admin_notification_test", { p_channel: channel });
      if (error) throw new Error(describeWriteError(error));
      return data as unknown as { queued: boolean; to?: string; reason?: string };
    },
    onSuccess: (r) => {
      if (r.queued) toast.success(`Test queued to ${r.to}. It goes out on the dispatcher's next run.`);
      else if (r.reason === "rate_limited") toast.error("Five tests an hour at most. Try again later.");
      else toast.error("There's no address on your account for that channel.");
      void qc.invalidateQueries({ queryKey: ["admin_notification_health"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  if (health.isPending) return <SkeletonList rows={1} height="h-24" />;
  if (health.data === null) return null;
  if (health.error) return <Note>{(health.error as Error).message}</Note>;
  const h = health.data!;
  const lastRun = h.dispatcher?.last_run_at ?? null;
  // The dispatcher runs every minute while anything is due; a due message older than
  // 5 minutes means it isn't running.
  const stuck = CHANNELS.some(({ key }) => {
    const at = h.channels[key]?.oldest_due_at;
    return at ? Date.now() - new Date(at).getTime() > 5 * 60_000 : false;
  });

  return (
    <Panel
      title="Notification delivery"
      description={`Email, WhatsApp and SMS from the notification outbox. Dispatcher last ran ${ago(lastRun)}${lastRun ? ` (claimed ${h.dispatcher.last_claimed}, sent ${h.dispatcher.last_sent}, failed ${h.dispatcher.last_failed})` : ""}.`}
    >
      {stuck && (
        <Note className="mb-3">
          Messages have been due for over 5 minutes: the notification-dispatch job isn't running, or can't reach the function.
          Check Scheduled jobs below.
        </Note>
      )}
      <div data-testid="notification-delivery">
        <Table head={["Channel", "Provider", "Due", "Retrying", "Sending", "Sent 24h", "Failed 24h", "Skipped 24h", ""]}>
          {CHANNELS.map(({ key, label, provider }) => {
            const c = h.channels[key];
            const configured = h.dispatcher?.configured?.[key];
            return (
              <tr key={key}>
                <td className="px-3 py-2 font-medium text-ink">{label}</td>
                <td className="px-3 py-2 text-xs">
                  {configured === undefined || !lastRun ? (
                    <span className="text-ink-faint">{provider} · not seen yet</span>
                  ) : configured ? (
                    <Badge tone="positive">{provider}</Badge>
                  ) : (
                    <Badge tone="caution">{`${provider} · not configured`}</Badge>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">{c?.due ?? 0}</td>
                <td className="px-3 py-2 tabular-nums">{c?.waiting ?? 0}</td>
                <td className="px-3 py-2 tabular-nums">{c?.sending ?? 0}</td>
                <td className="px-3 py-2 tabular-nums">{c?.sent_24h ?? 0}</td>
                <td className="px-3 py-2 tabular-nums">{c?.failed_24h ?? 0}</td>
                <td className="px-3 py-2 tabular-nums">{c?.skipped_24h ?? 0}</td>
                <td className="px-3 py-2 text-right">
                  {canTest && (
                    <Button size="sm" disabled={test.isPending} onClick={() => test.mutate(key)}>
                      Send a test
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </div>

      <h3 className="mb-2 mt-5 text-sm font-semibold text-ink">Recent failures and skips</h3>
      {h.recent_failures.length === 0 ? (
        <Empty>Nothing has failed or been skipped.</Empty>
      ) : (
        <Table head={["When", "Channel", "Message", "To", "Attempts", "Status", "Why"]}>
          {h.recent_failures.map((f) => (
            <tr key={f.id}>
              <td className="px-3 py-2 text-xs text-ink-muted">{ago(f.created_at)}</td>
              <td className="px-3 py-2 text-xs">{f.channel}</td>
              <td className="px-3 py-2 font-mono text-2xs">{f.template_key}</td>
              <td className="px-3 py-2 font-mono text-2xs">{f.to_masked}</td>
              <td className="px-3 py-2 tabular-nums">{f.attempts}</td>
              <td className="px-3 py-2">
                <Badge tone={f.status === "failed" ? "critical" : "caution"}>{f.status === "queued" ? "retrying" : f.status}</Badge>
              </td>
              <td className="px-3 py-2 text-xs text-ink-muted">{f.last_error === "not_configured" ? "Channel not configured" : f.last_error}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}
