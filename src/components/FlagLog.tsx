import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { supabase, describeWriteError } from "@/lib/supabase";
import { useAdminSession } from "@/hooks/useAdminSession";
import { Button, Textarea } from "./ui";

/**
 * Mirrors admin_flags_entity_type_check EXACTLY. The column is `text`, but it
 * carries a CHECK constraint — adding a value here without widening that
 * constraint gets a 23514 on insert. 'conversation' was added by 20260802140000.
 */
export type FlagEntity = "vendor" | "product" | "ad" | "conversation";

interface FlagRow {
  id: string;
  note: string;
  created_at: string;
  author_id: string;
  author: { full_name: string | null; email: string | null } | null;
}

/**
 * Part 7 — flagged-items log.
 *
 * Deliberately minimal and deliberately NOT a workflow tool: a note, a
 * timestamp, an author. No status, no assignee, no resolution, no queue. Cosora
 * has no order/transaction/complaint concept for a dispute to attach to, so
 * anything more would be inventing a process that doesn't exist. The UI copy
 * says exactly what this is.
 *
 * This is the one table `support` may write (admin_flags_insert allows any
 * is_admin author writing under their own author_id).
 */
export default function FlagLog({ entityType, entityId }: { entityType: FlagEntity; entityId: string }) {
  const qc = useQueryClient();
  const { identity } = useAdminSession();
  const [note, setNote] = useState("");

  const key = ["flags", entityType, entityId];

  const flags = useQuery({
    queryKey: key,
    queryFn: async (): Promise<FlagRow[]> => {
      const { data, error } = await supabase
        .from("admin_flags")
        .select("id, note, created_at, author_id, author:profiles!admin_flags_author_id_fkey(full_name, email)")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as FlagRow[];
    },
  });

  const addNote = useMutation({
    mutationFn: async (text: string) => {
      if (!identity) throw new Error("Not signed in");
      const { error } = await supabase.from("admin_flags").insert({
        entity_type: entityType,
        entity_id: entityId,
        note: text.trim(),
        author_id: identity.id, // must equal auth.uid() — the insert policy checks it
      });
      if (error) throw new Error(describeWriteError(error));
    },
    onSuccess: () => {
      setNote("");
      toast.success("Note added to log");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
        <Flag size={13} className="text-ink-muted" />
        Flagged-items log
      </div>
      <p className="mb-3 text-xs leading-relaxed text-ink-muted">
        Internal tracking notes only, not a dispute or workflow tool. Notes are append-only and
        visible to all admins.
      </p>

      <div className="flex gap-2">
        <Textarea
          rows={2}
          value={note}
          placeholder="Add an internal note…"
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          variant="primary"
          className="self-start"
          disabled={!note.trim() || addNote.isPending}
          onClick={() => addNote.mutate(note)}
        >
          Add
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {flags.isLoading && <p className="text-xs text-ink-faint">Loading notes…</p>}
        {!flags.isLoading && (flags.data ?? []).length === 0 && (
          <p className="text-xs text-ink-faint">No notes logged.</p>
        )}
        {(flags.data ?? []).map((f) => (
          <div key={f.id} className="rounded-lg border border-line bg-surface p-2.5 shadow-xs">
            <p className="whitespace-pre-wrap text-sm text-ink">{f.note}</p>
            <p className="mt-1 text-xs text-ink-faint">
              {f.author?.full_name || f.author?.email || "Unknown admin"} ·{" "}
              {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
