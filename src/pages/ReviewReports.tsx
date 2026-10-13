import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/hooks/useAdminSession";
import { canWrite, readOnlyReason } from "@/lib/roles";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Modal,
  Note,
  Page,
  PageHeader,
  ReadOnlyBanner,
  SkeletonList,
  Tabs,
  Textarea,
  type Tone,
} from "@/components/ui";

/**
 * Reported reviews (2026-10-13; buyer repo migration 20261013100200_review_reports).
 *
 * Any signed-in buyer or seller can report a store, product or service review. This is the
 * queue: one card per reviewed item, with every report on it. Super admins and support
 * decide: dismiss the reports (the review stays), or remove the review with a reason.
 *
 * Everything is decided by the database:
 *   admin_review_reports_list(status)            the reports, with the review as it stood when reported;
 *   admin_review_report_decide(kind, id, action) closes every open report on that review. Removing
 *     deletes the review, moves the rating, and tells its author in Cosora's own words.
 * Neither the author nor the seller is ever told who reported, or that a report was made, so
 * nothing on this page should be passed on to them.
 */

type Status = "open" | "removed" | "dismissed";

type Snapshot = {
  body?: string | null;
  rating?: number | null;
  reviewer_name?: string | null;
  subject_name?: string | null;
  created_at?: string | null;
};

type Report = {
  id: string;
  review_kind: string;
  review_id: string;
  review_exists: boolean;
  review_snapshot: Snapshot | null;
  reason_code: string;
  reason_label: string;
  note: string | null;
  status: string;
  created_at: string;
  reporter_id: string;
  reporter_name: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_note: string | null;
};

type Group = { key: string; kind: string; reviewId: string; reports: Report[] };

const KINDS: Record<string, string> = { store: "Seller review", product: "Product review", service: "Service review" };
const STATUS_TONE: Record<string, Tone> = { open: "caution", removed: "critical", dismissed: "neutral" };
const NOTE_MAX = 500;

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});
const when = (at: string | null | undefined) => (at ? `${IST.format(new Date(at))} IST` : "");

export default function ReviewReports() {
  const role = useAdminSession().identity?.role ?? null;
  const mayDecide = canWrite(role, "review-reports");
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("open");
  const [removing, setRemoving] = useState<Group | null>(null);
  const [reason, setReason] = useState("");

  const list = useQuery({
    queryKey: ["review-reports", status],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_review_reports_list", { p_status: status });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Report[];
    },
  });

  // One card per review: several people can report the same one.
  const groups = useMemo<Group[]>(() => {
    const byReview = new Map<string, Group>();
    for (const r of list.data ?? []) {
      const key = `${r.review_kind}:${r.review_id}`;
      const g = byReview.get(key) ?? { key, kind: r.review_kind, reviewId: r.review_id, reports: [] };
      g.reports.push(r);
      byReview.set(key, g);
    }
    return [...byReview.values()];
  }, [list.data]);

  const decide = useMutation({
    mutationFn: async (v: { group: Group; action: "remove" | "dismiss"; note?: string }) => {
      const { error } = await supabase.rpc("admin_review_report_decide", {
        p_kind: v.group.kind,
        p_review_id: v.group.reviewId,
        p_action: v.action,
        p_note: v.note,
      });
      if (error) throw new Error(error.message);
      return v.action;
    },
    onSuccess: (action) => {
      toast.success(action === "remove" ? "Review removed. Its author has been told." : "Reports dismissed. The review stays up.");
      setRemoving(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["review-reports"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Page>
      <PageHeader
        title="Reported reviews"
        subtitle="Reviews that buyers or sellers reported. Dismiss the reports, or remove the review."
      />
      {!mayDecide && <ReadOnlyBanner reason={readOnlyReason(role, "review-reports")} />}

      <Note className="mb-4">
        Who reported a review is for Cosora&rsquo;s team only. The author is told their review was removed, never
        who reported it or that it was reported.
      </Note>

      <Tabs<Status>
        tabs={[
          { id: "open", label: "Open" },
          { id: "removed", label: "Removed" },
          { id: "dismissed", label: "Dismissed" },
        ]}
        active={status}
        onChange={setStatus}
      />

      {list.isLoading ? (
        <SkeletonList rows={3} height="h-32" />
      ) : list.error ? (
        <ErrorNote message={(list.error as Error).message} />
      ) : groups.length === 0 ? (
        <Empty>{status === "open" ? "No reviews are waiting for a decision." : "Nothing here yet."}</Empty>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const first = g.reports[0];
            const snap = first.review_snapshot ?? {};
            return (
              <div key={g.key} data-review-report={g.reviewId}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">{KINDS[g.kind] ?? g.kind}</Badge>
                      <Badge tone={STATUS_TONE[first.status] ?? "neutral"}>{first.status}</Badge>
                      {status === "open" && !first.review_exists && <Badge tone="neutral">Already deleted by its author</Badge>}
                    </div>
                    <div className="mt-2 text-sm font-medium text-ink">
                      {snap.subject_name ?? "Unknown subject"}
                    </div>
                    <div className="text-xs text-ink-muted">
                      By {snap.reviewer_name ?? "an unnamed reviewer"}
                      {typeof snap.rating === "number" ? ` · ${snap.rating} of 5` : ""}
                      {snap.created_at ? ` · ${when(snap.created_at)}` : ""}
                    </div>
                  </div>
                  {status === "open" && mayDecide && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ group: g, action: "dismiss" })}
                      >
                        Dismiss reports
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={decide.isPending || !first.review_exists}
                        onClick={() => { setRemoving(g); setReason(""); }}
                      >
                        Remove review
                      </Button>
                    </div>
                  )}
                </div>

                <blockquote className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 text-sm text-ink">
                  {snap.body?.trim() ? snap.body : <span className="text-ink-muted">A rating with no text.</span>}
                </blockquote>

                <div className="mt-3 space-y-2">
                  {g.reports.map((r) => (
                    <div key={r.id} className="rounded-lg border border-line p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-ink">{r.reason_label}</span>
                        <span className="text-xs text-ink-muted">
                          reported by {r.reporter_name ?? r.reporter_id.slice(0, 8)} · {when(r.created_at)}
                        </span>
                      </div>
                      {r.note && <p className="mt-1 whitespace-pre-wrap break-words text-ink">{r.note}</p>}
                    </div>
                  ))}
                </div>

                {first.decided_at && (
                  <p className="mt-3 text-xs text-ink-muted">
                    {first.status === "removed" ? "Removed" : "Dismissed"} by {first.decided_by_name ?? "an admin"} · {when(first.decided_at)}
                    {first.decision_note ? ` · ${first.decision_note}` : ""}
                  </p>
                )}
              </Card>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={removing !== null} title="Remove this review" onClose={() => setRemoving(null)}>
        <p className="mb-3 text-sm text-ink-muted">
          The review is deleted, the rating is recalculated, and its author is told Cosora removed it. Say why:
          the reason is kept in the Admin Log and is not shown to the author.
        </p>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, NOTE_MAX))}
          rows={3}
          placeholder="Why this review is being removed"
          aria-label="Reason"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setRemoving(null)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={!reason.trim() || decide.isPending}
            onClick={() => removing && decide.mutate({ group: removing, action: "remove", note: reason.trim() })}
          >
            {decide.isPending ? "Removing…" : "Remove review"}
          </Button>
        </div>
      </Modal>
    </Page>
  );
}
