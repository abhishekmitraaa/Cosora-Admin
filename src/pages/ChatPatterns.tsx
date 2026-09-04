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
  Note,
  PageHeader,
  ReadOnlyBanner,
  Spinner,
  Table,
} from "@/components/ui";

interface PatternRow {
  id: string;
  pattern: string;
  label: string;
  active: boolean;
  created_at: string;
  added_by: string | null;
  adder: { full_name: string | null; email: string | null } | null;
}

export default function ChatPatterns() {
  const role = useRole();
  const { identity } = useAdminSession();
  const qc = useQueryClient();
  const writable = canWrite(role, "chat-patterns");
  const [pattern, setPattern] = useState("");
  const [label, setLabel] = useState("");

  const patterns = useQuery({
    queryKey: ["flag-patterns"],
    queryFn: async (): Promise<PatternRow[]> => {
      const { data, error } = await supabase
        .from("flag_patterns")
        .select("id, pattern, label, active, created_at, added_by, adder:profiles(full_name, email)")
        .order("active", { ascending: false })
        .order("label", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PatternRow[];
    },
  });

  const add = useMutation({
    mutationFn: async (row: { pattern: string; label: string }) => {
      const { error } = await supabase.from("flag_patterns").insert({
        pattern: row.pattern.trim(),
        label: row.label.trim(),
        active: true,
        added_by: identity?.id ?? null,
      });
      if (error) throw new Error(describeWriteError(error));
    },
    onSuccess: () => {
      setPattern("");
      setLabel("");
      toast.success("Pattern added");
      void qc.invalidateQueries({ queryKey: ["flag-patterns"] });
    },
    // A malformed regex is refused by the CHECK constraint on write. Surfacing
    // Postgres's own message verbatim tells the admin exactly which part of
    // their expression it choked on.
    onError: (e: Error) => toast.error(e.message, { duration: 12000 }),
  });

  const update = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      assertWrote(
        await supabase.from("flag_patterns").update({ active }).eq("id", id).select("id"),
        active ? "activate pattern" : "deactivate pattern",
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["flag-patterns"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertWrote(
        await supabase.from("flag_patterns").delete().eq("id", id).select("id"),
        "delete pattern",
      );
    },
    onSuccess: () => {
      toast.success("Pattern deleted");
      void qc.invalidateQueries({ queryKey: ["flag-patterns"] });
      void qc.invalidateQueries({ queryKey: ["chat-review"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (patterns.isLoading) return <Spinner />;
  if (patterns.error) return <ErrorNote message={(patterns.error as Error).message} />;

  const rows = patterns.data ?? [];

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Flag patterns"
        subtitle="Regular expressions that hold a conversation for review when a message matches. The label is what reviewers see in the queue."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "chat-patterns")} />}

      <Note className="mb-4">
        <span className="font-medium text-ink">These are POSIX regular expressions, not keywords.</span>{" "}
        <span className="font-mono text-[11px]">.</span>,{" "}
        <span className="font-mono text-[11px]">*</span>,{" "}
        <span className="font-mono text-[11px]">+</span>,{" "}
        <span className="font-mono text-[11px]">|</span>,{" "}
        <span className="font-mono text-[11px]">( )</span> and{" "}
        <span className="font-mono text-[11px]">[ ]</span> are operators — escape them with a
        backslash to match them literally. Postgres validates the expression when you save, and
        rejects anything it can't compile. For plain terms use the{" "}
        <span className="font-medium text-ink">Keyword blocklist</span> instead.
        <br />
        Deleting a pattern is not the same as deactivating it: existing review rows point at it, and
        a deleted one leaves them without a label. Deactivate unless you mean to erase it.
      </Note>

      <Card className="mb-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pattern.trim() && label.trim()) add.mutate({ pattern, label });
          }}
        >
          <div className="min-w-[16rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Pattern (regular expression)
            </label>
            <Input
              placeholder="e.g. (whats\s?app|telegram)"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Label (shown to reviewers)
            </label>
            <Input
              placeholder="e.g. Off-platform contact"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={!writable || !pattern.trim() || !label.trim() || add.isPending}
          >
            {add.isPending ? "Saving…" : "Add pattern"}
          </Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Empty>No flag patterns defined.</Empty>
      ) : (
        <Table head={["Label", "Pattern", "State", "Added by", "Added", ""]}>
          {rows.map((p) => (
            <tr key={p.id} className={p.active ? "" : "opacity-60"}>
              <td className="px-3 py-2 font-medium text-ink">{p.label}</td>
              <td className="px-3 py-2">
                <code className="break-all font-mono text-xs text-ink-muted">{p.pattern}</code>
              </td>
              <td className="px-3 py-2">
                {p.active ? <Badge tone="green" dot>active</Badge> : <Badge dot>inactive</Badge>}
              </td>
              <td className="px-3 py-2 text-ink-muted">
                {p.adder?.full_name || p.adder?.email || <span className="text-ink-faint">—</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-faint">
                {format(new Date(p.created_at), "d MMM yyyy")}
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1.5">
                  <Button
                    disabled={!writable || update.isPending}
                    onClick={() =>
                      update.mutate(
                        { id: p.id, active: !p.active },
                        {
                          onSuccess: () =>
                            toast.success(p.active ? "Pattern deactivated" : "Pattern activated"),
                        },
                      )
                    }
                  >
                    {p.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={!writable || remove.isPending}
                    onClick={() => {
                      if (confirm(`Delete the pattern "${p.label}"? Deactivating is usually what you want.`)) {
                        remove.mutate(p.id);
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
