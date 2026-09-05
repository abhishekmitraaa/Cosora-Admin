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
  PageHeader,
  ReadOnlyBanner,
  Spinner,
} from "@/components/ui";

interface ReviewRow {
  id: string;
  source: string;
  reported_reason: string | null;
  created_at: string;
  conversation_id: string;
  pattern: { label: string; pattern: string } | null;
  flagged: { id: string; body: string | null; kind: string; created_at: string; sender_id: string } | null;
  conversation: { id: string; status: string; user_a: string; user_b: string } | null;
}

type Side = "buyer" | "vendor";

export default function ChatReview() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "chat-review");
  const [blocking, setBlocking] = useState<{ review: ReviewRow; side: Side; profileId: string; name: string } | null>(
    null,
  );

  const queue = useQuery({
    queryKey: ["chat-review"],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_reviews")
        .select(
          `id, source, reported_reason, created_at, conversation_id,
           pattern:flag_patterns(label, pattern),
           flagged:messages(id, body, kind, created_at, sender_id),
           conversation:conversations(id, status, user_a, user_b)`,
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as ReviewRow[];
      const people = await fetchParticipants(
        rows.flatMap((r) => (r.conversation ? [r.conversation.user_a, r.conversation.user_b] : [])),
      );
      return { rows, people: people as Map<string, Participant> };
    },
  });

  function invalidate() {
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
            `${describeWriteError(resolveError)} — it is still pending. Close it with "Keep locked" ` +
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

  if (queue.isLoading) return <Spinner />;
  if (queue.error) return <ErrorNote message={(queue.error as Error).message} />;

  const { rows, people } = queue.data!;
  const busy = resolve.isPending || block.isPending;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Review queue"
        subtitle="Conversations held for review — by a flag pattern match or a user report. Every row here is a locked chat waiting on a decision."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "chat-review")} />}

      <Note className="mb-4">
        <span className="font-medium text-ink">Resume</span> unlocks the chat and clears the review.{" "}
        <span className="font-medium text-ink">Keep locked</span> closes the review but leaves the
        chat locked — use it when the flag was right but nobody needs suspending.{" "}
        <span className="font-medium text-ink">Block</span> suspends that participant's account
        (recorded against this review on the audit ledger) and leaves the chat locked.
      </Note>

      {rows.length === 0 ? (
        <Empty>Nothing waiting for review.</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const conv = r.conversation;
            const sides = conv ? resolveSides(conv.user_a, conv.user_b, people) : null;
            const sender = r.flagged ? people.get(r.flagged.sender_id) : undefined;

            return (
              <Card key={r.id}>
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
                          <Badge tone="amber">pattern match</Badge>
                        </>
                      ) : (
                        <>
                          <MessageSquareWarning size={14} className="text-ink-muted" />
                          <span className="text-sm font-semibold text-ink">
                            {r.reported_reason ?? "User reported"}
                          </span>
                          <Badge tone="blue">user report</Badge>
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
                    <div className="rounded-lg border border-line bg-canvas px-3 py-2">
                      <div className="mb-1 text-[11px] text-ink-faint">
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
                              ? `No text — this is a "${r.flagged.kind}" message.`
                              : "The flagged message is not available (deleted, or this review has no message attached)."}
                          </span>
                        )}
                      </p>
                    </div>

                    {r.source === "regex_flag" && r.pattern?.pattern && (
                      <p className="mt-1.5 font-mono text-[11px] text-ink-faint">
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

                  {/* Actions. */}
                  <div className="flex w-full flex-col gap-1.5 sm:w-44">
                    <Button
                      variant="primary"
                      disabled={!writable || busy}
                      onClick={() => {
                        if (!confirm("Resume this chat? Both participants can message again.")) return;
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
                          { onSuccess: () => toast.success("Review closed — chat stays locked") },
                        )
                      }
                    >
                      Keep locked
                    </Button>

                    {conv && !sides?.resolved && (
                      <p className="text-[11px] leading-snug text-amber-700">
                        Blocking is unavailable: neither or both participants hold a vendor profile,
                        so which side is the buyer can't be established. Suspend the right account
                        from the thread view instead.
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ReasonPicker
        open={blocking !== null}
        title={`Block ${blocking?.side ?? ""} — ${blocking?.name ?? ""}`}
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
    </div>
  );
}
