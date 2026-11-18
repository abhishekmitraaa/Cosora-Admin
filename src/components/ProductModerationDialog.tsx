import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useRole } from "@/hooks/useAdminSession";
import { canEditReasons, useProductReasons, vendorMessage, type ReasonUse } from "@/lib/productModeration";
import { Button, ErrorNote, Field, Modal, Notice, Select, Spinner, Textarea } from "./ui";

const COPY: Record<ReasonUse, { title: string; confirm: string; busy: string; effect: string }> = {
  remove: {
    title: "Remove listing",
    confirm: "Remove listing",
    busy: "Removing…",
    effect:
      "The listing goes offline at once and is frozen: the vendor can't edit or resubmit it. A super admin or a manager can reinstate it later.",
  },
  flag: {
    title: "Flag listing",
    confirm: "Flag and hide",
    busy: "Flagging…",
    effect:
      "The listing is hidden from buyers and goes back to the review queue. Approving it there puts it back live; you can also reject or remove it.",
  },
};

/**
 * The one dialog for removing or flagging a listing. The reason is picked here, at the
 * moment of the action, from the managed templates (Mitra, 2026-10-07): nothing is sent
 * until one is chosen, and the vendor's exact notice is shown before confirming. The
 * database refuses an inactive reason or one that isn't for this action, so a template
 * switched off while the dialog is open fails loudly rather than being used.
 */
export default function ProductModerationDialog({
  action,
  productName,
  open,
  busy,
  onClose,
  onConfirm,
}: {
  action: ReasonUse;
  productName: string;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reasonId: string, note: string) => void;
}) {
  const role = useRole();
  const reasons = useProductReasons(false);
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");

  // A reason picked for one listing must never carry over to the next.
  useEffect(() => {
    if (open) {
      setReasonId("");
      setNote("");
    }
  }, [open, action]);

  const options = (reasons.data ?? []).filter((r) => r.applies_to.includes(action));
  const chosen = options.find((r) => r.id === reasonId);
  const copy = COPY[action];
  const tooLong = note.trim().length > 500;

  return (
    <Modal open={open} title={`${copy.title}: "${productName}"`} onClose={onClose} width="lg">
      <p className="mb-3 text-sm leading-relaxed text-ink-muted">{copy.effect}</p>

      {reasons.isLoading ? (
        <Spinner label="Loading reasons…" />
      ) : reasons.error ? (
        <ErrorNote message={(reasons.error as Error).message} />
      ) : options.length === 0 ? (
        <Notice tone="caution">
          There is no active reason for this action, so nothing can be recorded.{" "}
          {canEditReasons(role) ? (
            <Link to="/moderation-reasons" className="font-medium underline">
              Add one on Moderation reasons.
            </Link>
          ) : (
            "A super admin or a manager has to add one on Moderation reasons."
          )}
        </Notice>
      ) : (
        <div className="space-y-3">
          <Field label="Reason (required)" htmlFor="pm-reason" hint="The vendor reads this reason's message.">
            <Select id="pm-reason" value={reasonId} autoFocus onChange={(e) => setReasonId(e.target.value)}>
              <option value="">Select a reason…</option>
              {options.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Details for the vendor (optional)"
            htmlFor="pm-note"
            error={tooLong ? "Keep it under 500 characters." : null}
            hint="Added under the reason. Say what to fix, if anything can be fixed."
          >
            <Textarea
              id="pm-note"
              rows={3}
              value={note}
              placeholder="For example: the second photo shows another brand's logo."
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          {chosen && (
            <Notice tone="info" title="The vendor will be told">
              <span className="whitespace-pre-wrap" data-testid="pm-preview">
                {vendorMessage(chosen, note)}
              </span>
            </Notice>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="danger"
          disabled={!chosen || tooLong || busy}
          onClick={() => chosen && onConfirm(chosen.id, note)}
        >
          {busy ? copy.busy : copy.confirm}
        </Button>
      </div>
    </Modal>
  );
}
