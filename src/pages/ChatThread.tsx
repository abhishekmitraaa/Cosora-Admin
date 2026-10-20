import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useRecordView } from "@/lib/activity";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, Ban, Download, FileText, Lock, Phone, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  fetchParticipants,
  participantLabel,
  resolveSides,
  REVIEW_STATUS_LABEL,
  type Participant,
} from "@/lib/chat";
import AccountStatus from "@/components/AccountStatus";
import FlagLog from "@/components/FlagLog";
import {
  Badge,
  Button,
  Empty,
  ErrorNote,
  Notice,
  Page,
  PageHeader,
  Panel,
  SkeletonList,
  Stack,
  SubHeading,
} from "@/components/ui";

interface MessageRow {
  id: string;
  body: string | null;
  kind: string;
  created_at: string;
  sender_id: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_bytes: number | null;
  attachment_seconds: number | null;
}

interface ReviewRow {
  id: string;
  status: string;
  source: string;
  reported_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  pattern: { label: string } | null;
  reason: { reason: string } | null;
}

/** admin_conversation_state(): who blocked whom, and each person's own marks on the chat. */
interface ChatState {
  blocks: { blocker_id: string; blocked_id: string; created_at: string; unblocked_at: string | null }[];
  members: { user_id: string; starred_at: string | null; archived_at: string | null; cleared_at: string | null }[];
}

const MESSAGE_COLUMNS =
  "id, body, kind, created_at, sender_id, attachment_path, attachment_name, attachment_mime, attachment_bytes, attachment_seconds";
/** Rows per request; the whole chat is read in pages (2026-10-18: it stopped at 500). */
const PAGE_SIZE = 1000;
/** The private bucket chat files live in (buyer repo migration 20261018160000). */
const CHAT_BUCKET = "chat-attachments";
const SIGNED_URL_SECONDS = 60 * 60;

async function fetchAllMessages(conversationId: string): Promise<MessageRow[]> {
  const all: MessageRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as MessageRow[]));
    if (!data || data.length < PAGE_SIZE) return all;
  }
}

