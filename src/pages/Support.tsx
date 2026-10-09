import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FraudRecordsPanel } from "@/components/FraudRecords";
import { format } from "date-fns";
import { Clock, MessageSquare, PhoneCall, ShieldAlert, Lightbulb } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  cn,
  Empty,
  ErrorNote,
  Field,
  Input,
  Notice,
  Page,
  PageHeader,
  Panel,
  ROW_HOVER,
  Select,
  SkeletonList,
  Stack,
  Stat,
  Table,
  type Tone,
} from "@/components/ui";
import {
  ageFrom,
  CHANNEL_LABELS,
  istTime,
  labelText,
  LANGUAGE_LABELS,
  STATUS_LABELS,
  useSupportCounts,
  useSupportList,
  useSupportPriorities,
  useSupportRealtime,
  useSupportSettings,
  VIEW_LABELS,
  type Lang,
  type SupportChannel,
  type SupportFilters,
  type SupportListRow,
  type SupportPriority,
  type SupportStatus,
  type SupportView,
} from "@/lib/support";

/**
 * THE SUPPORT QUEUE (Help & Support, 2026-09-30).
 *
 * One component, four pages: the inbox (every channel) and a board per channel
 * (callbacks, fraud reports, feedback). "Waiting on us" sorts the oldest wait first,
 * so the top row is always the one to answer next. Rows open the ticket workspace.
 */

export const STATUS_TONE: Record<SupportStatus, Tone> = {
  new: "caution",
  open: "info",
  resolved: "positive",
  closed: "neutral",
};

const CHANNEL_TONE: Record<SupportChannel, Tone> = {
  chat: "info",
  callback: "neutral",
  fraud_report: "critical",
  feedback: "neutral",
};

const VIEWS: SupportView[] = ["awaiting", "active", "mine", "unassigned", "resolved", "closed", "all"];

function waitTone(iso: string | null): Tone {
  if (!iso) return "neutral";
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h >= 24) return "critical";
  if (h >= 4) return "caution";
  return "neutral";
}

interface QueueProps {
  channel?: SupportChannel;
  title: string;
  subtitle: string;
  /** Shown under the queue, for example the confirmed-fraud records on the Fraud board. */
  footer?: ReactNode;
}

