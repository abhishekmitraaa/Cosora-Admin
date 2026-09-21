import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase, assertWrote } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Note,
  Page,
  PageHeader,
  ReadOnlyBanner,
  ROW_HOVER,
  SkeletonList,
  Table,
} from "@/components/ui";

const SUBTITLE =
  "Plain terms that chat messages are checked against. Not regular expressions; for those, use Flag patterns.";

interface KeywordRow {
  id: string;
  term: string;
  created_at: string;
  added_by: string | null;
  adder_full_name: string | null;
  adder_email: string | null;
}

export default function ChatKeywords() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "chat-keywords");
  const [term, setTerm] = useState("");

  const terms = useQuery({
    queryKey: ["keyword-blocklist"],
    queryFn: async (): Promise<KeywordRow[]> => {
      // Ordered by term; adder_full_name / adder_email come back on each row.
      const { data, error } = await supabase.rpc("admin_keyword_list");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async (value: string) => {
      // added_by is set to the caller by the RPC; it is not a parameter.
      assertWrote(
        await supabase.rpc("admin_keyword_add", { p_term: value.trim() }),
        "add blocklist term",
      );
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
        await supabase.rpc("admin_keyword_remove", { p_id: id }),
        "remove blocklist term",
      );
    },
    onSuccess: () => {
      toast.success("Term removed");
      void qc.invalidateQueries({ queryKey: ["keyword-blocklist"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (terms.isLoading) {
    return (
      <Page width="narrow">
        <PageHeader title="Keyword blocklist" subtitle={SUBTITLE} />
        <SkeletonList rows={1} height="h-64" />
      </Page>
    );
  }
  if (terms.error) return <ErrorNote message={(terms.error as Error).message} />;

  const rows = terms.data ?? [];

  return (
    <Page width="narrow">
      <PageHeader title="Keyword blocklist" subtitle={SUBTITLE} />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "chat-keywords")} />}

      <Note className="mb-4">
        These are literal terms, matched as written. Enforcement lives in textile-spark-net: this
        screen manages the list, it does not decide what happens on a match.
      </Note>

      <Card className="mb-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (term.trim()) add.mutate(term);
          }}
        >
          <Field label="New blocked term" htmlFor="keyword-term" className="w-full max-w-xs">
            <Input
              id="keyword-term"
              placeholder="a word or phrase"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </Field>
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
            <tr key={k.id} className={ROW_HOVER}>
              <td className="px-3 py-2 font-mono text-xs text-ink">{k.term}</td>
              <td className="px-3 py-2 text-ink-muted">
                {k.adder_full_name || k.adder_email || (
                  <span className="text-ink-ghost">unknown</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-ink-faint">
                {format(new Date(k.created_at), "d MMM yyyy")}
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  variant="danger"
                  size="sm"
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
    </Page>
  );
}