/** Short-lived links to the chat's files. Support and super admins may read them (the bucket's read policy). */
function useFileLinks(conversationId: string | undefined, paths: string[]) {
  return useQuery({
    queryKey: ["chat-thread-files", conversationId, paths.length, paths[paths.length - 1] ?? ""],
    enabled: paths.length > 0,
    // Links last an hour. Re-sign 5 minutes before they lapse while the page is open, and on
    // coming back to the tab once they are stale (the global default leaves focus refetch off):
    // a thread left open past the hour showed dead photos, voice notes and PDFs (2026-10-20 audit).
    staleTime: (SIGNED_URL_SECONDS - 300) * 1000,
    refetchInterval: (SIGNED_URL_SECONDS - 300) * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const links: Record<string, string> = {};
      for (let i = 0; i < paths.length; i += 100) {
        const { data, error } = await supabase.storage.from(CHAT_BUCKET).createSignedUrls(paths.slice(i, i + 100), SIGNED_URL_SECONDS);
        if (error) throw new Error(error.message);
        for (const d of data ?? []) if (d.path && d.signedUrl) links[d.path] = d.signedUrl;
      }
      return links;
    },
  });
}

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "";
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSeconds(n: number | null): string {
  const s = Math.max(0, Math.round(n ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The number behind a contact card. Every reveal is an Admin Log row (admin_chat_contact_number). */
function ContactReveal({ messageId }: { messageId: string }) {
  const [number, setNumber] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const reveal = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_chat_contact_number", { p_message_id: messageId });
    setBusy(false);
    if (error) {
      toast.error("Couldn't show the number", { description: error.message });
      return;
    }
    setNumber(data ?? null);
  };
  if (number === undefined) {
    return (
      <Button size="sm" onClick={() => void reveal()} disabled={busy} className="mt-1.5">
        <Phone size={13} className="mr-1" /> {busy ? "Revealing…" : "Show number"}
      </Button>
    );
  }
  return (
    <div className="mt-1.5 text-sm font-medium text-ink">
      {number ?? "No number on this account"}
      <span className="ml-2 text-2xs font-normal text-ink-faint">recorded in the Admin Log</span>
    </div>
  );
}

/**
 * Read-only thread view: the whole chat, as sent.
 *
 * There is no message-rendering logic in this repo to reuse — chat is a
 * textile-spark-net surface. Text, photos, PDFs, voice notes and contact cards
 * are all shown (2026-10-18), and so is what a participant deleted for
 * themselves: "Delete chat" hides messages from that person only, never from
 * the record. The one thing it borrows from the buyer-side chat is the
 * composer: it is ABSENT, not disabled. An admin cannot post into a
 * conversation from here, and there is no code path that could.
 */
export default function ChatThread() {
  const { id } = useParams<{ id: string }>();
  useRecordView("public.conversations", id);

  const thread = useQuery({
    queryKey: ["chat-thread", id],
    enabled: Boolean(id),
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .select("id, status, created_at, last_message_at, user_a, user_b")
        .eq("id", id!)
        .maybeSingle();
      if (convError) throw new Error(convError.message);
      if (!conversation) return null;

      const [messages, reviews, people, state] = await Promise.all([
        fetchAllMessages(id!),
        // Newest first. Flat pattern_label / reason are folded back into the
        // embed shape below; null means no joined row, as a null embed did.
        supabase.rpc("admin_conversation_review_list", { p_conversation_id: id! }),
        fetchParticipants([conversation.user_a, conversation.user_b]),
        supabase.rpc("admin_conversation_state", { p_conversation_id: id! }),
      ]);
      if (reviews.error) throw new Error(reviews.error.message);
      if (state.error) throw new Error(state.error.message);

      return {
        conversation,
        messages,
        reviews: (reviews.data ?? []).map(
          (r): ReviewRow => ({
            id: r.id,
            status: r.status,
            source: r.source,
            reported_reason: r.reported_reason,
            created_at: r.created_at,
            reviewed_at: r.reviewed_at,
            pattern: r.pattern_label !== null ? { label: r.pattern_label } : null,
            reason: r.reason !== null ? { reason: r.reason } : null,
          }),
        ),
        people: people as Map<string, Participant>,
        state: ((state.data ?? {}) as unknown as ChatState),
      };
    },
  });

  const paths = (thread.data?.messages ?? []).flatMap((m) => (m.attachment_path ? [m.attachment_path] : []));
  const files = useFileLinks(id, paths);

  if (thread.isLoading) {
    return (
      <Page>
        <SkeletonList rows={3} height="h-40" />
      </Page>
    );
  }
  if (thread.error) return <ErrorNote message={(thread.error as Error).message} />;
  if (!thread.data) return <ErrorNote message="Conversation not found, or not visible to your role." />;

  const { conversation: c, messages, reviews, people, state } = thread.data;
  const sides = resolveSides(c.user_a, c.user_b, people);
  const a = people.get(c.user_a);
  const b = people.get(c.user_b);
  const locked = c.status === "under_review";
  const name = (uid: string) => participantLabel(people.get(uid), uid);
  const blocks = state.blocks ?? [];
  const activeBlocks = blocks.filter((x) => !x.unblocked_at);
  const members = (state.members ?? []).filter((m) => m.starred_at || m.archived_at || m.cleared_at);
  // Where each person deleted the chat for themselves: a divider after the last message they no longer see.
  const clears = (state.members ?? []).filter((m) => m.cleared_at).map((m) => ({ user: m.user_id, at: m.cleared_at! }));
  const link = (path: string | null) => (path ? files.data?.[path] : undefined);

  return (
    <Page>
      <Link
        to="/chats"
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> All chats
      </Link>

      <PageHeader
        title={`${participantLabel(a, c.user_a)} ↔ ${participantLabel(b, c.user_b)}`}
        subtitle={`Started ${format(new Date(c.created_at), "d MMM yyyy")} · ${messages.length} message${
          messages.length === 1 ? "" : "s"
        }`}
        actions={
          <span className="flex gap-1.5">
            {activeBlocks.length > 0 && <Badge tone="critical" dot>blocked</Badge>}
            {locked ? <Badge tone="caution" dot>under review</Badge> : <Badge tone="positive" dot>active</Badge>}
          </span>
        }
      />

      {locked && (
        <Notice tone="caution" className="mb-4" icon={<Lock size={14} />}>
          This conversation is locked for its participants. Resolve it from the{" "}
          <Link to="/chat-review" className="font-medium underline">
            review queue
          </Link>
          . Unlocking is not possible from this screen.
        </Notice>
      )}

      <Stack>
      {reviews.length > 0 && (
        <Panel title="Review history">
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={r.status === "pending" ? "caution" : "neutral"}>
                    {REVIEW_STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                  <span className="font-medium text-ink">
                    {r.source === "user_report"
                      ? (r.reported_reason ?? "User reported")
                      : (r.pattern?.label ?? "Matched a flag pattern")}
                  </span>
                </div>
                <div className="mt-1 text-ink-muted">
                  Raised {format(new Date(r.created_at), "d MMM yyyy, HH:mm")}
                  {r.reviewed_at && ` · reviewed ${format(new Date(r.reviewed_at), "d MMM yyyy, HH:mm")}`}
                  {r.reason?.reason && ` · reason: ${r.reason.reason}`}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {(blocks.length > 0 || members.length > 0) && (
        <Panel title="Blocks and each person's own actions">
          <ul className="space-y-1.5 text-xs text-ink-muted">
            {blocks.map((x) => (
              <li key={`${x.blocker_id}-${x.blocked_id}`} className="flex items-start gap-1.5">
                <Ban size={13} className={x.unblocked_at ? "mt-px text-ink-faint" : "mt-px text-danger"} />
                <span>
                  <span className="font-medium text-ink">{name(x.blocker_id)}</span> blocked{" "}
                  <span className="font-medium text-ink">{name(x.blocked_id)}</span> on{" "}
                  {format(new Date(x.created_at), "d MMM yyyy, HH:mm")}
                  {x.unblocked_at
                    ? ` · unblocked ${format(new Date(x.unblocked_at), "d MMM yyyy, HH:mm")}`
                    : " · still blocked: no messages, calls, numbers, quotes or requests between them"}
                </span>
              </li>
            ))}
            {members.map((m) => (
              <li key={m.user_id}>
                <span className="font-medium text-ink">{name(m.user_id)}</span>
                {m.starred_at && ` · starred ${format(new Date(m.starred_at), "d MMM")}`}
                {m.archived_at && ` · archived ${format(new Date(m.archived_at), "d MMM")}`}
                {m.cleared_at && ` · deleted the chat for themselves ${format(new Date(m.cleared_at), "d MMM yyyy, HH:mm")} (everything is still shown here)`}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Thread" actions={<Badge>read-only</Badge>}>
        {messages.length === 0 ? (
          <Empty>No messages in this conversation.</Empty>
        ) : (
          <div className="space-y-2.5">
            {messages.map((m, i) => {
              const sender = people.get(m.sender_id);
              // Alignment is cosmetic only: right-hand side is the vendor when
              // the sides are known, otherwise everything stays left rather than
              // implying a role that wasn't established.
              const right = sides.resolved && m.sender_id === sides.vendorId;
              const url = link(m.attachment_path);
              const next = messages[i + 1];
              const at = (iso: string) => new Date(iso).getTime();
              const clearedHere = clears.filter((x) => at(m.created_at) <= at(x.at) && (!next || at(next.created_at) > at(x.at)));
              return (
                <Fragment key={m.id}>
                <div className={right ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[80%]">
                    <div
                      className={`mb-0.5 text-2xs text-ink-faint ${right ? "text-right" : "text-left"}`}
                    >
                      {participantLabel(sender, m.sender_id)}
                      {sides.resolved && (
                        <span> · {m.sender_id === sides.vendorId ? "vendor" : "buyer"}</span>
                      )}{" "}
                      · {format(new Date(m.created_at), "d MMM, HH:mm")}
                    </div>
                    <div
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        right
                          ? "border-line-strong bg-surface-2 text-ink"
                          : "border-line bg-surface text-ink shadow-xs"
                      }`}
                    >
                      {m.kind === "image" && m.attachment_path ? (
                        url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" title="Open the full picture">
                            <img src={url} alt="Photo sent in the chat" className="max-h-64 rounded-lg" />
                          </a>
                        ) : (
                          <span className="text-ink-faint">{files.isError ? "The photo couldn't be loaded." : "Loading the photo…"}</span>
                        )
                      ) : m.kind === "file" && m.attachment_path ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 underline-offset-2 hover:underline"
                        >
                          <FileText size={16} className="shrink-0 text-ink-muted" />
                          <span className="break-all">{m.attachment_name ?? "Document"}</span>
                          <span className="shrink-0 text-2xs text-ink-faint">PDF {formatBytes(m.attachment_bytes)}</span>
                          <Download size={14} className="shrink-0 text-ink-muted" />
                        </a>
                      ) : m.kind === "audio" && m.attachment_path ? (
                        url ? (
                          <span className="block">
                            <audio controls preload="metadata" src={url} className="h-9 w-64 max-w-full" />
                            <span className="mt-0.5 block text-2xs text-ink-faint">
                              Voice note · {formatSeconds(m.attachment_seconds)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-ink-faint">{files.isError ? "The voice note couldn't be loaded." : "Loading the voice note…"}</span>
                        )
                      ) : m.kind === "contact" ? (
                        <span className="block">
                          <span className="flex items-center gap-1.5 font-medium">
                            <User size={14} className="text-ink-muted" /> Contact card: {participantLabel(sender, m.sender_id)}
                          </span>
                          <ContactReveal messageId={m.id} />
                        </span>
                      ) : m.body ? (
                        <span className="whitespace-pre-wrap break-words">{m.body}</span>
                      ) : (
                        <span className="text-ink-faint">
                          No text. This is a &ldquo;{m.kind}&rdquo; message with nothing attached.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {clearedHere.map((x) => (
                  <div key={`clear-${x.user}`} className="flex items-center gap-2 py-1 text-2xs text-ink-faint">
                    <span className="h-px flex-1 bg-line" />
                    {name(x.user)} deleted the chat for themselves here ({format(new Date(x.at), "d MMM yyyy, HH:mm")}): they no longer see the messages above
                    <span className="h-px flex-1 bg-line" />
                  </div>
                ))}
                </Fragment>
              );
            })}
          </div>
        )}
      </Panel>

      {/*
        The buyer's account controls live here because this panel has no buyer
        profile page — buyers only exist in Cosora as chat participants. The
        vendor's identical control also appears on their vendor page.
      */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <SubHeading className="mb-2 block">
            {sides.resolved ? "Buyer" : "Participant A"} · {participantLabel(a, c.user_a)}
          </SubHeading>
          <AccountStatus
            profileId={sides.resolved ? sides.buyerId! : c.user_a}
            name={participantLabel(sides.resolved ? sides.buyer : a, sides.resolved ? sides.buyerId! : c.user_a)}
            kind={sides.resolved ? "buyer" : "account"}
          />
        </div>
        <div>
          <SubHeading className="mb-2 block">
            {sides.resolved ? "Vendor" : "Participant B"} · {participantLabel(b, c.user_b)}
          </SubHeading>
          <AccountStatus
            profileId={sides.resolved ? sides.vendorId! : c.user_b}
            name={participantLabel(sides.resolved ? sides.vendor : b, sides.resolved ? sides.vendorId! : c.user_b)}
            kind={sides.resolved ? "vendor" : "account"}
          />
          {sides.resolved && sides.vendorId && (
            <Link
              to={`/vendors/${sides.vendorId}`}
              className="mt-2 inline-block text-xs text-ink-muted underline hover:text-ink"
            >
              Open vendor profile
            </Link>
          )}
        </div>
      </div>

      {/*
        The flagged-items log, on the conversation itself.

        This is the only place an admin can write a durable internal note about
        a chat. It is NOT a moderation verdict — that lives on
        conversation_reviews and is written by resolve_conversation_review() —
        and it is not visible to either participant. Use it for the context a
        verdict cannot carry: "third report this month", "spoke to the vendor".
      */}
      <FlagLog entityType="conversation" entityId={c.id} />
      </Stack>
    </Page>
  );
}
