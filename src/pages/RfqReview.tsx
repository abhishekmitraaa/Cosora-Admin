import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  fetchReasons, fetchSubmissions, reviewSubmission, useRfqPendingCount,
  type RfqSubmission, type SubmissionState,
} from "@/lib/rfqReview";
import {
  Attr, AttrGrid, Badge, Button, Card, Empty, ErrorNote, Field, Modal, Note, Notice, Page, PageHeader,
  ReadOnlyBanner, Select, SkeletonList, Tabs, Textarea,
} from "@/components/ui";

/**
 * REQUIREMENT REVIEW (2026-10-17). lib/rfqReview.ts. Buyers are told review "usually takes 3–5 minutes", so the
 * queue is oldest first, shows how long each has waited, and refreshes itself. Approve puts the requirement live
 * for sellers (and runs their alerts); Not approved needs one of the managers' reasons, which the buyer reads.
 */

const TABS: { id: SubmissionState; label: string }[] = [
  { id: "pending", label: "Waiting" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Not approved" },
];

export default function RfqReview() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "rfq-review");
  const [tab, setTab] = useState<SubmissionState>("pending");
  const [rejecting, setRejecting] = useState<RfqSubmission | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const count = useRfqPendingCount();

  const list = useQuery({
    queryKey: ["rfq-review", tab],
    queryFn: () => fetchSubmissions(tab),
    refetchInterval: tab === "pending" ? 30_000 : false,
  });
  const reasons = useQuery({ queryKey: ["rfq-review", "reasons"], queryFn: fetchReasons });
  const activeReasons = (reasons.data ?? []).filter((r) => r.active);

  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "reject"; reasonId?: string; note?: string }) =>
      reviewSubmission(v.id, v.decision, v.reasonId, v.note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["rfq-review"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = (s: RfqSubmission) =>
    decide.mutate({ id: s.id, decision: "approve" }, { onSuccess: () => toast.success(`"${s.title}" is live for sellers`) });

  const submitRejection = () => {
    if (!rejecting || !reasonId) return;
    decide.mutate(
      { id: rejecting.id, decision: "reject", reasonId, note },
      {
        onSuccess: () => {
          toast.success(`"${rejecting.title}" not approved; the buyer is told why`);
          setRejecting(null);
        },
      },
    );
  };

  const chosen = activeReasons.find((r) => r.id === reasonId);

  return (
    <Page>
      <PageHeader
        title="Requirement review"
        subtitle="Buyers' requirements wait here until approved. Buyers are told it usually takes 3–5 minutes."
      />
      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "rfq-review")} />}
      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: t.id === "pending" ? count.data || undefined : undefined }))}
        active={tab}
        onChange={setTab}
      />

      {list.isLoading ? (
        <SkeletonList rows={3} height="h-36" />
      ) : list.error ? (
        <ErrorNote message={(list.error as Error).message} />
      ) : (list.data ?? []).length === 0 ? (
        <Empty>{tab === "pending" ? "Nothing waiting. New requirements appear here on their own." : "None yet."}</Empty>
      ) : (
        <div className="space-y-3" data-testid="rfq-review-list">
          {list.data!.map((s) => (
            <div key={s.id} data-testid="rfq-submission-card">
            <Card>
              <div className="flex flex-wrap gap-4">
                {s.images.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.images.slice(0, 3).map((src) => (
                      <img key={src} src={src} alt="" className="h-20 w-20 rounded-lg border border-line object-cover" />
                    ))}
                  </div>
                )}
                <div className="min-w-[240px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-section font-bold text-ink">{s.title}</h3>
                    {s.category === "Others (Custom)" && <Badge tone="info">Others: every seller</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    {s.buyerName ?? "A buyer"} · posted {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                    {s.buyerPhoneUnverified && <span className="ml-1.5"><Badge tone="caution">phone not verified</Badge></span>}
                  </div>
                  <AttrGrid cols={3}>
                    <Attr label="Category" value={s.category} />
                    <Attr label="Quantity" value={s.quantity} />
                    <Attr label="Budget" value={s.budgetMin != null || s.budgetMax != null ? `₹${s.budgetMin ?? "?"} – ₹${s.budgetMax ?? "?"}` : null} />
                    {s.attributes.map((a) => <Attr key={a.label} label={a.label} value={a.value} />)}
                  </AttrGrid>
                  {s.description && <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{s.description}</p>}
                  {s.state === "rejected" && (
                    <Notice tone="critical" className="mt-2.5 text-xs">
                      <span className="font-semibold">{s.reasonLabel ?? "Not approved"}.</span> {s.buyerMessage}
                      {s.reviewNote ? ` ${s.reviewNote}` : ""}
                      {s.reviewerName ? ` (${s.reviewerName}, ${format(new Date(s.reviewedAt!), "d MMM HH:mm")})` : ""}
                    </Notice>
                  )}
                  {s.state === "approved" && s.reviewedAt && (
                    <p className="mt-2 text-xs text-ink-faint">
                      Approved {format(new Date(s.reviewedAt), "d MMM HH:mm")}{s.reviewerName ? ` by ${s.reviewerName}` : ""}.
                    </p>
                  )}
                </div>
                {s.state === "pending" && (
                  <div className="flex w-full flex-col gap-1.5 sm:w-36">
                    <Button variant="primary" disabled={!writable || decide.isPending} onClick={() => approve(s)}>Approve</Button>
                    <Button variant="danger" disabled={!writable || decide.isPending}
                      onClick={() => { setRejecting(s); setReasonId(""); setNote(""); }}>
                      Not approve
                    </Button>
                  </div>
                )}
              </div>
            </Card>
            </div>
          ))}
        </div>
      )}

      <Modal open={rejecting !== null} title={`Not approve "${rejecting?.title ?? ""}"`} onClose={() => setRejecting(null)}>
        {activeReasons.length === 0 ? (
          <Notice tone="caution">
            There are no reasons to pick from. A manager adds them on <Link className="underline" to="/requirement-reasons">Requirement reasons</Link>.
          </Notice>
        ) : (
          <div className="space-y-3">
            <Field label="Reason" htmlFor="rfq-reason">
              <Select id="rfq-reason" value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
                <option value="">Pick a reason</option>
                {activeReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </Select>
            </Field>
            {chosen && <Note>The buyer reads: “{chosen.buyerMessage}”</Note>}
            <Field label="Note to the buyer (optional)" htmlFor="rfq-note">
              <Textarea id="rfq-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setRejecting(null)}>Cancel</Button>
              <Button variant="danger" disabled={!reasonId || decide.isPending} onClick={submitRejection}>Not approve</Button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
