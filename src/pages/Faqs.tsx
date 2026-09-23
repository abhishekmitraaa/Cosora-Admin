import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import { supabase, assertWrote } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  Note,
  Page,
  PageHeader,
  ReadOnlyBanner,
  ROW_HOVER,
  SkeletonList,
  Table,
  Tabs,
  Textarea,
} from "@/components/ui";

/**
 * FAQs for three surfaces of the buyer/vendor app (2026-09-23). The first real,
 * table-backed admin-editable content. Site content (Content.tsx) is still
 * dev-seed.
 *
 * Structured like ChatReasons: reads through admin_faq_list(), and every write
 * through an admin_faq_* RPC routed via assertWrote(), never raw table access.
 * The RPCs are the gate (super_admin writes; support may read). The page mirrors
 * it with canWrite() so a support admin sees a read-only view, not buttons that fail.
 *
 * Changes show on the live pages with no deploy: the apps read public.faqs directly.
 */

type Surface = "buyer_help" | "subscription" | "seller_registration";

const SURFACES: { id: Surface; label: string; where: string; grouped: boolean }[] = [
  { id: "buyer_help", label: "Buyer Help", where: "the buyer Help page (/profile/help and /help), grouped by category", grouped: true },
  { id: "subscription", label: "Subscription", where: "the vendor Subscription page, above the Contact us button", grouped: false },
  { id: "seller_registration", label: "Seller Registration", where: "not shown anywhere yet. Its placement on the vendor onboarding flow is still to be confirmed", grouped: false },
];

const SUBTITLE = "Questions and answers shown on the buyer Help page and vendor pages. Super admin edits; support can read.";

interface FaqRow {
  id: string;
  surface: string;
  category_label: string | null;
  question: string;
  answer: string;
  position: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  creator_full_name: string | null;
  creator_email: string | null;
}

interface Draft {
  category: string;
  question: string;
  answer: string;
}

const EMPTY_DRAFT: Draft = { category: "", question: "", answer: "" };

