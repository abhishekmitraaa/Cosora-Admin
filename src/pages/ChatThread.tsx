import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Lock } from "lucide-react";
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
import { Badge, Card, Empty, ErrorNote, Note, PageHeader, Spinner } from "@/components/ui";

interface MessageRow {
  id: string;
  body: string | null;
  kind: string;
  created_at: string;
  sender_id: string;
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

const MESSAGE_LIMIT = 500;

/**
 * Read-only thread view.
 *
 * There is no message-rendering logic in this repo to reuse — chat is a
 * textile-spark-net surface and this panel has never touched it. So this is a
 * deliberately plain rendering of `messages`, and the one thing it borrows from
 * the buyer-side chat is the composer: it is ABSENT, not disabled. An admin
 * cannot post into a conversation from here, and there is no code path that
 * could.
 */
export default function ChatThread() {
  const { id } = useParams<{ id: string }>();

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

      const [messages, reviews, people] = await Promise.all([
        supabase
          .from("messages")
          .select("id, body, kind, created_at, sender_id")
          .eq("conversation_id", id!)
          .order("created_at", { ascending: true })
          .limit(MESSAGE_LIMIT),
        supabase
          .from("conversation_reviews")
          .select(
            `id, status, source, reported_reason, created_at, reviewed_at,
             pattern:flag_patterns(label), reason:chat_block_reasons(reason)`,
          )
          .eq("conversation_id", id!)
          .order("created_at", { ascending: false }),
        fetchParticipants([conversation.user_a, conversation.user_b]),
      ]);
      if (messages.error) throw new Error(messages.error.message);
      if (reviews.error) throw new Error(reviews.error.message);

      return {
        conversation,
        messages: (messages.data ?? []) as MessageRow[],
        reviews: (reviews.data ?? []) as unknown as ReviewRow[],
        people: people as Map<string, Participant>,
      };
    },
  });

  if (thread.isLoading) return <Spinner />;
  if (thread.error) return <ErrorNote message={(thread.error as Error).message} />;
  if (!thread.data) return <ErrorNote message="Conversation not found, or not visible to your role." />;

  const { conversation: c, messages, reviews, people } = thread.data;
  const sides = resolveSides(c.user_a, c.user_b, people);
  const a = people.get(c.user_a);
  const b = people.get(c.user_b);
  const locked = c.status === "under_review";

  return (
    <div className="max-w-4xl">
      <Link to="/chats" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={14} /> All chats
      </Link>

      <PageHeader
        title={`${participantLabel(a, c.user_a)} ↔ ${participantLabel(b, c.user_b)}`}
        subtitle={`Started ${format(new Date(c.created_at), "d MMM yyyy")} · ${messages.length} message${
          messages.length === 1 ? "" : "s"
        }`}
        actions={
          locked ? (
            <Badge tone="amber" dot>under review</Badge>
          ) : (
            <Badge tone="green" dot>active</Badge>
          )
        }
      />

      {locked && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          <Lock size={14} className="mt-0.5 shrink-0" />
          <span>
            This conversation is locked for its participants. Resolve it from the{" "}
            <Link to="/chat-review" className="font-medium underline">
              review queue
            </Link>{" "}
            — unlocking is not possible from this screen.
          </span>
        </div>
      )}

      {reviews.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Review history</h2>
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={r.status === "pending" ? "amber" : "slate"}>
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
        </Card>
      )}

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Thread</h2>
          <span className="text-xs text-ink-faint">Read-only</span>
        </div>

        {messages.length === 0 ? (
          <Empty>No messages in this conversation.</Empty>
        ) : (
          <div className="space-y-2.5">
            {messages.map((m) => {
              const sender = people.get(m.sender_id);
              // Alignment is cosmetic only: right-hand side is the vendor when
              // the sides are known, otherwise everything stays left rather than
              // implying a role that wasn't established.
              const right = sides.resolved && m.sender_id === sides.vendorId;
              return (
                <div key={m.id} className={right ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[80%]">
                    <div
                      className={`mb-0.5 text-[11px] text-ink-faint ${right ? "text-right" : "text-left"}`}
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
                          ? "border-line-strong bg-canvas text-ink"
                          : "border-line bg-surface text-ink shadow-xs"
                      }`}
                    >
                      {m.body ? (
                        <span className="whitespace-pre-wrap break-words">{m.body}</span>
                      ) : (
                        <span className="text-ink-faint">
                          No text — this is a "{m.kind}" message. Its contents are not rendered here.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {messages.length === MESSAGE_LIMIT && (
          <Note className="mt-3">
            Showing the first {MESSAGE_LIMIT} messages. Anything after that is not loaded.
          </Note>
        )}
      </Card>

      {/*
        The buyer's account controls live here because this panel has no buyer
        profile page — buyers only exist in Cosora as chat participants. The
        vendor's identical control also appears on their vendor page.
      */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {sides.resolved ? "Buyer" : "Participant A"} ·{" "}
            {participantLabel(a, c.user_a)}
          </h2>
          <AccountStatus
            profileId={sides.resolved ? sides.buyerId! : c.user_a}
            name={participantLabel(sides.resolved ? sides.buyer : a, sides.resolved ? sides.buyerId! : c.user_a)}
            kind={sides.resolved ? "buyer" : "account"}
          />
        </div>
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {sides.resolved ? "Vendor" : "Participant B"} ·{" "}
            {participantLabel(b, c.user_b)}
          </h2>
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
      <div className="mt-4">
        <FlagLog entityType="conversation" entityId={c.id} />
      </div>
    </div>
  );
}
