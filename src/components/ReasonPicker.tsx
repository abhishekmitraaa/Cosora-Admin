import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchActiveBlockReasons } from "@/lib/chat";
import { Button, Checkbox, ErrorNote, Field, Modal, Notice, Select, Spinner } from "./ui";

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
  resumeOption,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  description?: string;
  busy?: boolean;
  /**
   * When set, offers "reopen the chat for the other participant" alongside the
   * reason, and passes the answer to onConfirm. Used by the review queue's block
   * actions; omitted by the standalone suspend action, which has no thread.
   */
  resumeOption?: { label: string; hint: string; defaultChecked?: boolean };
  onClose: () => void;
  onConfirm: (reasonId: string, resume: boolean) => void;
}) {
  const [reasonId, setReasonId] = useState("");
  const [resume, setResume] = useState(false);

  const reasons = useQuery({
    queryKey: ["chat-block-reasons", "active"],
    queryFn: fetchActiveBlockReasons,
    enabled: open,
  });

  // Reset between openings so a reason picked for one account can't be
  // submitted against the next one by a stale default.
  useEffect(() => {
    if (open) {
      setReasonId("");
      setResume(resumeOption?.defaultChecked ?? false);
    }
  }, [open, resumeOption?.defaultChecked]);

  const options = reasons.data ?? [];

  return (
    <Modal open={open} title={title} onClose={onClose}>
      {description && <p className="mb-3 text-sm text-ink-muted">{description}</p>}

      {reasons.isLoading ? (
        <Spinner label="Loading reasons…" />
      ) : reasons.error ? (
        <ErrorNote message={(reasons.error as Error).message} />
      ) : options.length === 0 ? (
        <Notice tone="caution">
          There are no active block reasons, so no suspension can be recorded. A super admin has to
          add one on the{" "}
          <Link to="/chat-reasons" className="font-medium underline">
            Block reasons
          </Link>{" "}
          page first.
        </Notice>
      ) : (
        <>
          <Field
            label="Reason"
            htmlFor="block-reason"
            hint="Recorded on the account_suspensions ledger with your id and the time. It is the only record of why this happened."
          >
            <Select
              id="block-reason"
              value={reasonId}
              onChange={(e) => setReasonId(e.target.value)}
              autoFocus
            >
              <option value="">Select a reason…</option>
              {options.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.reason}
                </option>
              ))}
            </Select>
          </Field>

          {resumeOption && (
            <Checkbox
              className="mt-3"
              checked={resume}
              onChange={(e) => setResume(e.target.checked)}
              label={resumeOption.label}
              hint={resumeOption.hint}
            />
          )}
        </>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="danger"
          disabled={!reasonId || busy || options.length === 0}
          onClick={() => onConfirm(reasonId, resume)}
        >
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
