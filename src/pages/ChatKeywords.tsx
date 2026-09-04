import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase, assertWrote, describeWriteError } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useAdminSession, useRole } from "@/hooks/useAdminSession";
import {
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

interface KeywordRow {
  id: string;
  term: string;
  created_at: string;
  added_by: string | null;
  adder: { full_name: string | null; email: string | null } | null;
}

export default function ChatKeywords() {
  const role = useRole();
  const { identity } = useAdminSession();
  const qc = useQueryClient();
  const writable = canWrite(role, "chat-keywords");
  const [term, setTerm] = useState("");

  const terms = useQuery({
    queryKey: ["keyword-blocklist"],
    queryFn: async (): Promise<KeywordRow[]> => {
      const { data, error } = await supabase
        .from("keyword_blocklist")
        .select("id, term, created_at, added_by, adder:profiles(full_name, email)")
        .order("term", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as KeywordRow[];
    },
  });

  const add = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase
        .from("keyword_blocklist")
        .insert({ term: value.trim(), added_by: identity?.id ?? null });
      // INSERTs don't need assertWrote: a WITH CHECK violation does raise.
      if (error) throw new Error(describeWriteError(error));
    },
    onSuccess: () => {
      setTerm("");
      toast.success("Term added to the blocklist");
      void qc.invalidateQueries({ queryKey: ["keyword-blocklist"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertWrote(
        await supabase.from("keyword_blocklist").delete().eq("id", id).select("id"),
        "remove blocklist term",
      );
    },
    onSuccess: () => {
      toast.success("Term removed");
      void qc.invalidateQueries({ queryKey: ["keyword-blocklist"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (terms.isLoading) return <Spinner />;
  if (terms.error) return <ErrorNote message={(terms.error as Error).message} />;

  const rows = terms.data ?? [];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Keyword blocklist"
        subtitle="Plain terms that chat messages are checked against. Not regular expressions — for those, use Flag patterns."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "chat-keywords")} />}

      <Note className="mb-4">
        These are literal terms, matched as written. Enforcement lives in
        textile-spark-net — this screen manages the list, it does not decide what happens on a
        match.
      </Note>

      <Card className="mb-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (term.trim()) add.mutate(term);
          }}
        >
          <Input
            placeholder="Add a term…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="max-w-xs"
          />
          <Button type="submit" variant="primary" disabled={!writable || !term.trim() || add.isPending}>
            {add.isPending ? "Adding…" : "Add term"}
          </Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Empty>The blocklist is empty.</Empty>
      ) : (
        <Table head={["Term", "Added by", "Added", ""]}>
          {rows.map((k) => (
            <tr key={k.id}>
              <td className="px-3 py-2 font-mono text-xs text-ink">{k.term}</td>
              <td className="px-3 py-2 text-ink-muted">
                {k.adder?.full_name || k.adder?.email || <span className="text-ink-faint">—</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-faint">
                {format(new Date(k.created_at), "d MMM yyyy")}
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  variant="danger"
                  disabled={!writable || remove.isPending}
                  onClick={() => {
                    if (confirm(`Remove "${k.term}" from the blocklist?`)) remove.mutate(k.id);
                  }}
                >
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
