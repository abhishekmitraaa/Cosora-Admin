import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase, assertWrote, describeWriteError } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useAdminSession, useRole } from "@/hooks/useAdminSession";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Input,
  Modal,
  Note,
  PageHeader,
  ReadOnlyBanner,
  Spinner,
  Table,
} from "@/components/ui";

interface ReasonRow {
  id: string;
  reason: string;
  active: boolean;
  created_at: string;
  created_by: string | null;
  creator: { full_name: string | null; email: string | null } | null;
}

/**
 * Super admin only — stricter than the other four chat-moderation screens,
 * because this list is the vocabulary every suspension is recorded in. Support
 * picks from it; only a super_admin decides what is on it.
 *
 * There is no delete. account_suspensions rows reference these by id and the
 * ledger has to stay readable, so a retired reason is deactivated — it vanishes
 * from the picker and stays legible on history.
 */
export default function ChatReasons() {
  const role = useRole();
  const { identity } = useAdminSession();
  const qc = useQueryClient();
  const writable = canWrite(role, "chat-reasons");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<ReasonRow | null>(null);
  const [draft, setDraft] = useState("");

  const reasons = useQuery({
    queryKey: ["chat-block-reasons", "all"],
    queryFn: async (): Promise<ReasonRow[]> => {
      const { data, error } = await supabase
        .from("chat_block_reasons")
        .select("id, reason, active, created_at, created_by, creator:profiles(full_name, email)")
        .order("active", { ascending: false })
        .order("reason", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ReasonRow[];
    },
  });

  function invalidate() {
    // Both the "all" list here and the picker's "active" list.
    void qc.invalidateQueries({ queryKey: ["chat-block-reasons"] });
  }

  const add = useMutation({
    mutationFn: async (value: string) => {
      // created_by is NOT NULL. Sending null produced a confusing 23502 from
      // Postgres instead of saying the session was the problem.
      if (!identity?.id) throw new Error("No admin session — sign in again before adding a reason.");
      const { error } = await supabase
        .from("chat_block_reasons")
        .insert({ reason: value.trim(), active: true, created_by: identity.id });
      if (error) throw new Error(describeWriteError(error));
    },
    onSuccess: () => {
      setReason("");
      toast.success("Reason added");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { reason?: string; active?: boolean } }) => {
      assertWrote(
        await supabase.from("chat_block_reasons").update(patch).eq("id", id).select("id"),
        "update block reason",
      );
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  if (reasons.isLoading) return <Spinner />;
  if (reasons.error) return <ErrorNote message={(reasons.error as Error).message} />;

  const rows = reasons.data ?? [];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Block reasons"
        subtitle="The reasons an admin may pick when suspending an account. Super admin only."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "chat-reasons")} />}

      <Note className="mb-4">
        Every suspension — from the review queue or from a profile — must cite one of these, and the
        choice is written to the <span className="font-mono text-[11px]">account_suspensions</span>{" "}
        ledger. Support sees the active ones in the picker but cannot change the list.
        <br />
        Reasons are never deleted: past suspensions point at them.{" "}
        <span className="font-medium text-ink">Deactivate</span> removes a reason from the picker
        while keeping history readable. Editing the text rewrites how every past suspension citing it
        reads.
      </Note>

      <Card className="mb-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) add.mutate(reason);
          }}
        >
          <Input
            placeholder="e.g. Attempting to move the deal off-platform"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-w-[18rem] flex-1"
          />
          <Button type="submit" variant="primary" disabled={!writable || !reason.trim() || add.isPending}>
            {add.isPending ? "Adding…" : "Add reason"}
          </Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Empty>No block reasons defined — no account can be suspended until one exists.</Empty>
      ) : (
        <Table head={["Reason", "State", "Added by", "Added", ""]}>
          {rows.map((r) => (
            <tr key={r.id} className={r.active ? "" : "opacity-60"}>
              <td className="px-3 py-2 text-ink">{r.reason}</td>
              <td className="px-3 py-2">
                {r.active ? <Badge tone="green" dot>active</Badge> : <Badge dot>inactive</Badge>}
              </td>
              <td className="px-3 py-2 text-ink-muted">
                {r.creator?.full_name || r.creator?.email || <span className="text-ink-faint">—</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-faint">
                {format(new Date(r.created_at), "d MMM yyyy")}
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1.5">
                  <Button
                    disabled={!writable}
                    onClick={() => {
                      setEditing(r);
                      setDraft(r.reason);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant={r.active ? "danger" : "outline"}
                    disabled={!writable || update.isPending}
                    onClick={() =>
                      update.mutate(
                        { id: r.id, patch: { active: !r.active } },
                        {
                          onSuccess: () =>
                            toast.success(r.active ? "Reason deactivated" : "Reason reactivated"),
                        },
                      )
                    }
                  >
                    {r.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={editing !== null} title="Edit block reason" onClose={() => setEditing(null)}>
        <p className="mb-3 text-sm text-ink-muted">
          This text is what past suspensions citing this reason will read as. Correct wording, don't
          repurpose it for a different offence — add a new reason for that.
        </p>
        <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!draft.trim() || draft.trim() === editing?.reason || update.isPending}
            onClick={() =>
              editing &&
              update.mutate(
                { id: editing.id, patch: { reason: draft.trim() } },
                {
                  onSuccess: () => {
                    toast.success("Reason updated");
                    setEditing(null);
                  },
                },
              )
            }
          >
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}
