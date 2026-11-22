import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  CHOICE_KINDS, NEW_KINDS, fetchAttributes, parseOptions, saveAttribute, setAttributeActive,
  type AttributeForm, type AttributeRow,
} from "@/lib/attributes";
import {
  Badge, Button, Card, Checkbox, Empty, ErrorNote, Field, Input, Modal, Note, Page, PageHeader, ReadOnlyBanner,
  ROW_HOVER, Select, SkeletonList, Table, Tabs, Textarea,
} from "@/components/ui";
import { useUrlState } from "@/hooks/useUrlState";

/**
 * Form questions (Ranking F3, 2026-10-31): the category questions sellers answer on a listing and buyers on a
 * requirement, which the buyer app reads from public.attribute_definitions. Super admins relabel them (with
 * Hindi and Gujarati), change options, add questions and turn them off; managers read. A question's key and
 * kind never change once it exists, so the answers already stored keep their meaning. Requirement questions
 * name the listing question they mean ("match"), which ranking reads to compare a requirement with sellers.
 */

const SUBTITLE =
  "The questions sellers answer on a listing and buyers on a requirement. Changes show in the app within minutes.";
const BASE = "__base";
const COMMON = "__common";

const pretty = (id: string) => id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

interface Draft {
  key: string; label: string; label_hi: string; label_gu: string; kind: string; options: string;
  unit: string; placeholder: string; required: boolean; match_key: string; match_weight: string; section: string;
}
const EMPTY: Draft = {
  key: "", label: "", label_hi: "", label_gu: "", kind: "text", options: "", unit: "", placeholder: "",
  required: false, match_key: "", match_weight: "0", section: "",
};
const draftOf = (r: AttributeRow): Draft => ({
  key: r.key, label: r.label, label_hi: r.label_hi ?? "", label_gu: r.label_gu ?? "", kind: r.kind,
  options: (r.options ?? []).join("\n"), unit: r.unit ?? "", placeholder: r.placeholder ?? "", required: r.required,
  match_key: r.match_key ?? "", match_weight: String(r.match_weight ?? 0), section: String(r.section_position ?? 0),
});

