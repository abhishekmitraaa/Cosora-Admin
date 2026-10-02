import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import { supabase, assertWrote } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import HelpGuides from "@/components/HelpGuides";
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
 * FAQs for four surfaces of the buyer/vendor app (2026-09-23; Seller Help added in
 * Help & Support P5, 2026-10-01). The first real,
 * table-backed admin-editable content. Site content (Content.tsx) is still
 * dev-seed.
 *
 * Structured like ChatReasons: reads through admin_faq_list(), and every write
 * through an admin_faq_* RPC routed via assertWrote(), never raw table access.
 * The RPCs are the gate: support and super_admin read and write, and every other
 * role is refused. The page still checks canWrite(), so a role that could read but
 * not write would get a read-only view rather than buttons that fail. Today the
 * read and write lists in roles.ts are the same.
 *
 * Changes show on the live pages with no deploy, within about a minute. Every write
 * rebuilds a JSON snapshot per surface on the Storage CDN (trg_faqs_snapshot → the
 * faqs-snapshot edge function) and the apps read that. The CDN's copy is invalidated
 * by the rebuild; measured, every visitor has the new file ~47 s after the edit. If
 * a snapshot can't be read, the apps read public.faqs directly (textile-spark-net
 * Phase 23).
 *
 * Translations (P5): Hindi and Gujarati are stored with the FAQ and edited in Edit
 * (admin_faq_set_translations, read back through admin_faq_translations). Changing the
 * English question or answer clears them in the database, so a translation never
 * outlives the text it translated. Without one, the app falls back to its catalogues.
 */

type Surface = "buyer_help" | "seller_help" | "subscription" | "seller_registration";

const SURFACES: { id: Surface; label: string; where: string; grouped: boolean }[] = [
  { id: "buyer_help", label: "Buyer Help", where: "the buyer Help page (/profile/help and /help), grouped by category", grouped: true },
  { id: "seller_help", label: "Seller Help", where: "the Help page for sellers (/help on the seller side), grouped by category", grouped: true },
  { id: "subscription", label: "Subscription", where: "the vendor Subscription page (/subscription), above the Contact us button", grouped: false },
  { id: "seller_registration", label: "Seller Registration", where: "the seller landing page (/seller), which signed-out visitors see before registering", grouped: false },
];

const SUBTITLE = "Questions and answers shown on the buyer and seller Help pages and vendor pages. Support and super admin can edit them.";

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
  /** From admin_faq_translations(), merged by id. */
  translations: Translations;
}

type Lang = "hi" | "gu";
type Translations = Partial<Record<Lang, { question: string; answer: string }>>;
const LANGS: { id: Lang; label: string }[] = [
  { id: "hi", label: "Hindi" },
  { id: "gu", label: "Gujarati" },
];

interface Draft {
  category: string;
  question: string;
  answer: string;
}

interface EditDraft extends Draft {
  hi: { question: string; answer: string };
  gu: { question: string; answer: string };
}

const EMPTY_DRAFT: Draft = { category: "", question: "", answer: "" };
const EMPTY_EDIT: EditDraft = { ...EMPTY_DRAFT, hi: { question: "", answer: "" }, gu: { question: "", answer: "" } };

