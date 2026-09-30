import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Download, FileText, Lock, Paperclip, Phone, X } from "lucide-react";
import { toast } from "sonner";
import AccountStatus, { AccountStatusBadge } from "@/components/AccountStatus";
import FlagLog from "@/components/FlagLog";
import { useAdminSession, useRole } from "@/hooks/useAdminSession";
import { canSee } from "@/lib/roles";
import {
  Badge,
  Button,
  cn,
  DataField,
  Empty,
  ErrorNote,
  Field,
  Modal,
  Note,
  Notice,
  Page,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  Select,
  SkeletonList,
  Stack,
  SubHeading,
  Textarea,
} from "@/components/ui";
import {
  ACCEPTED_FILES,
  ageFrom,
  attachmentUrl,
  CALLBACK_OUTCOMES,
  CHANNEL_LABELS,
  checkFile,
  claimTicket,
  FRAUD_OUTCOMES,
  istTime,
  labelText,
  LANGUAGE_LABELS,
  logCallbackAttempt,
  markFeedbackReviewed,
  reassignTicket,
  revealContact,
  sendReply,
  setFraudOutcome,
  setTicketStatus,
  STATUS_LABELS,
  uploadStaffFile,
  useSupportAssignees,
  useSupportRealtime,
  useSupportTicket,
  type RevealField,
  type SupportAttachment,
  type SupportChannel,
  type SupportMessage,
  type SupportTicketDetail,
} from "@/lib/support";
import { STATUS_TONE } from "./Support";

/**
 * ONE SUPPORT REQUEST (Help & Support, 2026-09-30).
 *
 * The thread on the left, what we know on the right. Every action goes through an
 * admin_support_* function; the database checks the role, so a manager sees the same
 * page without the controls, and a refused action shows the database's own message.
 */

const BOARD: Record<SupportChannel, { to: string; label: string }> = {
  chat: { to: "/support", label: "Support inbox" },
  callback: { to: "/support/callbacks", label: "Callbacks" },
  fraud_report: { to: "/support/fraud", label: "Fraud reports" },
  feedback: { to: "/support/feedback", label: "App feedback" },
};