export default function Attributes() {
  const role = useRole();
  const writable = canWrite(role, "attributes");
  const qc = useQueryClient();
  const [form, setForm] = useState<AttributeForm>("product");
  const [category, setCategory] = useUrlState<string>("category", "apparel-home");
  const [sub, setSub] = useState(COMMON);
  const [schema, setSchema] = useState("womens");
  const [search, setSearch] = useUrlState<string>("q", "");
  const [editing, setEditing] = useState<AttributeRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const rows = useQuery({ queryKey: ["attribute-definitions"], queryFn: fetchAttributes });
  const all = useMemo(() => rows.data ?? [], [rows.data]);

  const categories = useMemo(() => [...new Set(all.filter((r) => r.form === "product" && r.category_id).map((r) => r.category_id!))].sort(), [all]);
  const subs = useMemo(() => [...new Set(all.filter((r) => r.form === "product" && r.category_id === category && r.subcategory_id).map((r) => r.subcategory_id!))].sort(), [all, category]);
  const schemas = useMemo(() => [...new Set(all.filter((r) => r.form === "requirement").map((r) => r.schema_key!))].sort(), [all]);
  const sections = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of all) if (r.form === "requirement" && r.schema_key === schema) m.set(r.section_position ?? 0, r.section_title ?? "");
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [all, schema]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((r) => r.form === form)
      .filter((r) => form === "requirement"
        ? r.schema_key === schema
        : category === BASE ? r.layer === "base"
        : r.category_id === category && (sub === COMMON ? r.layer === "common" : r.subcategory_id === sub))
      .filter((r) => !q || r.label.toLowerCase().includes(q) || r.key.toLowerCase().includes(q))
      .sort((a, b) => (a.section_position ?? 0) - (b.section_position ?? 0) || (a.seller_type ?? "").localeCompare(b.seller_type ?? "")
        || a.position - b.position || a.key.localeCompare(b.key));
  }, [all, form, schema, category, sub, search]);

  const done = (message: string) => {
    toast.success(message);
    setEditing(null);
    setAdding(false);
    void qc.invalidateQueries({ queryKey: ["attribute-definitions"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const common = {
        label: draft.label, label_hi: draft.label_hi, label_gu: draft.label_gu,
        options: CHOICE_KINDS.has(adding ? draft.kind : editing?.kind ?? "") ? parseOptions(draft.options) : undefined,
        unit: draft.unit, placeholder: draft.placeholder, required: draft.required,
        ...(form === "requirement" ? { match_key: draft.match_key, match_weight: Number(draft.match_weight) || 0 } : {}),
      };
      if (editing) return saveAttribute(editing.id, common);
      const place = form === "requirement"
        ? { schema_key: schema, section_position: Number(draft.section), section_title: sections.find(([p]) => p === Number(draft.section))?.[1] }
        : category === BASE ? { layer: "base", seller_type: "product" }
        : sub === COMMON ? { layer: "common", category_id: category }
        : { layer: "sub", category_id: category, subcategory_id: sub };
      return saveAttribute(null, { form, key: draft.key.trim(), kind: draft.kind, ...common, ...place });
    },
    onSuccess: () => done(editing ? "Question saved" : "Question added"),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (r: AttributeRow) => setAttributeActive(r.id, !r.active),
    onSuccess: (_d, r) => {
      toast.success(r.active ? "Question turned off" : "Question turned on");
      void qc.invalidateQueries({ queryKey: ["attribute-definitions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (r: AttributeRow) => { setDraft(draftOf(r)); setAdding(false); setEditing(r); };
  const openAdd = () => {
    setDraft({ ...EMPTY, kind: NEW_KINDS[form][0].id, section: String(sections[0]?.[0] ?? 0) });
    setEditing(null);
    setAdding(true);
  };
  const kind = adding ? draft.kind : editing?.kind ?? "";

  return (
    <Page width="wide">
      <PageHeader title="Form questions" subtitle={SUBTITLE}
        actions={writable && <Button variant="primary" onClick={openAdd}>Add a question</Button>} />
      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "attributes")} />}
      <Tabs<AttributeForm>
        tabs={[{ id: "product", label: "Listing form" }, { id: "requirement", label: "Requirement form" }]}
        active={form}
        onChange={setForm}
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {form === "product" ? (
            <>
              <Field label="Category" htmlFor="attr-category">
                <Select id="attr-category" value={category} onChange={(e) => { setCategory(e.target.value); setSub(COMMON); }}>
                  <option value={BASE}>Every listing (by seller type)</option>
                  {categories.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}
                </Select>
              </Field>
              {category !== BASE && (
                <Field label="Subcategory" htmlFor="attr-sub">
                  <Select id="attr-sub" value={sub} onChange={(e) => setSub(e.target.value)}>
                    <option value={COMMON}>Whole category (asked when a subcategory doesn't ask it)</option>
                    {subs.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
                  </Select>
                </Field>
              )}
            </>
          ) : (
            <Field label="Question set" htmlFor="attr-schema">
              <Select id="attr-schema" value={schema} onChange={(e) => setSchema(e.target.value)}>
                {schemas.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Search" htmlFor="attr-search">
            <Input id="attr-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Label or key" />
          </Field>
        </div>
      </Card>

      {rows.isPending ? (
        <SkeletonList rows={4} height="h-10" />
      ) : rows.error ? (
        <ErrorNote message={(rows.error as Error).message} />
      ) : shown.length === 0 ? (
        <Empty>No questions here.</Empty>
      ) : (
        <Table head={form === "requirement" ? ["Section", "Question", "Kind", "Matches", "State", ""] : ["Question", "Kind", "Options", "State", ""]}>
          {shown.map((r) => (
            <tr key={r.id} className={ROW_HOVER}>
              {form === "requirement" && <td className="px-3 py-2 text-xs text-ink-faint">{r.section_title}</td>}
              <td className="px-3 py-2">
                <p className="text-sm text-ink">{r.label || <span className="text-ink-faint">(no label)</span>}</p>
                <p className="font-mono text-2xs text-ink-faint">
                  {r.key}{r.seller_type ? ` · ${r.seller_type}` : ""}{r.core ? " · core" : ""}
                </p>
              </td>
              <td className="px-3 py-2 text-xs text-ink-muted">{r.kind}</td>
              {form === "requirement" ? (
                <td className="px-3 py-2 text-xs text-ink-muted">{r.match_key ? `${r.match_key} (×${r.match_weight})` : "—"}</td>
              ) : (
                <td className="px-3 py-2 text-xs text-ink-muted">{r.options?.length ? `${r.options.length} options` : "—"}</td>
              )}
              <td className="px-3 py-2">{r.active ? <Badge tone="positive">On</Badge> : <Badge>Off</Badge>}</td>
              <td className="px-3 py-2 text-right">
                {writable && (
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" onClick={() => openEdit(r)}>Edit</Button>
                    {!r.core && (
                      <Button size="sm" variant={r.active ? "ghost" : "outline"} disabled={toggle.isPending} onClick={() => toggle.mutate(r)}>
                        {r.active ? "Turn off" : "Turn on"}
                      </Button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={editing !== null || adding} title={editing ? "Edit question" : "Add a question"} width="lg"
        onClose={() => { setEditing(null); setAdding(false); }}>
        <div className="space-y-3">
          {adding ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Key" htmlFor="attr-key" hint="Letters and digits, starting with a letter. It can't change later.">
                <Input id="attr-key" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
              </Field>
              <Field label="Kind" htmlFor="attr-kind">
                <Select id="attr-kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                  {NEW_KINDS[form].map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </Select>
              </Field>
              {form === "requirement" && (
                <Field label="Section" htmlFor="attr-section">
                  <Select id="attr-section" value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })}>
                    {sections.map(([p, t]) => <option key={p} value={p}>{t}</option>)}
                  </Select>
                </Field>
              )}
            </div>
          ) : (
            editing && <Note>Key <span className="font-mono">{editing.key}</span> · {editing.kind}. The key and kind stay as they are, so stored answers keep their meaning.</Note>
          )}
          <Field label="Label" htmlFor="attr-label">
            <Input id="attr-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label in Hindi" htmlFor="attr-label-hi" hint="Empty: the app's own translation, or English.">
              <Input id="attr-label-hi" lang="hi" value={draft.label_hi} onChange={(e) => setDraft({ ...draft, label_hi: e.target.value })} />
            </Field>
            <Field label="Label in Gujarati" htmlFor="attr-label-gu">
              <Input id="attr-label-gu" lang="gu" value={draft.label_gu} onChange={(e) => setDraft({ ...draft, label_gu: e.target.value })} />
            </Field>
          </div>
          {CHOICE_KINDS.has(kind) && (
            <Field label="Options (one per line)" htmlFor="attr-options">
              <Textarea id="attr-options" rows={6} value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Placeholder" htmlFor="attr-placeholder">
              <Input id="attr-placeholder" value={draft.placeholder} onChange={(e) => setDraft({ ...draft, placeholder: e.target.value })} />
            </Field>
            {form === "product" && (
              <Field label="Unit" htmlFor="attr-unit">
                <Input id="attr-unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
              </Field>
            )}
          </div>
          {form === "requirement" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Listing question it matches" htmlFor="attr-match" hint="The listing question's key, e.g. fabric. Empty: not compared.">
                <Input id="attr-match" value={draft.match_key} onChange={(e) => setDraft({ ...draft, match_key: e.target.value })} />
              </Field>
              <Field label="Match weight" htmlFor="attr-weight" hint="0 to 10. 0: not compared.">
                <Input id="attr-weight" inputMode="decimal" value={draft.match_weight} onChange={(e) => setDraft({ ...draft, match_weight: e.target.value })} />
              </Field>
            </div>
          )}
          <Checkbox label="Required" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setEditing(null); setAdding(false); }}>Cancel</Button>
            <Button variant="primary" disabled={save.isPending || !draft.label.trim() || (adding && !draft.key.trim())} onClick={() => save.mutate()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
