import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { MessageSquareWarning, Regex } from "lucide-react";
import { supabase, describeWriteError } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { fetchParticipants, participantLabel, resolveSides, type Participant } from "@/lib/chat";
import ReasonPicker from "@/components/ReasonPicker";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Note,
  Page,
  PageHeader,
  ReadOnlyBanner,
  SkeletonList,
  StatusBadge,
  Tabs,
} from "@/components/ui";

interface ReviewRow {
  id: string;
  source: string;
  reported_reason: string | null;
  created_at: string;
  conversation_id: string;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  /** The admin's verdict vocabulary — distinct from reported_reason above. */
  reason: { reason: string } | null;
  pattern: { label: string; pattern: string } | null;
  flagged: { id: string; body: string | null; kind: string; created_at: string; sender_id: string } | null;
  conversation: { id: string; status: string; user_a: string; user_b: string } | null;
}

type Side = "buyer" | "vendor";

/**
 * Same shape as Products.tsx's TABS: the queue first, then the closed states as
 * an audit trail. Without them a resolved review vanished the moment it was
 * decided, so there was no way to answer "what did we do about this last time?"
 * — and `conversation_reviews` keeps every verdict precisely so that question
 * can be answered.
 */
const SUBTITLE =
  "Conversations held for review, by a flag pattern match or a user report. Pending items are locked chats waiting on a decision; the other tabs are the record of what was decided.";

type ReviewStatus = "pending" | "resumed" | "buyer_blocked" | "vendor_blocked" | "kept_locked";
const TABS: { id: ReviewStatus; label: string }[] = [
  { id: "pending", label: "Queue (pending)" },
  { id: "resumed", label: "Resumed" },
  { id: "buyer_blocked", label: "Buyer blocked" },
  { id: "vendor_blocked", label: "Vendor blocked" },
  { id: "kept_locked", label: "Kept locked" },
];