export default function SupportTicket() {
  const { ticketNo } = useParams<{ ticketNo: string }>();
  useSupportRealtime();
  const ticket = useSupportTicket(ticketNo);

  if (ticket.isPending) {
    return (
      <Page width="wide">
        <SkeletonList rows={3} height="h-40" />
      </Page>
    );
  }
  // A failed background refresh keeps the last good data (React Query keeps it), so the
  // page, and any reply being typed, stay put. Only a first load that fails shows the error.
  if (!ticket.data) return <ErrorNote message={(ticket.error as Error | null)?.message ?? "Could not load this request."} />;
  const d = ticket.data;
  const t = d.ticket;
  const board = BOARD[t.channel];

  return (
    <Page width="wide">
      <Link to={board.to} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink">
        <ArrowLeft size={14} /> {board.label}
      </Link>
      <PageHeader
        title={`${t.ticket_no} · ${CHANNEL_LABELS[t.channel]}`}
        subtitle={`${labelText(t.category_label)} · from ${d.requester?.name ?? "a removed account"} (${t.requester_side}) · opened ${istTime(t.created_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={STATUS_TONE[t.status]} dot>{STATUS_LABELS[t.status]}</Badge>
            <Badge tone={t.language === "en" ? "neutral" : "info"}>{LANGUAGE_LABELS[t.language]}</Badge>
            {t.is_test && <Badge>test</Badge>}
            {t.restricted && <Badge tone="critical">restricted</Badge>}
          </div>
        }
      />
      {!d.can_write && (
        <ReadOnlyBanner reason="Read-only: answering support needs the Super admin or Support role. You can still reveal a phone number; that is recorded in the Admin Log." />
      )}
      {ticket.isRefetchError && (
        <Notice tone="caution" className="mb-4">
          Couldn't refresh this request, so this is the version loaded last. It updates again with the next change.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Stack>
          <Thread detail={d} />
          {t.status === "closed" ? (
            <Notice tone="neutral" icon={<Lock size={14} />}>
              This request is closed and read-only. If the person needs more help, they start a new request.
            </Notice>
          ) : (
            d.can_write && <Composer detail={d} />
          )}
          <Timeline detail={d} />
        </Stack>

        <Stack>
          <TicketActions detail={d} />
          {t.channel === "callback" && d.callback && <CallbackPanel detail={d} />}
          {t.channel === "fraud_report" && <FraudPanel detail={d} />}
          {t.channel === "feedback" && <FeedbackPanel detail={d} />}
          <RequesterPanel detail={d} />
          <ContextPanel detail={d} />
        </Stack>
      </div>
    </Page>
  );
}

// ── The thread ─────────────────────────────────────────────────────────────────
function Thread({ detail: d }: { detail: SupportTicketDetail }) {
  const files = new Map<string, SupportAttachment[]>();
  for (const a of d.attachments) {
    const list = files.get(a.message_id) ?? [];
    list.push(a);
    files.set(a.message_id, list);
  }
  return (
    <Panel
      title="Conversation"
      description="The requester sees their messages, public replies and the system lines, all signed “Cosora Support”. Internal notes stay here."
    >
      {d.messages.length === 0 ? (
        <Empty>No messages yet.</Empty>
      ) : (
        <div className="space-y-3">
          {d.messages.map((m) => (
            <MessageLine key={m.id} m={m} files={files.get(m.id) ?? []} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function MessageLine({ m, files }: { m: SupportMessage; files: SupportAttachment[] }) {
  if (m.author_kind === "system") {
    return (
      <div className="flex justify-center">
        <p className="max-w-[85%] rounded-full bg-surface-2 px-3 py-1 text-center text-2xs text-ink-muted ring-1 ring-inset ring-line">
          {m.body} <span className="text-ink-faint">· {format(new Date(m.created_at), "d MMM, HH:mm")}</span>
        </p>
      </div>
    );
  }
  const staff = m.author_kind === "staff";
  const internal = m.visibility === "internal";
  return (
    <div className={staff ? "flex justify-end" : "flex justify-start"}>
      <div className="max-w-[85%]">
        <div className={cn("mb-0.5 text-2xs text-ink-faint", staff ? "text-right" : "text-left")}>
          {staff ? (m.author_name ?? "Staff") : "Requester"}
          {internal && <span className="font-semibold text-caution-fg"> · internal note</span>}
          {" · "}
          {format(new Date(m.created_at), "d MMM, HH:mm")}
        </div>
        <div
          className={cn(
            "rounded-xl border px-3 py-2 text-sm",
            internal
              ? "border-caution-line bg-caution-bg text-ink"
              : staff
                ? "border-line-strong bg-surface-2 text-ink"
                : "border-line bg-surface text-ink shadow-xs",
          )}
        >
          {m.body && (
            <span className="whitespace-pre-wrap break-words" data-no-translate>
              {m.body}
            </span>
          )}
          {files.length > 0 && (
            <div className={cn("flex flex-wrap gap-2", m.body && "mt-2")}>
              {files.map((f) => (
                <AttachmentView key={f.id} a={f} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Signed links last 5 minutes (attachmentUrl). The thumbnail and the audio player use a
// cached one; opening a photo or a PDF signs a fresh link, and audio re-signs when play
// starts on a link older than 4 minutes, so a thread left open still opens its files.
const LINK_FRESH_MS = 4 * 60_000;

function AttachmentView({ a }: { a: SupportAttachment }) {
  const url = useQuery({
    queryKey: ["support-file", a.id],
    enabled: a.status === "clean",
    staleTime: LINK_FRESH_MS,
    queryFn: () => attachmentUrl(a),
  });
  const [opening, setOpening] = useState(false);

  async function openFresh() {
    // The tab opens inside the click, so a popup blocker allows it, and is pointed at the
    // fresh link once it's signed. A PDF link is a download, so this page stays put.
    const tab = a.kind === "image" ? window.open("about:blank", "_blank") : null;
    if (tab) tab.opener = null;
    setOpening(true);
    try {
      const fresh = await attachmentUrl(a);
      if (tab) tab.location.href = fresh;
      else window.location.href = fresh;
    } catch (e) {
      tab?.close();
      toast.error((e as Error).message);
    } finally {
      setOpening(false);
    }
  }

  const hidden = !a.requester_can_view && a.uploader_kind === "requester";
  const caption = (
    <span className="mt-1 block text-2xs text-ink-faint">
      {a.kind.toUpperCase()} · {(a.bytes / 1024 / 1024).toFixed(1)} MB
      {hidden && " · evidence (the reporter can't open it)"}
    </span>
  );
  if (a.status === "pending") {
    return <div className="rounded-lg border border-dashed border-line px-3 py-2 text-2xs text-ink-faint">Checking the file…</div>;
  }
  if (a.status === "rejected") {
    return (
      <div className="rounded-lg border border-critical-line bg-critical-bg px-3 py-2 text-2xs text-critical-fg">
        A file was refused: its contents didn't match its type. It was deleted.
      </div>
    );
  }
  if (url.error) return <div className="text-2xs text-critical-fg">{(url.error as Error).message}</div>;
  if (!url.data) return <div className="skeleton h-16 w-24 rounded-lg" />;
  if (a.kind === "image") {
    return (
      <button type="button" onClick={() => void openFresh()} className="block text-left" aria-label="Open the photo in a new tab">
        <img src={url.data} alt="Attachment" className="h-32 max-w-[14rem] rounded-lg border border-line object-cover" />
        {caption}
      </button>
    );
  }
  if (a.kind === "audio") {
    return (
      <div>
        <audio
          controls
          preload="none"
          src={url.data}
          className="h-9 max-w-[16rem]"
          onPlay={(e) => {
            if (Date.now() - url.dataUpdatedAt < LINK_FRESH_MS) return;
            const el = e.currentTarget;
            el.pause();
            void url.refetch().then((r) => {
              if (!r.data) return;
              el.src = r.data;
              void el.play();
            });
          }}
        />
        {caption}
      </div>
    );
  }
  return (
    <div>
      {/* A PDF downloads; it is never rendered inside the panel (plan A4). */}
      <button
        type="button"
        disabled={opening}
        onClick={() => void openFresh()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink hover:bg-surface-2 disabled:opacity-45"
      >
        <FileText size={14} /> Download PDF <Download size={12} />
      </button>
      {caption}
    </div>
  );
}

// ── Replying ───────────────────────────────────────────────────────────────────
function Composer({ detail: d }: { detail: SupportTicketDetail }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Files already uploaded and checked, so Send after a failure reuses them instead of
  // uploading again (each upload reserves a row, and a request holds at most 30).
  const uploaded = useRef(new Map<File, string>());

  function pick(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const problem = checkFile(f);
      if (problem) {
        toast.error(problem);
        continue;
      }
      next.push(f);
    }
    if (next.length > 5) toast.error("At most 5 files in one reply.");
    setFiles(next.slice(0, 5));
    if (input.current) input.current.value = "";
  }

  async function send() {
    if (!body.trim() && files.length === 0) return;
    let failing: File | null = null;
    try {
      const ids: string[] = [];
      for (const [i, f] of files.entries()) {
        const done = uploaded.current.get(f);
        if (done) {
          ids.push(done);
          continue;
        }
        failing = f;
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const id = await uploadStaffFile(d.ticket.id, f);
        uploaded.current.set(f, id);
        ids.push(id);
      }
      failing = null;
      setBusy("Sending…");
      await sendReply(d.ticket.id, body, internal, ids);
      setBody("");
      setFiles([]);
      uploaded.current.clear();
      toast.success(internal ? "Internal note saved." : "Reply sent. The requester is notified in the app.");
      void qc.invalidateQueries({ queryKey: ["support"] });
    } catch (e) {
      // The file that failed its upload or check is taken off the list; the files already
      // checked stay, and the next Send reuses them.
      const bad = failing;
      if (bad) setFiles((list) => list.filter((x) => x !== bad));
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel
      title={internal ? "Internal note" : "Reply"}
      description={
        internal
          ? "Visible to staff only. Use it for what the requester shouldn't see: checks you made, who you spoke to."
          : `Sent as “Cosora Support”. The requester writes in ${LANGUAGE_LABELS[d.ticket.language]}; reply in Hindi or English.`
      }
    >
      <Textarea
        rows={4}
        value={body}
        maxLength={4000}
        onChange={(e) => setBody(e.target.value)}
        placeholder={internal ? "Note for the team…" : "Write your reply…"}
        className={internal ? "border-caution-line bg-caution-bg" : undefined}
        aria-label={internal ? "Internal note" : "Reply"}
      />
      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-2xs text-ink ring-1 ring-inset ring-line">
              {f.name}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" multiple accept={ACCEPTED_FILES} className="hidden" onChange={(e) => pick(e.target.files)} />
          <Button size="sm" type="button" onClick={() => input.current?.click()} disabled={Boolean(busy)}>
            <Paperclip size={14} /> Attach
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-[rgb(var(--brand))]" />
            Internal note
          </label>
        </div>
        <Button variant="primary" disabled={Boolean(busy) || (!body.trim() && files.length === 0)} onClick={() => void send()}>
          {busy ?? (internal ? "Save note" : "Send reply")}
        </Button>
      </div>
      <p className="mt-2 text-2xs text-ink-faint">Photos (JPG, PNG, WebP) and audio up to 5 MB, PDFs up to 10 MB. Every file is checked before anyone can open it.</p>
    </Panel>
  );
}

// ── Status and assignment ──────────────────────────────────────────────────────
function TicketActions({ detail: d }: { detail: SupportTicketDetail }) {
  const qc = useQueryClient();
  const me = useAdminSession().identity?.id;
  const assignees = useSupportAssignees();
  const [pending, setPending] = useState<"open" | "resolved" | "closed" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const t = d.ticket;
  const closed = t.status === "closed";

  async function run(fn: () => Promise<void>, done: string): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      void qc.invalidateQueries({ queryKey: ["support"] });
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const people = assignees.data ?? [];
  // A request can be assigned to someone who has since left the support team. Keep them
  // in the list so the select shows who holds it, and "Nobody" can still free it.
  const heldByOther = Boolean(d.staff.assignee_id) && !people.some((a) => a.id === d.staff.assignee_id);

  return (
    <Panel title="Request">
      <dl className="grid grid-cols-2 gap-3">
        <DataField label="Status" value={STATUS_LABELS[t.status]} />
        <DataField label="Assigned to" value={d.staff.assignee_name ?? "Nobody"} />
        <DataField label="First reply" value={t.first_staff_reply_at ? `${ageFrom(t.created_at, new Date(t.first_staff_reply_at).getTime())} after opening` : "not yet"} />
        <DataField label="Reopened" value={t.reopen_count ? `${t.reopen_count} time${t.reopen_count === 1 ? "" : "s"}` : "never"} />
      </dl>

      {d.can_write && !closed && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          {d.staff.assignee_id !== me && (
            <Button className="w-full" disabled={busy} onClick={() => void run(() => claimTicket(t.id), "It's yours.")}>
              Take this request
            </Button>
          )}
          <Field label="Assign to" htmlFor="support-assign">
            <Select
              id="support-assign"
              value={d.staff.assignee_id ?? ""}
              disabled={busy || assignees.isPending}
              onChange={(e) => void run(() => reassignTicket(t.id, e.target.value || null), "Assignment changed.")}
            >
              <option value="">Nobody</option>
              {heldByOther && (
                <option value={d.staff.assignee_id ?? ""}>
                  {d.staff.assignee_name ?? "Someone"}
                  {assignees.data ? " (no longer on the support team)" : ""}
                </option>
              )}
              {people.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.role.replace("_", " ")})</option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            {t.status !== "resolved" && (
              <Button size="sm" variant="primary" disabled={busy} onClick={() => setPending("resolved")}>Mark resolved</Button>
            )}
            {t.status === "resolved" && (
              <Button size="sm" disabled={busy} onClick={() => setPending("open")}>Reopen</Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending("closed")}>Close</Button>
          </div>
          <p className="text-2xs text-ink-faint">
            A resolved request reopens if the requester replies within 7 days. A closed one is final.
          </p>
        </div>
      )}

      <Modal
        open={pending !== null}
        title={pending === "resolved" ? "Mark resolved" : pending === "closed" ? "Close this request" : "Reopen this request"}
        onClose={() => setPending(null)}
      >
        <p className="mb-3 text-sm text-ink-muted">
          {pending === "resolved" && "The requester is told it's resolved and can reply within 7 days to reopen it."}
          {pending === "closed" && "Closed requests are read-only. The requester is told, and starts a new request if they need more help."}
          {pending === "open" && "The requester sees that Cosora Support reopened it."}
        </p>
        <Field label="Reason (optional)" htmlFor="status-note" hint="Saved as an internal note and on this change's Admin Log row.">
          <Textarea id="status-note" rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button
            variant={pending === "closed" ? "danger" : "primary"}
            disabled={busy}
            onClick={() => {
              const next = pending!;
              // Stays open with the reason in place if the database refuses the change.
              void run(() => setTicketStatus(t.id, next, note), "Status changed.").then((ok) => {
                if (!ok) return;
                setPending(null);
                setNote("");
              });
            }}
          >
            {pending === "resolved" ? "Mark resolved" : pending === "closed" ? "Close" : "Reopen"}
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}

// ── Phone numbers: masked until a logged reveal ────────────────────────────────
function RevealPhone({ ticketId, field, masked, label }: { ticketId: string; field: RevealField; masked: string | null; label: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!masked) return <DataField label={label} value={null} />;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2 text-sm text-ink">
        {value ? (
          <a href={`tel:${value}`} className="inline-flex items-center gap-1 font-mono text-xs underline">
            <Phone size={12} /> {value}
          </a>
        ) : (
          <>
            <span className="font-mono text-xs">{masked}</span>
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setValue(await revealContact(ticketId, field));
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reveal
            </Button>
          </>
        )}
      </dd>
      {!value && <p className="mt-0.5 text-2xs text-ink-faint">Each reveal is recorded in the Admin Log.</p>}
    </div>
  );
}

// ── Channel panels ─────────────────────────────────────────────────────────────
function CallbackPanel({ detail: d }: { detail: SupportTicketDetail }) {
  const qc = useQueryClient();
  const cb = d.callback!;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Resolved counts as done, the way the database's counts see it: a callback settled
  // another way isn't overdue. Reopen the request to log another call.
  const done = cb.outcome !== "pending" || d.ticket.status === "resolved" || d.ticket.status === "closed";
  const overdue = !done && new Date(`${cb.date}T${cb.end}:00+05:30`).getTime() < Date.now();

  return (
    <Panel title="Callback" description="Call from your own phone, then record what happened. The requester sees each outcome.">
      <dl className="grid grid-cols-2 gap-3">
        {/* The date as booked (IST), not converted to this browser's time zone. */}
        <DataField label="When" value={`${format(new Date(`${cb.date}T00:00:00`), "EEE d MMM")}, ${cb.start}–${cb.end} IST`} />
        <DataField label="Attempts" value={`${cb.attempts} of 3`} />
        <DataField label="Outcome" value={cb.outcome.replace(/_/g, " ")} />
        <DataField label="Last try" value={cb.last_attempt_at ? istTime(cb.last_attempt_at) : "not yet"} />
      </dl>
      <div className="mt-3">
        <RevealPhone ticketId={d.ticket.id} field="callback_phone" masked={cb.phone_masked} label="Number to call" />
      </div>
      {overdue && <Notice tone="critical" className="mt-3">This call window has passed.</Notice>}
      {d.can_write && !done && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <Field label="Note (optional, internal)" htmlFor="cb-note">
            <Textarea id="cb-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {CALLBACK_OUTCOMES.map((o) => (
              <Button
                key={o.id}
                size="sm"
                variant={o.id === "completed" ? "primary" : "outline"}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await logCallbackAttempt(d.ticket.id, o.id, note);
                    setNote("");
                    toast.success(
                      o.id === "no_answer" && r.outcome === "pending"
                        ? `Attempt ${r.attempts} recorded. Try again later.`
                        : "Recorded.",
                    );
                    void qc.invalidateQueries({ queryKey: ["support"] });
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {o.label}
              </Button>
            ))}
          </div>
          <p className="text-2xs text-ink-faint">After a third missed call the requester is asked to reply and book another time.</p>
        </div>
      )}
    </Panel>
  );
}

function FraudPanel({ detail: d }: { detail: SupportTicketDetail }) {
  const qc = useQueryClient();
  const vendors = canSee(useRole(), "vendors");
  const f = d.fraud;
  const [outcome, setOutcome] = useState(d.staff.fraud_outcome ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Panel
      title="Fraud report"
      description="Restricted. The reporter never sees the outcome, your notes, or anything about the reported party."
    >
      {!f ? (
        <Note>No report details were recorded.</Note>
      ) : (
        <dl className="grid grid-cols-2 gap-3">
          <DataField
            label="Reported party"
            value={
              vendors && f.reported_entity_type === "vendor" && f.reported_entity_id ? (
                <Link to={`/vendors/${f.reported_entity_id}`} className="underline">{f.reported_entity_label ?? "Vendor"}</Link>
              ) : (
                f.reported_entity_label ?? f.reported_name
              )
            }
          />
          <DataField label="Name given" value={f.reported_name} />
          <DataField label="Amount" value={f.amount_inr != null ? `₹${Number(f.amount_inr).toLocaleString("en-IN")}` : null} />
          <DataField label="When it happened" value={f.incident_date ? format(new Date(`${f.incident_date}T00:00:00`), "d MMM yyyy") : null} />
          <DataField label="City" value={f.city} />
          {/* A link a reporter typed is shown as text, not made clickable. */}
          <DataField label="Link given" value={f.reported_url ? <span className="break-all font-mono text-2xs">{f.reported_url}</span> : null} />
          <div className="col-span-2">
            <RevealPhone ticketId={d.ticket.id} field="reported_phone" masked={f.reported_phone_masked} label="Number reported" />
          </div>
        </dl>
      )}
      {d.staff.fraud_outcome && (
        <Note className="mt-3">
          Outcome: <strong>{FRAUD_OUTCOMES.find((o) => o.id === d.staff.fraud_outcome)?.label ?? d.staff.fraud_outcome}</strong>
          {d.staff.reviewed_by_name && ` · by ${d.staff.reviewed_by_name}`}
          {d.staff.reviewed_at && `, ${istTime(d.staff.reviewed_at)}`}
        </Note>
      )}
      {d.can_write && d.ticket.status !== "closed" && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <Field label="Outcome" htmlFor="fraud-outcome" hint={FRAUD_OUTCOMES.find((o) => o.id === outcome)?.hint}>
            <Select id="fraud-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">Choose…</option>
              {FRAUD_OUTCOMES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Note (internal, goes to the Admin Log)" htmlFor="fraud-note">
            <Textarea id="fraud-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !outcome}
            onClick={async () => {
              setBusy(true);
              try {
                await setFraudOutcome(d.ticket.id, outcome, note);
                setNote("");
                toast.success("Outcome saved. The reporter is told their report was reviewed.");
                void qc.invalidateQueries({ queryKey: ["support"] });
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save outcome
          </Button>
          <p className="text-2xs text-ink-faint">
            To suspend the reported account, use its Account controls (Accounts, or the vendor page) first, then record it here.
          </p>
        </div>
      )}
      {vendors && f?.reported_entity_type === "vendor" && f.reported_entity_id && (
        <div className="mt-4">
          <FlagLog entityType="vendor" entityId={f.reported_entity_id} />
        </div>
      )}
    </Panel>
  );
}

function FeedbackPanel({ detail: d }: { detail: SupportTicketDetail }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const page = typeof d.staff.context.page === "string" ? d.staff.context.page : null;
  return (
    <Panel title="Feedback" description="Read by the team. The sender is told it was read, nothing more, unless you reply.">
      <dl className="grid grid-cols-2 gap-3">
        <DataField label="Kind" value={d.ticket.category === "feedback_bug" ? "Bug report" : "Idea"} />
        <DataField label="Page" value={page ? <span className="font-mono text-2xs">{page}</span> : null} />
        <DataField label="Reviewed" value={d.staff.reviewed_at ? `${istTime(d.staff.reviewed_at)}${d.staff.reviewed_by_name ? ` by ${d.staff.reviewed_by_name}` : ""}` : "not yet"} />
      </dl>
      {d.can_write && d.ticket.status !== "closed" && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <Field label="Note (optional, internal)" htmlFor="fb-note">
            <Textarea id="fb-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await markFeedbackReviewed(d.ticket.id, note);
                toast.success("Marked reviewed.");
                void qc.invalidateQueries({ queryKey: ["support"] });
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Mark reviewed
          </Button>
        </div>
      )}
    </Panel>
  );
}

// ── Who is asking ──────────────────────────────────────────────────────────────
function RequesterPanel({ detail: d }: { detail: SupportTicketDetail }) {
  const r = d.requester;
  const role = useRole();
  if (!r) {
    return (
      <Panel title="Requester">
        <Note>This account no longer exists.</Note>
      </Panel>
    );
  }
  return (
    <Panel title="Requester">
      <dl className="grid grid-cols-2 gap-3">
        <DataField label="Name" value={<span data-no-translate>{r.name}</span>} />
        <DataField label="Joined" value={format(new Date(r.joined_at), "d MMM yyyy")} />
        <DataField label="Email" value={r.email ? <span className="break-all text-xs">{r.email}</span> : "Phone sign-in"} />
        <RevealPhone ticketId={d.ticket.id} field="requester_phone" masked={r.phone_masked} label="Phone" />
      </dl>
      {r.is_staff && <Notice tone="info" className="mt-3">This request comes from a Cosora admin account.</Notice>}
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {canSee(role, "accounts") && (
          <Link to={`/accounts?q=${encodeURIComponent(r.id)}`} className="text-ink-muted underline hover:text-ink">Open in Accounts</Link>
        )}
        {r.has_store && canSee(role, "vendors") && (
          <Link to={`/vendors/${r.id}`} className="text-ink-muted underline hover:text-ink">Open vendor page</Link>
        )}
      </div>
      <div className="mt-4">
        <SubHeading className="mb-2">Account status</SubHeading>
        {/* The suspend and reinstate control needs the Accounts section; a manager sees the status only. */}
        {canSee(role, "accounts") ? (
          <AccountStatus profileId={r.id} name={r.name} kind={r.has_store ? "vendor" : "buyer"} />
        ) : (
          <AccountStatusBadge status={r.account_status} />
        )}
      </div>
      {d.other_requests.length > 0 && (
        <div className="mt-4">
          <SubHeading className="mb-2">Other requests</SubHeading>
          <ul className="space-y-1">
            {d.other_requests.map((o) => (
              <li key={o.ticket_no} className="flex items-center justify-between gap-2 text-xs">
                <Link to={`/support/${o.ticket_no}`} className="min-w-0 truncate text-ink underline-offset-2 hover:underline" data-no-translate>
                  <span className="font-mono text-2xs text-ink-faint">{o.ticket_no}</span> {o.subject}
                </Link>
                <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABELS[o.status]}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

const ENTITY_LABEL: Record<string, string> = {
  conversation: "Chat", rfq: "Requirement", quote: "Quote", product: "Product", video: "Video Closeup", vendor: "Vendor",
  ad: "Ad campaign", invoice: "Invoice", kyc: "KYC document", certificate_order: "Certificate order", review: "Review", account: "Their account",
};

function entityLink(type: string, id: string, role: ReturnType<typeof useRole>): string | null {
  if (type === "conversation" && canSee(role, "chats")) return `/chats/${id}`;
  if (type === "vendor" && canSee(role, "vendors")) return `/vendors/${id}`;
  return null;
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return istTime(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ContextPanel({ detail: d }: { detail: SupportTicketDetail }) {
  const ctx = d.staff.context ?? {};
  const vendor = (ctx.vendor ?? null) as Record<string, unknown> | null;
  const entity = (ctx.entity ?? null) as Record<string, unknown> | null;
  const t = d.ticket;
  const role = useRole();
  const link = t.entity_type && t.entity_id ? entityLink(t.entity_type, t.entity_id, role) : null;
  return (
    <Panel title="What we know" description="Gathered by the database when the request was opened, not typed by the requester.">
      <dl className="grid grid-cols-2 gap-3">
        <DataField label="Account status then" value={show(ctx.account_status)} />
        <DataField label="Asked as" value={show(ctx.side)} />
        {vendor && (
          <>
            <DataField label="Store" value={show(vendor.brand_name)} />
            <DataField label="Plan" value={show((vendor.plan as Record<string, unknown> | null)?.plan_id)} />
            <DataField
              label="KYC documents"
              value={vendor.kyc ? (() => {
                const k = vendor.kyc as Record<string, unknown>;
                return `${k.submitted ?? 0} sent · ${k.verified ?? 0} verified · ${k.rejected ?? 0} rejected`;
              })() : null}
            />
            <DataField label="Last KYC upload" value={show((vendor.kyc as Record<string, unknown> | null)?.last_submitted_at)} />
          </>
        )}
      </dl>
      {t.entity_type && t.entity_id && (
        <div className="mt-4 border-t border-line pt-3">
          <SubHeading className="mb-2">About</SubHeading>
          <p className="text-sm text-ink">
            {ENTITY_LABEL[t.entity_type] ?? t.entity_type}{" "}
            {link ? (
              <Link to={link} className="text-xs underline">open</Link>
            ) : (
              <span className="font-mono text-2xs text-ink-faint">{t.entity_id}</span>
            )}
          </p>
          {entity && (
            <dl className="mt-2 grid grid-cols-2 gap-3">
              {Object.entries(entity).filter(([k]) => !k.endsWith("_id")).map(([k, v]) => (
                <DataField key={k} label={k.replace(/_/g, " ")} value={show(v)} />
              ))}
            </dl>
          )}
        </div>
      )}
    </Panel>
  );
}

// ── Timeline ───────────────────────────────────────────────────────────────────
const EVENT_LABEL: Record<string, string> = {
  opened: "Opened", claimed: "Taken", reassigned: "Reassigned", replied: "Replied", noted: "Internal note",
  status: "Status changed", reopened: "Reopened by the requester", ended_by_requester: "Ended by the requester",
  callback_attempt: "Call attempt", fraud_outcome: "Outcome recorded", feedback_reviewed: "Marked reviewed",
  contact_revealed: "Phone number revealed",
};

function Timeline({ detail: d }: { detail: SupportTicketDetail }) {
  return (
    <Panel title="Timeline" description="Every change, by whom. Phone reveals and status changes are also in the Admin Log.">
      <details>
        <summary className="cursor-pointer select-none text-xs text-ink-muted">Show {d.events.length} events</summary>
        <ol className="mt-3 space-y-1.5">
          {d.events.map((e, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="w-28 shrink-0 tabular-nums text-ink-faint">{format(new Date(e.at), "d MMM, HH:mm")}</span>
              <span className="font-medium text-ink">{EVENT_LABEL[e.event] ?? e.event}</span>
              {e.from_status && e.to_status && e.from_status !== e.to_status && (
                <span className="text-ink-muted">{e.from_status} → {e.to_status}</span>
              )}
              {typeof e.detail.outcome === "string" && <span className="text-ink-muted">{e.detail.outcome.replace(/_/g, " ")}</span>}
              {typeof e.detail.field === "string" && <span className="text-ink-muted">{e.detail.field.replace(/_/g, " ")}</span>}
              <span className="text-ink-faint">
                {e.actor_kind === "staff" ? (e.actor_name ?? "staff") : e.actor_kind === "requester" ? "requester" : "system"}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </Panel>
  );
}