export default function Faqs() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "faqs");
  const [surface, setSurface] = useState<Surface>("buyer_help");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<FaqRow | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [deleting, setDeleting] = useState<FaqRow | null>(null);

  const meta = SURFACES.find((s) => s.id === surface)!;

  const faqs = useQuery({
    queryKey: ["faqs", "admin"],
    queryFn: async (): Promise<FaqRow[]> => {
      // Every surface in one call: the tab counts need them all, and the list is small.
      const { data, error } = await supabase.rpc("admin_faq_list");
      if (error) throw new Error(error.message);
      return (data ?? []) as FaqRow[];
    },
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["faqs"] });
  }

  const add = useMutation({
    mutationFn: async (d: Draft) => {
      assertWrote(
        await supabase.rpc("admin_faq_add", {
          p_surface: surface,
          // "" is stored as NULL by the RPC. Only Buyer Help uses categories.
          p_category_label: meta.grouped ? d.category.trim() : "",
          p_question: d.question.trim(),
          p_answer: d.answer.trim(),
        }),
        "add FAQ",
      );
    },
    onSuccess: () => {
      setDraft((d) => ({ ...EMPTY_DRAFT, category: d.category }));
      toast.success("FAQ added");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { category?: string; question?: string; answer?: string; active?: boolean } }) => {
      assertWrote(
        // An absent field is sent as nothing, which the RPC reads as "unchanged".
        await supabase.rpc("admin_faq_update", {
          p_id: id,
          p_category_label: patch.category,
          p_question: patch.question,
          p_answer: patch.answer,
          p_active: patch.active,
        }),
        "update FAQ",
      );
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertWrote(await supabase.rpc("admin_faq_delete", { p_id: id }), "delete FAQ");
    },
    onSuccess: () => {
      toast.success("FAQ deleted");
      setDeleting(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = useMutation({
    // Moving to a neighbour's position swaps the two, atomically, in the RPC.
    mutationFn: async ({ id, position }: { id: string; position: number }) => {
      assertWrote(await supabase.rpc("admin_faq_reorder", { p_id: id, p_position: position }), "reorder FAQ");
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const all = useMemo(() => faqs.data ?? [], [faqs.data]);
  const rows = useMemo(() => all.filter((r) => r.surface === surface), [all, surface]);

  // Buyer Help groups by category, ordered by each group's first position, the
  // same rule the Help page uses. Other surfaces are one flat group.
  const groups = useMemo(() => {
    if (!meta.grouped) return [{ label: "", rows }];
    const m = new Map<string, FaqRow[]>();
    for (const r of rows) {
      const label = r.category_label?.trim() || "General";
      if (!m.has(label)) m.set(label, []);
      m.get(label)!.push(r);
    }
    return Array.from(m, ([label, list]) => ({ label, rows: list }));
  }, [rows, meta.grouped]);

  const categories = useMemo(
    () => Array.from(new Set(all.filter((r) => r.surface === "buyer_help").map((r) => r.category_label?.trim()).filter(Boolean))) as string[],
    [all],
  );

  if (faqs.isLoading) {
    return (
      <Page>
        <PageHeader title="FAQs" subtitle={SUBTITLE} />
        <SkeletonList rows={1} height="h-64" />
      </Page>
    );
  }
  if (faqs.error) return <ErrorNote message={(faqs.error as Error).message} />;

  const canAdd = writable && draft.question.trim() && draft.answer.trim() && (!meta.grouped || draft.category.trim());

  return (
    <Page>
      <PageHeader title="FAQs" subtitle={SUBTITLE} />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "faqs")} />}

      <Tabs
        tabs={SURFACES.map((s) => ({ id: s.id, label: s.label, count: all.filter((r) => r.surface === s.id).length }))}
        active={surface}
        onChange={setSurface}
      />

      <Note className="mb-4">
        Shown on {meta.where}. Changes go live as soon as they&rsquo;re saved, with no deploy.{" "}
        <span className="font-medium text-ink">Deactivate</span> hides a question and keeps it here;{" "}
        <span className="font-medium text-ink">Delete</span> removes it for good. Order with the arrows.
      </Note>

      <Card className="mb-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canAdd) add.mutate(draft);
          }}
        >
          {meta.grouped && (
            <Field label="Category" htmlFor="faq-category">
              <Input
                id="faq-category"
                list="faq-categories"
                placeholder="Getting Started"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
              <datalist id="faq-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Field>
          )}
          <Field label="Question" htmlFor="faq-question">
            <Input
              id="faq-question"
              placeholder="How do I…?"
              value={draft.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
            />
          </Field>
          <Field label="Answer" htmlFor="faq-answer">
            <Textarea
              id="faq-answer"
              rows={3}
              value={draft.answer}
              onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={!canAdd || add.isPending}>
              {add.isPending ? "Adding…" : "Add FAQ"}
            </Button>
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Empty>No FAQs for {meta.label} yet.</Empty>
      ) : (
        groups.map((g) => (
          <div key={g.label || "all"} className="mb-4">
            {meta.grouped && <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-faint">{g.label}</p>}
            <Table head={["Order", "Question", "State", "Updated", ""]}>
              {g.rows.map((r, i) => {
                const prev = g.rows[i - 1];
                const next = g.rows[i + 1];
                return (
                  <tr key={r.id} className={r.active ? ROW_HOVER : `opacity-60 ${ROW_HOVER}`}>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          aria-label={`Move up: ${r.question}`}
                          disabled={!writable || !prev || reorder.isPending}
                          onClick={() => prev && reorder.mutate({ id: r.id, position: prev.position })}
                        >
                          <ArrowUp size={14} />
                        </Button>
                        <Button
                          size="sm"
                          aria-label={`Move down: ${r.question}`}
                          disabled={!writable || !next || reorder.isPending}
                          onClick={() => next && reorder.mutate({ id: r.id, position: next.position })}
                        >
                          <ArrowDown size={14} />
                        </Button>
                      </div>
                    </td>
                    <td className="max-w-md px-3 py-2">
                      <p className="font-medium text-ink">{r.question}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{r.answer}</p>
                    </td>
                    <td className="px-3 py-2">
                      {r.active ? <Badge tone="positive" dot>active</Badge> : <Badge dot>inactive</Badge>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-ink-faint">
                      {format(new Date(r.updated_at), "d MMM yyyy")}
                      <div className="text-ink-ghost">{r.creator_full_name || r.creator_email || "seeded"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          disabled={!writable}
                          onClick={() => {
                            setEditing(r);
                            setEditDraft({ category: r.category_label ?? "", question: r.question, answer: r.answer });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant={r.active ? "outline" : "primary"}
                          disabled={!writable || update.isPending}
                          onClick={() =>
                            update.mutate(
                              { id: r.id, patch: { active: !r.active } },
                              { onSuccess: () => toast.success(r.active ? "FAQ hidden" : "FAQ shown again") },
                            )
                          }
                        >
                          {r.active ? "Deactivate" : "Reactivate"}
                        </Button>
                        <Button size="sm" variant="danger" disabled={!writable} onClick={() => setDeleting(r)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        ))
      )}

      <Modal open={editing !== null} title="Edit FAQ" onClose={() => setEditing(null)}>
        <div className="space-y-3">
          {meta.grouped && (
            <Field label="Category" htmlFor="edit-faq-category">
              <Input
                id="edit-faq-category"
                list="faq-categories"
                value={editDraft.category}
                onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}
              />
            </Field>
          )}
          <Field label="Question" htmlFor="edit-faq-question">
            <Input
              id="edit-faq-question"
              autoFocus
              value={editDraft.question}
              onChange={(e) => setEditDraft({ ...editDraft, question: e.target.value })}
            />
          </Field>
          <Field label="Answer" htmlFor="edit-faq-answer">
            <Textarea
              id="edit-faq-answer"
              rows={5}
              value={editDraft.answer}
              onChange={(e) => setEditDraft({ ...editDraft, answer: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!editDraft.question.trim() || !editDraft.answer.trim() || update.isPending}
            onClick={() =>
              editing &&
              update.mutate(
                {
                  id: editing.id,
                  patch: {
                    // Buyer Help only. "" clears the category in the RPC.
                    category: meta.grouped ? editDraft.category.trim() : undefined,
                    question: editDraft.question.trim(),
                    answer: editDraft.answer.trim(),
                  },
                },
                {
                  onSuccess: () => {
                    toast.success("FAQ updated");
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

      <Modal open={deleting !== null} title="Delete this FAQ?" onClose={() => setDeleting(null)}>
        <p className="text-sm leading-relaxed text-ink-muted">
          &ldquo;{deleting?.question}&rdquo; will be removed for good. To hide it but keep it here, use Deactivate instead.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
            {remove.isPending ? "Deleting…" : "Delete FAQ"}
          </Button>
        </div>
      </Modal>
    </Page>
  );
}