export default function ChatReview() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "chat-review");
  const [tab, setTab] = useState<ReviewStatus>("pending");
  const [blocking, setBlocking] = useState<{ review: ReviewRow; side: Side; profileId: string; name: string } | null>(
    null,
  );

  const queue = useQuery({
    // `tab` is part of the key, so switching tabs refetches rather than
    // rendering the previous tab's rows under the new heading.
    queryKey: ["chat-review", tab],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_reviews")
        .select(
          `id, source, reported_reason, created_at, conversation_id, status,
           reviewed_at, reviewed_by,
           pattern:flag_patterns(label, pattern),
           reason:chat_block_reasons(reason),
           flagged:messages(id, body, kind, created_at, sender_id),
           conversation:conversations(id, status, user_a, user_b)`,
        )
        .eq("status", tab)
        .order(tab === "pending" ? "created_at" : "reviewed_at", { ascending: false });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as ReviewRow[];
      // reviewed_by is included so the audit tabs can name the admin who
      // decided. It is a profiles id like the participants, so one lookup
      // covers both — fetchParticipants de-duplicates.
      const people = await fetchParticipants(
        rows.flatMap((r) => [
          ...(r.conversation ? [r.conversation.user_a, r.conversation.user_b] : []),
          ...(r.reviewed_by ? [r.reviewed_by] : []),
        ]),
      );
      return { rows, people: people as Map<string, Participant> };
    },
  });

  function invalidate() {
    // Prefix key, so resolving an item refreshes the tab it LEFT and the tab it
    // arrived in, not just the one on screen.
    void qc.invalidateQueries({ queryKey: ["chat-review"] });
    void qc.invalidateQueries({ queryKey: ["chats"] });
    void qc.invalidateQueries({ queryKey: ["chat-thread"] });
  }

  /**
   * Resume / keep locked. Both go through resolve_conversation_review() — a
   * client UPDATE of conversations.status matches zero rows under the current
   * RLS and returns success anyway, which would report a resumed chat that is
   * still locked. The RPC raises on every refusal, so `if (error)` is a
   * complete check here (no assertWrote needed).
   */
  const resolve = useMutation({
    mutationFn: async ({ reviewId, verdict }: { reviewId: string; verdict: "resumed" | "kept_locked" }) => {
      const { error } = await supabase.rpc("resolve_conversation_review", {
        p_review_id: reviewId,
        p_verdict: verdict,
        // Whether a verdict REOPENS the thread is explicit at every call site,
        // never inherited. The RPC defaults to false, so "resumed" is the only
        // verdict here that asks for it, and "kept_locked" cannot resume at all
        // (the function refuses, regardless of what is passed).
        p_resume: verdict === "resumed",
      });
      if (error) throw new Error(describeWriteError(error));
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message, { duration: 10000 }),
  });

  /**
   * Block = two calls, and the ORDER is deliberate.
   *
   * Suspend first, close the review second. The reverse ordering fails silently
   * in the way that matters: a review marked 'buyer_blocked' with nobody
   * actually suspended looks handled and disappears from the queue. This way a
   * failure leaves the item visibly pending and the message below says exactly
   * what did and did not happen.
   *
   * These cannot be one transaction from the client. Making them one would mean
   * set_account_status growing a second job, and it is deliberately the single
   * writer of the account_suspensions ledger.
   */
  const block = useMutation({
    mutationFn: async ({
      review,
      side,
      profileId,
      reasonId,
      resume,
    }: {
      review: ReviewRow;
      side: Side;
      profileId: string;
      reasonId: string;
      resume: boolean;
    }) => {
      const { error: suspendError } = await supabase.rpc("set_account_status", {
        p_profile_id: profileId,
        p_new_status: "suspended",
        p_reason_id: reasonId,
        p_source: "chat_review",
        p_conversation_review_id: review.id,
      });
      if (suspendError) throw new Error(describeWriteError(suspendError));

      const { error: resolveError } = await supabase.rpc("resolve_conversation_review", {
        p_review_id: review.id,
        p_verdict: side === "buyer" ? "buyer_blocked" : "vendor_blocked",
        p_reason_id: reasonId,
        // `resume` comes from the checkbox in the block dialog. Reopening is
        // safe either way — messages_insert independently requires the SENDER's
        // account to be active, so the party just suspended still cannot post —
        // but it is the reviewer's call whether the OTHER party gets the thread
        // back, so it is asked rather than assumed.
        p_resume: resume,
      });
      if (resolveError) {
        throw new Error(
          `The ${side}'s account WAS suspended, but this review could not be closed: ` +
            `${describeWriteError(resolveError)}. It is still pending. Close it with "Keep locked" ` +
            `so the queue matches what actually happened; do not block again.`,
        );
      }
    },
    onSuccess: () => {
      invalidate();
      setBlocking(null);
    },
    onError: (e: Error) => toast.error(e.message, { duration: 15000 }),
  });

  if (queue.isLoading) {
    return (
      <Page>
        <PageHeader title="Review queue" subtitle={SUBTITLE} />
        <SkeletonList rows={3} height="h-44" />
      </Page>
    );
  }
  if (queue.error) return <ErrorNote message={(queue.error as Error).message} />;

  const { rows, people } = queue.data!;
  const busy = resolve.isPending || block.isPending;
  // Closed tabs are an audit view. The RPC would refuse a second verdict anyway
  // (`and status = 'pending'` -> P0002), so hiding the buttons here is honesty
  // about a rule the database already enforces, not the rule itself.
  const pendingTab = tab === "pending";

  return (
    <Page>
      <PageHeader title="Review queue" subtitle={SUBTITLE} />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "chat-review")} />}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {pendingTab ? (
        <Note className="mb-4">
          <span className="font-medium text-ink">Resume</span> unlocks the chat and closes the
          review. <span className="font-medium text-ink">Keep locked</span> closes the review and leaves
          the chat locked, for the &ldquo;seen, still deciding&rdquo; case, so items do not sit in
          the queue forever. <span className="font-medium text-ink">Block</span> suspends that
          participant's account against this review on the audit ledger, and asks whether to reopen
          the chat for the other party.
        </Note>
      ) : (
        <Note className="mb-4">
          Closed reviews, newest decision first. Read-only: a verdict is recorded once, and{" "}
          <span className="font-mono text-2xs">resolve_conversation_review()</span> refuses a
          second one on the same row so two admins cannot overwrite each other.
        </Note>
      )}

      {rows.length === 0 ? (
        <Empty>{pendingTab ? "Nothing waiting for review." : "No reviews closed this way yet."}</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const conv = r.conversation;
            const sides = conv ? resolveSides(conv.user_a, conv.user_b, people) : null;
            const sender = r.flagged ? people.get(r.flagged.sender_id) : undefined;

            return (
              <Card key={r.id} className="transition-shadow hover:shadow-card-hover">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[16rem] flex-1">
                    {/* Why it is here. */}
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      {r.source === "regex_flag" ? (
                        <>
                          <Regex size={14} className="text-ink-muted" />
                          <span className="text-sm font-semibold text-ink">
                            {r.pattern?.label ?? "Matched a flag pattern (pattern since deleted)"}
                          </span>
                          <Badge tone="caution">pattern match</Badge>
                        </>
                      ) : (
                        <>
                          <MessageSquareWarning size={14} className="text-ink-muted" />
                          <span className="text-sm font-semibold text-ink">
                            {r.reported_reason ?? "User reported"}
                          </span>
                          <Badge tone="info">user report</Badge>
                        </>
                      )}
                    </div>

                    {/* Who. */}
                    <div className="mb-2 text-xs text-ink-muted">
                      {conv ? (
                        sides?.resolved ? (
                          <>
                            <span className="font-medium text-ink">
                              {participantLabel(sides.buyer, sides.buyerId!)}
                            </span>{" "}
                            (buyer) ↔{" "}
                            <span className="font-medium text-ink">
                              {participantLabel(sides.vendor, sides.vendorId!)}
                            </span>{" "}
                            (vendor)
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-ink">
                              {participantLabel(people.get(conv.user_a), conv.user_a)}
                            </span>{" "}
                            ↔{" "}
                            <span className="font-medium text-ink">
                              {participantLabel(people.get(conv.user_b), conv.user_b)}
                            </span>
                          </>
                        )
                      ) : (
                        <span className="text-ink-faint">Conversation not visible.</span>
                      )}
                      <span className="ml-1">· raised {format(new Date(r.created_at), "d MMM yyyy, HH:mm")}</span>
                    </div>

                    {/* The flagged message. */}
                    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                      <div className="mb-1 text-2xs text-ink-faint">
                        {r.flagged
                          ? `${participantLabel(sender, r.flagged.sender_id)} · ${format(
                              new Date(r.flagged.created_at),
                              "d MMM yyyy, HH:mm",
                            )}`
                          : "Flagged message"}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm text-ink">
                        {r.flagged?.body ?? (
                          <span className="text-ink-faint">
                            {r.flagged
                              ? `No text. This is a "${r.flagged.kind}" message.`
                              : "The flagged message is not available (deleted, or this review has no message attached)."}
                          </span>
                        )}
                      </p>
                    </div>

                    {r.source === "regex_flag" && r.pattern?.pattern && (
                      <p className="mt-1.5 font-mono text-2xs text-ink-faint">
                        matched: {r.pattern.pattern}
                      </p>
                    )}

                    <Link
                      to={`/chats/${r.conversation_id}`}
                      className="mt-2 inline-block text-xs text-ink-muted underline hover:text-ink"
                    >
                      Read the whole thread
                    </Link>
                  </div>

                  {/* Actions — pending only. Closed tabs show the verdict instead. */}
                  {!pendingTab ? (
                    <div className="w-full sm:w-44">
                      <StatusBadge status={r.status} dot={false} />
                      <p className="mt-2 text-2xs leading-snug text-ink-muted">
                        {r.reviewed_at
                          ? `Decided ${format(new Date(r.reviewed_at), "d MMM yyyy, HH:mm")}`
                          : "Decision time not recorded"}
                        {r.reviewed_by && ` by ${participantLabel(people.get(r.reviewed_by), r.reviewed_by)}`}
                      </p>
                      {/*
                        The ADMIN's verdict, from chat_block_reasons. Rendered
                        separately from reported_reason above, and never in its
                        place: seeing where a reporter and a reviewer disagreed
                        is the entire point of keeping both.
                      */}
                      {r.reason && (
                        <p className="mt-1.5 text-2xs leading-snug text-ink">
                          <span className="text-ink-faint">Verdict reason: </span>
                          {r.reason.reason}
                        </p>
                      )}
                      <p className="mt-2 text-2xs text-ink-faint">
                        Chat is currently {conv?.status ?? "unknown"}.
                      </p>
                    </div>
                  ) : (
                  <div className="flex w-full flex-col gap-1.5 sm:w-44">
                    <Button
                      variant="primary"
                      disabled={!writable || busy}
                      onClick={() => {
                        if (!confirm("Resume this chat? Both participants can message again, and the review closes as \"resumed\".")) return;
                        resolve.mutate(
                          { reviewId: r.id, verdict: "resumed" },
                          { onSuccess: () => toast.success("Chat resumed") },
                        );
                      }}
                    >
                      Resume
                    </Button>
                    <Button
                      variant="danger"
                      disabled={!writable || busy || !sides?.resolved}
                      onClick={() =>
                        setBlocking({
                          review: r,
                          side: "buyer",
                          profileId: sides!.buyerId!,
                          name: participantLabel(sides!.buyer, sides!.buyerId!),
                        })
                      }
                    >
                      Block buyer
                    </Button>
                    <Button
                      variant="danger"
                      disabled={!writable || busy || !sides?.resolved}
                      onClick={() =>
                        setBlocking({
                          review: r,
                          side: "vendor",
                          profileId: sides!.vendorId!,
                          name: participantLabel(sides!.vendor, sides!.vendorId!),
                        })
                      }
                    >
                      Block vendor
                    </Button>
                    <Button
                      disabled={!writable || busy}
                      onClick={() =>
                        resolve.mutate(
                          { reviewId: r.id, verdict: "kept_locked" },
                          { onSuccess: () => toast.success("Review closed. The chat stays locked.") },
                        )
                      }
                    >
                      Keep locked
                    </Button>

                    {conv && !sides?.resolved && (
                      <p className="text-2xs leading-snug text-caution-fg">
                        Blocking is unavailable: neither or both participants hold a vendor profile,
                        so which side is the buyer cannot be established. Suspend the right account
                        from the thread view instead.
                      </p>
                    )}
                  </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ReasonPicker
        open={blocking !== null}
        title={`Block ${blocking?.side ?? ""}: ${blocking?.name ?? ""}`}
        confirmLabel={`Suspend ${blocking?.side ?? "account"}`}
        description={`Suspends ${blocking?.name ?? "this account"} and closes this review as ${
          blocking?.side === "buyer" ? "buyer_blocked" : "vendor_blocked"
        }.`}
        busy={block.isPending}
        resumeOption={{
          label: `Reopen the chat for the ${blocking?.side === "buyer" ? "vendor" : "buyer"}`,
          hint:
            "Safe either way: the suspended account cannot send regardless, because " +
            "messages_insert checks the sender's own status. Leave this off if the whole " +
            "thread should stay closed.",
        }}
        onClose={() => setBlocking(null)}
        onConfirm={(reasonId, resume) =>
          blocking &&
          block.mutate(
            {
              review: blocking.review,
              side: blocking.side,
              profileId: blocking.profileId,
              reasonId,
              resume,
            },
            { onSuccess: () => toast.success(`${blocking.name} suspended · review closed`) },
          )
        }
      />
    </Page>
  );
}