export default function Faqs() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "faqs");
  const [surface, setSurface] = useState<Surface>("buyer_help");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<FaqRow | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(EMPTY_EDIT);
  const [deleting, setDeleting] = useState<FaqRow | null>(null);
  // Quick Guides (Help & Support P4d) share this page and its audience, not its table.
  const [guides, setGuides] = useState(false);

  const meta = SURFACES.find((s) => s.id === surface)!;

  const faqs = useQuery({
    queryKey: ["faqs", "admin"],
    queryFn: async (): Promise<FaqRow[]> => {
      // Every surface in one call: the tab counts need them all, and the list is small.
      const [{ data, error }, tr] = await Promise.all([
        supabase.rpc("admin_faq_list"),
        supabase.rpc("admin_faq_translations"),
      ]);
      if (error) throw new Error(error.message);
      // PGRST202: the function isn't in the database yet (this page deployed before the
      // P5 migration). Show the FAQs without translations rather than no page at all.
      if (tr.error && tr.error.code !== "PGRST202") throw new Error(tr.error.message);
      const byId = new Map((tr.data ?? []).map((t) => [t.id, (t.translations ?? {}) as Translations]));
      return (data ?? []).map((r) => ({ ...r, translations: byId.get(r.id) ?? {} })) as FaqRow[];
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

  // The Edit dialog: the English through admin_faq_update, then the translations. The
  // update clears stored translations when the English changes, so they're written
  // after it whenever there's anything to keep.
  const saveEdit = useMutation({
    mutationFn: async ({ row, d }: { row: FaqRow; d: EditDraft }) => {
      const next: Translations = {};
      for (const { id, label } of LANGS) {
        const q = d[id].question.trim();
        const a = d[id].answer.trim();
        if (Boolean(q) !== Boolean(a)) throw new Error(`Fill in both the ${label} question and answer, or leave both empty.`);
        if (q) next[id] = { question: q, answer: a };
      }
      const englishChanged = d.question.trim() !== row.question || d.answer.trim() !== row.answer;
      assertWrote(
        await supabase.rpc("admin_faq_update", {
          p_id: row.id,
          // Grouped surfaces only. "" clears the category in the RPC.
          p_category_label: meta.grouped ? d.category.trim() : undefined,
          p_question: d.question.trim(),
          p_answer: d.answer.trim(),
        }),
        "update FAQ",
      );
      const changed = englishChanged
        ? Object.keys(next).length > 0
        : JSON.stringify(next) !== JSON.stringify(row.translations ?? {});
      if (changed) {
        assertWrote(
          await supabase.rpc("admin_faq_set_translations", { p_id: row.id, p_translations: next }),
          "save translations",
        );
      }
    },
    onSuccess: () => {
      toast.success("FAQ updated");
      setEditing(null);
      invalidate();
    },
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

  // Suggestions from the categories already on this surface.
  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category_label?.trim()).filter(Boolean))) as string[],
    [rows],
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

  const tabs = (
    <Tabs<Surface | "guides">
      tabs={[
        ...SURFACES.map((s) => ({ id: s.id, label: s.label, count: all.filter((r) => r.surface === s.id).length })),
        { id: "guides" as const, label: "Quick Guides" },
      ]}
      active={guides ? "guides" : surface}
      onChange={(id) => {
        setGuides(id === "guides");
        if (id !== "guides") setSurface(id);
      }}
    />
  );

  if (guides) {
    return (
      <Page>
        <PageHeader title="FAQs" subtitle={SUBTITLE} />
        {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "faqs")} />}
        {tabs}
        <HelpGuides writable={writable} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="FAQs" subtitle={SUBTITLE} />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "faqs")} />}

      {tabs}

      <Note className="mb-4">
        Shown on {meta.where}. Changes reach the live page within about a minute of saving, with no deploy.{" "}
        <span className="font-medium text-ink">Deactivate</span> hides a question and keeps it here;{" "}
        <span className="font-medium text-ink">Delete</span> removes it for good. Order with the arrows. Add the
        Hindi and Gujarati in <span className="font-medium text-ink">Edit</span>; changing the English clears them.
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
                placeholder={surface === "seller_help" ? "KYC and verification" : "Getting Started"}
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
              {g.rows.map((r) => {
                // Step past rows of the other visibility: swapping a live row with a
                // hidden one would change nothing on the live page.
                const peers = g.rows.filter((x) => x.active === r.active);
                const j = peers.indexOf(r);
                const prev = peers[j - 1];
                const next = peers[j + 1];
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
                      <div className="flex flex-wrap items-center gap-1">
                        {r.active ? <Badge tone="positive" dot>active</Badge> : <Badge dot>inactive</Badge>}
                        {LANGS.map((l) =>
                          r.translations[l.id] ? (
                            <Badge key={l.id} tone="info">{l.id}</Badge>
                          ) : null,
                        )}
                      </div>
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
                            setEditDraft({
                              category: r.category_label ?? "",
                              question: r.question,
                              answer: r.answer,
                              hi: { question: r.translations.hi?.question ?? "", answer: r.translations.hi?.answer ?? "" },
                              gu: { question: r.translations.gu?.question ?? "", answer: r.translations.gu?.answer ?? "" },
                            });
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
          {editing &&
            (editDraft.question.trim() !== editing.question || editDraft.answer.trim() !== editing.answer) &&
            (editing.translations.hi || editing.translations.gu) && (
              <Note>
                You changed the English. Check that the Hindi and Gujarati below still say the same thing, or clear
                them: the app then falls back to its own translation, or to English.
              </Note>
            )}
          {LANGS.map((l) => (
            <div key={l.id} className="space-y-2 rounded-lg border border-line p-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">{l.label}</p>
              <Field label={`Question in ${l.label}`} htmlFor={`edit-faq-${l.id}-q`}>
                <Input
                  id={`edit-faq-${l.id}-q`}
                  lang={l.id}
                  value={editDraft[l.id].question}
                  onChange={(e) => setEditDraft({ ...editDraft, [l.id]: { ...editDraft[l.id], question: e.target.value } })}
                />
              </Field>
              <Field label={`Answer in ${l.label}`} htmlFor={`edit-faq-${l.id}-a`}>
                <Textarea
                  id={`edit-faq-${l.id}-a`}
                  lang={l.id}
                  rows={3}
                  value={editDraft[l.id].answer}
                  onChange={(e) => setEditDraft({ ...editDraft, [l.id]: { ...editDraft[l.id], answer: e.target.value } })}
                />
              </Field>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!editDraft.question.trim() || !editDraft.answer.trim() || saveEdit.isPending}
            onClick={() => editing && saveEdit.mutate({ row: editing, d: editDraft })}
          >
            {saveEdit.isPending ? "Saving…" : "Save"}
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