export function SupportQueue({ channel, title, subtitle, footer }: QueueProps) {
  useSupportRealtime();
  const counts = useSupportCounts();
  const settings = useSupportSettings();

  const [draft, setDraft] = useState<SupportFilters>({
    view: "awaiting",
    channel: channel ?? "",
    category: "",
    side: "",
    language: "",
    search: "",
    includeTest: true,
  });
  // Search waits for a pause in typing; every other filter applies at once.
  const [filters, setFilters] = useState(draft);
  useEffect(() => {
    const t = setTimeout(() => setFilters(draft), draft.search === filters.search ? 0 : 300);
    return () => clearTimeout(t);
  }, [draft, filters.search]);

  const list = useSupportList(filters);
  const rows = useMemo(() => list.data?.pages.flat() ?? [], [list.data]);
  const total = rows[0]?.total_count ?? 0;
  // Gold and VIP vendors' requests (subscriptions P9): the queue already puts them first.
  const priorities = useSupportPriorities(useMemo(() => rows.map((r) => r.id), [rows]));
  const c = counts.data;

  const categories = (settings.data?.categories ?? []).filter((cat) => !channel || cat.channels.includes(channel));
  const filtersActive = Boolean(draft.category || draft.side || draft.language || draft.search || (!channel && draft.channel));

  const viewCount = (v: SupportView): number | undefined => {
    if (!c) return undefined;
    if (v === "awaiting") {
      return channel === "callback" ? c.awaiting_callback
        : channel === "fraud_report" ? c.awaiting_fraud
        : channel === "feedback" ? c.awaiting_feedback
        : channel === "chat" ? c.awaiting_chat
        : c.awaiting;
    }
    if (channel) return undefined;
    if (v === "mine") return c.mine;
    if (v === "unassigned") return c.unassigned;
    return undefined;
  };

  return (
    <Page width="wide">
      <PageHeader title={title} subtitle={subtitle} />
      <Stack>
        <RolloutNotice />

        {!channel && c && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Waiting on us" value={String(c.awaiting)} icon={<Clock size={18} />}
              tone={c.awaiting > 0 ? "caution" : undefined}
              sub={c.oldest_waiting_at ? `oldest ${ageFrom(c.oldest_waiting_at)}` : "nothing waiting"} />
            <Stat label="Chats" value={String(c.awaiting_chat)} icon={<MessageSquare size={18} />} sub="waiting for a reply" />
            <Stat label="Callbacks today" value={String(c.callbacks_today)} icon={<PhoneCall size={18} />}
              tone={c.callbacks_overdue > 0 ? "critical" : undefined}
              sub={c.callbacks_overdue > 0 ? `${c.callbacks_overdue} overdue` : "none overdue"} />
            <Stat label="Fraud reports" value={String(c.awaiting_fraud)} icon={<ShieldAlert size={18} />}
              tone={c.awaiting_fraud > 0 ? "critical" : undefined} sub="to review" />
            <Stat label="Feedback" value={String(c.awaiting_feedback)} icon={<Lightbulb size={18} />} sub="not yet read" />
          </div>
        )}

        <Panel
          title="Requests"
          description="Search matches the request number (CS-000123), its subject, or the requester's name."
          actions={
            filtersActive && (
              <Button size="sm" onClick={() => setDraft({ ...draft, category: "", side: "", language: "", search: "", channel: channel ?? "" })}>
                Clear filters
              </Button>
            )
          }
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {VIEWS.map((v) => {
              const n = viewCount(v);
              return (
                <button
                  key={v}
                  onClick={() => setDraft({ ...draft, view: v })}
                  aria-pressed={draft.view === v}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    draft.view === v
                      ? "border-brand bg-brand-tint text-ink"
                      : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  {VIEW_LABELS[v]}
                  {n != null && n > 0 && (
                    <span className="rounded bg-surface px-1 text-2xs tabular-nums text-ink">{n}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Search" htmlFor="support-search" className="lg:col-span-2">
              <Input
                id="support-search"
                value={draft.search}
                placeholder="CS-000123, subject or name"
                onChange={(e) => setDraft({ ...draft, search: e.target.value })}
              />
            </Field>
            {!channel && (
              <Field label="Channel" htmlFor="support-channel">
                <Select id="support-channel" value={draft.channel}
                  onChange={(e) => setDraft({ ...draft, channel: e.target.value as SupportChannel | "" })}>
                  <option value="">Every channel</option>
                  {(Object.keys(CHANNEL_LABELS) as SupportChannel[]).map((ch) => (
                    <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Topic" htmlFor="support-topic">
              <Select id="support-topic" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                <option value="">Every topic</option>
                {categories.map((cat) => (
                  <option key={cat.code} value={cat.code}>{labelText(cat.label)}</option>
                ))}
              </Select>
            </Field>
            <Field label="From" htmlFor="support-side">
              <Select id="support-side" value={draft.side} onChange={(e) => setDraft({ ...draft, side: e.target.value as SupportFilters["side"] })}>
                <option value="">All</option>
                <option value="buyer">Buyers</option>
                <option value="vendor">Vendors</option>
              </Select>
            </Field>
            <Field label="Language" htmlFor="support-lang">
              <Select id="support-lang" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as "" | Lang })}>
                <option value="">Any language</option>
                {(Object.keys(LANGUAGE_LABELS) as Lang[]).map((l) => (
                  <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Checkbox
            className="mb-4 max-w-md"
            checked={draft.includeTest}
            onChange={(e) => setDraft({ ...draft, includeTest: e.target.checked })}
            label="Include test requests"
            hint="Requests from the test accounts listed in Support settings are tagged 'test'."
          />

          {list.isPending ? (
            <SkeletonList rows={4} height="h-12" />
          ) : list.error ? (
            <ErrorNote message={(list.error as Error).message} />
          ) : rows.length === 0 ? (
            <Empty>
              {draft.view === "awaiting"
                ? "Nothing is waiting on us. New requests appear here as they arrive."
                : "No request matches these filters."}
            </Empty>
          ) : (
            <>
              <p className="mb-2 text-xs text-ink-faint">
                {total.toLocaleString("en-IN")} request{total === 1 ? "" : "s"}
                {draft.view === "awaiting" && ", longest wait first"}
              </p>
              <Table head={channel === "callback"
                ? ["Request", "From", "Call window", "Attempts", "Status", "Assigned"]
                : ["Request", "From", "Topic", "Status", "Waiting", "Assigned"]}>
                {rows.map((r) => (
                  <QueueLine key={r.id} row={r} callbacks={channel === "callback"} priority={priorities.data?.[r.id]} />
                ))}
              </Table>
              <div className="mt-3 flex justify-end">
                {list.hasNextPage && (
                  <Button size="sm" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                    {list.isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                )}
              </div>
            </>
          )}
        </Panel>
        {footer}
      </Stack>
    </Page>
  );
}

/** Says plainly who can reach support right now, and whether it is open. */
export function RolloutNotice() {
  const counts = useSupportCounts();
  const c = counts.data;
  if (!c) return null;
  const hours = c.open_now ? "Support hours: open now." : "Support hours: closed now. New requests wait for the next opening.";
  if (c.rollout === "off") {
    return (
      <Notice tone="caution" title="Buyers and vendors can't reach support yet">
        Rollout is <strong>off</strong>: the Help page still offers only the phone line and email. A super admin
        switches it to “Staff” (admins and test accounts) and then “Everyone” in{" "}
        <Link to="/support/settings" className="font-medium underline">Support settings</Link>. {hours}
      </Notice>
    );
  }
  if (c.rollout === "staff") {
    return (
      <Notice tone="info" title="Support is in staff testing">
        Only admins and the test accounts in{" "}
        <Link to="/support/settings" className="font-medium underline">Support settings</Link> can open requests. {hours}
      </Notice>
    );
  }
  return <Notice tone={c.open_now ? "positive" : "neutral"}>{hours}</Notice>;
}

function QueueLine({ row: r, callbacks, priority }: { row: SupportListRow; callbacks: boolean; priority?: SupportPriority }) {
  const channel = r.channel as SupportChannel;
  const status = r.status as SupportStatus;
  return (
    <tr className={ROW_HOVER}>
      <td className="max-w-[22rem] px-3 py-2">
        <Link to={`/support/${r.ticket_no}`} className="group block">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-2xs text-ink-faint">{r.ticket_no}</span>
            <Badge tone={CHANNEL_TONE[channel]}>{CHANNEL_LABELS[channel]}</Badge>
            {priority && <Badge tone={priority.tier === "vip" ? "critical" : "caution"}>{priority.tier === "vip" ? "VIP" : "Gold"}</Badge>}
            {r.is_test && <Badge>test</Badge>}
            {r.language !== "en" && <Badge tone="info">{LANGUAGE_LABELS[r.language as Lang] ?? r.language}</Badge>}
          </span>
          <span className="mt-0.5 block truncate font-medium text-ink group-hover:underline" data-no-translate>
            {r.subject}
          </span>
        </Link>
      </td>
      <td className="px-3 py-2">
        <span className="text-ink">{r.requester_name}</span>
        <span className="block text-2xs text-ink-faint">{r.requester_side}</span>
      </td>
      {callbacks ? (
        <>
          <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-muted">
            {r.callback_date && (
              <>
                {format(new Date(`${r.callback_date}T00:00:00`), "EEE d MMM")}
                <span className="block text-2xs text-ink-faint">{r.callback_start}–{r.callback_end} IST</span>
              </>
            )}
          </td>
          <td className="px-3 py-2 text-xs tabular-nums text-ink-muted">
            {r.callback_attempts ?? 0}
            {r.callback_outcome && r.callback_outcome !== "pending" && (
              <span className="block text-2xs text-ink-faint">{r.callback_outcome.replace(/_/g, " ")}</span>
            )}
          </td>
        </>
      ) : (
        <td className="px-3 py-2 text-xs text-ink-muted">{labelText(r.category_label)}</td>
      )}
      <td className="px-3 py-2">
        <Badge tone={STATUS_TONE[status]} dot>{STATUS_LABELS[status]}</Badge>
      </td>
      {!callbacks && (
        <td className="whitespace-nowrap px-3 py-2 text-xs">
          {r.awaiting_staff && r.waiting_since && new Date(r.waiting_since).getTime() > Date.now() ? (
            // A callback booked for later: its wait starts at the slot, so say when it's due.
            <span className="text-2xs text-ink-muted" title={istTime(r.waiting_since)}>
              due in {ageFrom(new Date().toISOString(), new Date(r.waiting_since).getTime())}
            </span>
          ) : r.awaiting_staff && r.waiting_since ? (
            <>
              <Badge tone={waitTone(r.waiting_since)}>{ageFrom(r.waiting_since)}</Badge>
              {priority?.target_at && (
                <span className={`block text-2xs ${new Date(priority.target_at).getTime() < Date.now() ? "font-semibold text-critical-fg" : "text-ink-faint"}`}
                  title={istTime(priority.target_at)} data-testid="support-reply-target">
                  {`reply by ${format(new Date(priority.target_at), "HH:mm")}`}
                </span>
              )}
            </>
          ) : (
            <span className="text-2xs text-ink-faint" title={istTime(r.last_message_at)}>
              last {ageFrom(r.last_message_at)} ago
            </span>
          )}
        </td>
      )}
      <td className="px-3 py-2 text-xs text-ink-muted">{r.assignee_name ?? <span className="text-ink-faint">nobody</span>}</td>
    </tr>
  );
}

export default function SupportInbox() {
  return (
    <SupportQueue
      title="Support inbox"
      subtitle="Every chat, callback request, fraud report and feedback note from buyers and vendors. Buyers and vendors see replies from “Cosora Support”, never a person."
    />
  );
}

export function SupportCallbacks() {
  return (
    <SupportQueue
      channel="callback"
      title="Callbacks"
      subtitle="Calls people asked for, in the order they're due. Open one to reveal the number (logged) and record each attempt."
    />
  );
}

export function SupportFraud() {
  return (
    <SupportQueue
      channel="fraud_report"
      title="Fraud reports"
      subtitle="Reports of fraud, with evidence. The reporter sees only that their report was received and reviewed: never the outcome, the notes, or the reported party's details. A report is kept for a year; a confirmed fraud stays on record below."
      footer={<FraudRecordsPanel />}
    />
  );
}

export function SupportFeedback() {
  return (
    <SupportQueue
      channel="feedback"
      title="App feedback"
      subtitle="Bug reports and ideas. Mark each one reviewed once the team has read it; the sender is told it was read. A bug that needs follow-up can be answered like a chat."
    />
  );
}
