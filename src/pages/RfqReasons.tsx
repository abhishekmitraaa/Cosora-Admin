import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { fetchReasons, saveReason, type ReviewReason } from "@/lib/rfqReview";
import {
  Badge, Button, Card, Checkbox, Empty, ErrorNote, Field, Input, Modal, Note, Page, PageHeader, ReadOnlyBanner,
  SkeletonList, Textarea,
} from "@/components/ui";

/**
 * REQUIREMENT REASONS (2026-10-17). The reasons a reviewer picks when a buyer's requirement isn't approved, each with
 * the message the buyer reads. Mitra: "a proper reason, pre-made by a manager". Managers and super admins write
 * them (admin_rfq_review_reason_save); reviewers read them. No delete: a retired reason is made inactive, so past
 * decisions keep their wording.
 */
type Draft = { id: string | null; label: string; buyerMessage: string; active: boolean };

export default function RfqReasons() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "rfq-reasons");
  const [draft, setDraft] = useState<Draft | null>(null);
  const reasons = useQuery({ queryKey: ["rfq-review", "reasons"], queryFn: fetchReasons });

  const save = useMutation({
    mutationFn: (d: Draft) => saveReason(d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rfq-review", "reasons"] });
      toast.success("Reason saved");
      setDraft(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const edit = (r: ReviewReason) => setDraft({ id: r.id, label: r.label, buyerMessage: r.buyerMessage, active: r.active });

  return (
    <Page>
      <PageHeader
        title="Requirement reasons"
        subtitle="What a reviewer can say when a buyer's requirement isn't approved. The buyer reads the message."
        actions={writable ? <Button variant="primary" onClick={() => setDraft({ id: null, label: "", buyerMessage: "", active: true })}>Add reason</Button> : undefined}
      />
      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "rfq-reasons")} />}
      {reasons.isLoading ? (
        <SkeletonList rows={3} height="h-20" />
      ) : reasons.error ? (
        <ErrorNote message={(reasons.error as Error).message} />
      ) : (reasons.data ?? []).length === 0 ? (
        <Empty>No reasons yet.</Empty>
      ) : (
        <div className="space-y-2">
          {reasons.data!.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-ink">{r.label}</h3>
                    {!r.active && <Badge>inactive</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{r.buyerMessage}</p>
                </div>
                {writable && <Button onClick={() => edit(r)}>Edit</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={draft !== null} title={draft?.id ? "Edit reason" : "Add reason"} onClose={() => setDraft(null)}>
        {draft && (
          <div className="space-y-3">
            <Field label="Name (reviewers see it)" htmlFor="reason-label">
              <Input id="reason-label" maxLength={80} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </Field>
            <Field label="Message to the buyer" htmlFor="reason-message">
              <Textarea id="reason-message" rows={4} maxLength={400} value={draft.buyerMessage}
                onChange={(e) => setDraft({ ...draft, buyerMessage: e.target.value })} />
            </Field>
            <Note>Say what was wrong and what the buyer can do next. 10 to 400 characters.</Note>
            <Checkbox label="Active (reviewers can pick it)" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDraft(null)}>Cancel</Button>
              <Button variant="primary" disabled={save.isPending || draft.label.trim().length < 3 || draft.buyerMessage.trim().length < 10}
                onClick={() => save.mutate(draft)}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
