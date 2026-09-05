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
  const [sample, setSample] = useState("");
  const [probe, setProbe] = useState<{ valid: boolean; matches: boolean; error: string | null } | null>(
    null,
  );

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

  /**
   * Test the pattern with the engine that will actually run it.
   *
   * NOT `new RegExp(pattern)`. Postgres is POSIX ARE and JavaScript is
   * ECMA-262; they diverge exactly here. `\y` (the ARE word boundary) throws in
   * JS in one position and is silently read as a literal "y" in another, and
   * `` is a word boundary in JS but a BACKSPACE in ARE. A JS check would
   * reject two of the three patterns this project ships and wave through a
   * `` pattern that compiles, saves, and then never matches anything in
   * production. Validating against the wrong language is worse than not
   * validating, because it looks like it worked.
   *
   * regex_probe() is SECURITY DEFINER and role-gated to exactly the roles that
   * may write this table, so it exposes nothing an admin could not already
   * cause by saving the pattern.
   */
  const test = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("regex_probe", {
        p_pattern: pattern,
        p_sample: sample,
      });
      if (error) throw new Error(describeWriteError(error));
      return data as unknown as { valid: boolean; matches: boolean; error: string | null };
    },
    onSuccess: setProbe,
    onError: (e: Error) => toast.error(e.message),
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
      setSample("");
      setProbe(null);
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
            if (pattern.trim() && label.trim() && probe?.matches) add.mutate({ pattern, label });
          }}
        >
          <div className="min-w-[16rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Pattern (regular expression)
            </label>
            <Input
              placeholder="e.g. (whats\s?app|telegram)"
              value={pattern}
              onChange={(e) => {
                setPattern(e.target.value);
                setProbe(null); // a result for the previous pattern is worse than none
              }}
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
            disabled={
              !writable || !pattern.trim() || !label.trim() || add.isPending || !probe?.matches
            }
          >
            {add.isPending ? "Saving…" : "Add pattern"}
          </Button>
        </form>

        {/*
          Saving is BLOCKED until the pattern has been shown to match a sample.
          The CHECK constraint only proves a pattern compiles; a pattern that
          compiles and matches nothing is the failure this project actually hit,
          and it is invisible — no error, no log, just a rule that never fires.
        */}
        <div className="mt-3 border-t border-line pt-3">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Test it against a sample message (required before saving)
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[18rem] flex-1">
              <Input
                placeholder="e.g. ping me on whatsapp"
                value={sample}
                onChange={(e) => {
                  setSample(e.target.value);
                  setProbe(null);
                }}
              />
            </div>
            <Button
              type="button"
              disabled={!writable || !pattern.trim() || !sample.trim() || test.isPending}
              onClick={() => test.mutate()}
            >
              {test.isPending ? "Testing…" : "Test"}
            </Button>
          </div>

          {probe && (
            <div
              className={
                "mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed " +
                (probe.matches
                  ? "bg-emerald-50 text-emerald-900"
                  : "bg-amber-50 text-amber-900")
              }
            >
              {!probe.valid ? (
                <>
                  <span className="font-semibold">Postgres rejected this pattern.</span>{" "}
                  <span className="font-mono text-[11px]">{probe.error}</span>
                </>
              ) : probe.matches ? (
                <>
                  <span className="font-semibold">Matches.</span> This pattern would flag that
                  message and lock the conversation.
                </>
              ) : (
                <>
                  <span className="font-semibold">Valid, but it does not match.</span> A pattern that
                  compiles and never fires saves without complaint and then does nothing. If you
                  used <span className="font-mono text-[11px]"></span> for a word boundary, that
                  is the cause — Postgres regexes are POSIX, where{" "}
                  <span className="font-mono text-[11px]"></span> is a backspace character. Use{" "}
                  <span className="font-mono text-[11px]">\y</span> instead.
                </>
              )}
            </div>
          )}
        </div>
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
