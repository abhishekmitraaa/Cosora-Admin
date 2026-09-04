import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchActiveBlockReasons } from "@/lib/chat";
import { Button, ErrorNote, Modal, Select, Spinner } from "./ui";

/**
 * The one reason picker, shared by the review queue's block actions and the
 * standalone suspend action on a profile.
 *
 * Options come from `chat_block_reasons` where active = true — never a hardcoded
 * list. A suspension without a reason id is not offered, because
 * account_suspensions is the audit ledger that has to answer "why" later, and a
 * free-text box here would let two admins record the same decision differently.
 * If the list is empty there is nothing valid to submit and the UI says so
 * rather than sending null.
 */
export default function ReasonPicker({
  open,
  title,
  confirmLabel,
  description,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  description?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reasonId: string) => void;
}) {
  const [reasonId, setReasonId] = useState("");

  const reasons = useQuery({
    queryKey: ["chat-block-reasons", "active"],
    queryFn: fetchActiveBlockReasons,
    enabled: open,
  });

  // Reset between openings so a reason picked for one account can't be
  // submitted against the next one by a stale default.
  useEffect(() => {
    if (open) setReasonId("");
  }, [open]);

  const options = reasons.data ?? [];

  return (
    <Modal open={open} title={title} onClose={onClose}>
      {description && <p className="mb-3 text-sm text-ink-muted">{description}</p>}

      {reasons.isLoading ? (
        <Spinner label="Loading reasons…" />
      ) : reasons.error ? (
        <ErrorNote message={(reasons.error as Error).message} />
      ) : options.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          There are no active block reasons, so no suspension can be recorded. A super admin has to
          add one on the{" "}
          <Link to="/chat-reasons" className="font-medium underline">
            Block reasons
          </Link>{" "}
          page first.
        </div>
      ) : (
        <>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Reason</label>
          <Select value={reasonId} onChange={(e) => setReasonId(e.target.value)} autoFocus>
            <option value="">Select a reason…</option>
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.reason}
              </option>
            ))}
          </Select>
          <p className="mt-2 text-xs text-ink-faint">
            Recorded on the account_suspensions ledger with your id and the time. It is the only
            record of why this happened.
          </p>
        </>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="danger"
          disabled={!reasonId || busy || options.length === 0}
          onClick={() => onConfirm(reasonId)}
        >
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
