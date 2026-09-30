import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Checkbox,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  Note,
  ROW_HOVER,
  Select,
  SkeletonList,
  Table,
  Tabs,
  Textarea,
} from "@/components/ui";
import { deleteHelpGuide, LANGUAGE_LABELS, saveHelpGuide, useHelpGuides, type HelpGuide, type Lang, type LangText } from "@/lib/support";

/**
 * Quick Guides: the step-by-step articles on the Help page (Help & Support P4d,
 * 2026-09-30). public.help_guides, read and written only through admin_help_guide_*,
 * which admit super_admin and support, the same audience as the FAQs.
 *
 * A guide has an English title and body at least; Hindi and Gujarati are optional
 * and the app falls back to English. "Checked against the app" records that someone
 * walked through the steps on the live app; the Help page shows only active guides.
 */

const AUDIENCE: { id: HelpGuide["audience"]; label: string }[] = [
  { id: "both", label: "Buyers and vendors" },
  { id: "buyer", label: "Buyers" },
  { id: "vendor", label: "Vendors" },
];

interface Draft {
  id: string | null;
  slug: string;
  audience: HelpGuide["audience"];
  title: LangText;
  body: LangText;
  position: number;
  active: boolean;
  verified: boolean;
}

const NEW_DRAFT: Draft = { id: null, slug: "", audience: "both", title: {}, body: {}, position: 0, active: false, verified: false };

function toDraft(g: HelpGuide): Draft {
  return {
    id: g.id,
    slug: g.slug,
    audience: g.audience,
    title: { ...g.title },
    body: { ...g.body },
    position: g.position,
    active: g.active,
    verified: Boolean(g.verified_at),
  };
}

export default function HelpGuides({ writable }: { writable: boolean }) {
  const qc = useQueryClient();
  const guides = useHelpGuides();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [deleting, setDeleting] = useState<HelpGuide | null>(null);

  const save = useMutation({
    mutationFn: (d: Draft) => saveHelpGuide(d),
    onSuccess: () => {
      toast.success("Guide saved");
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["help-guides"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteHelpGuide(id),
    onSuccess: () => {
      toast.success("Guide deleted");
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ["help-guides"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (guides.isPending) return <SkeletonList rows={1} height="h-48" />;
  if (guides.error) return <ErrorNote message={(guides.error as Error).message} />;
  const rows = guides.data;
  const canSave = draft && draft.slug.trim() && draft.title.en?.trim() && draft.body.en?.trim();

  return (
    <>
      <Note className="mb-4">
        Quick Guides are the step-by-step articles on the Help page. Each needs an English title and body; Hindi and
        Gujarati are optional, and the app shows English where a translation is missing. Only{" "}
        <span className="font-medium text-ink">active</span> guides are shown. Tick{" "}
        <span className="font-medium text-ink">Checked against the app</span> once someone has followed the steps on the
        live app.
      </Note>

      {writable && (
        <div className="mb-4 flex justify-end">
          <Button variant="primary" onClick={() => { setLang("en"); setDraft({ ...NEW_DRAFT, position: rows.length }); }}>
            New guide
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty>No guides yet. The Help page hides the Quick Guides section until one is active.</Empty>
      ) : (
        <Table head={["Guide", "For", "Languages", "State", "Updated", ""]}>
          {rows.map((g) => (
            <tr key={g.id} className={ROW_HOVER}>
              <td className="px-3 py-2.5">
                <div className="font-medium text-ink">{g.title.en}</div>
                <div className="font-mono text-2xs text-ink-faint">/help/guides/{g.slug}</div>
              </td>
              <td className="px-3 py-2.5 text-xs text-ink-muted">{AUDIENCE.find((a) => a.id === g.audience)?.label}</td>
              <td className="px-3 py-2.5 text-xs text-ink-muted">
                {(["en", "hi", "gu"] as Lang[]).filter((l) => g.title[l] && g.body[l]).map((l) => l.toUpperCase()).join(" · ")}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  <Badge tone={g.active ? "positive" : "neutral"} dot>{g.active ? "active" : "hidden"}</Badge>
                  {g.verified_at ? <Badge tone="info">checked</Badge> : <Badge tone="caution">not checked</Badge>}
                </div>
              </td>
              <td className="px-3 py-2.5 text-xs text-ink-muted">
                {format(new Date(g.updated_at), "d MMM yyyy")}
                {g.updated_by_name && <div className="text-2xs text-ink-faint">{g.updated_by_name}</div>}
              </td>
              <td className="px-3 py-2.5 text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" onClick={() => { setLang("en"); setDraft(toDraft(g)); }}>{writable ? "Edit" : "View"}</Button>
                  {writable && <Button size="sm" variant="ghost" onClick={() => setDeleting(g)}>Delete</Button>}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={draft !== null} title={draft?.id ? "Edit guide" : "New guide"} onClose={() => setDraft(null)} width="lg">
        {draft && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (writable && canSave) save.mutate(draft);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem_6rem]">
              <Field label="Address" htmlFor="guide-slug" hint="3 to 60 lowercase letters, digits or hyphens.">
                <Input
                  id="guide-slug"
                  value={draft.slug}
                  disabled={!writable}
                  placeholder="post-a-requirement"
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })}
                />
              </Field>
              <Field label="Shown to" htmlFor="guide-audience">
                <Select
                  id="guide-audience"
                  value={draft.audience}
                  disabled={!writable}
                  onChange={(e) => setDraft({ ...draft, audience: e.target.value as HelpGuide["audience"] })}
                >
                  {AUDIENCE.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </Select>
              </Field>
              <Field label="Order" htmlFor="guide-position">
                <Input
                  id="guide-position"
                  type="number"
                  min={0}
                  value={draft.position}
                  disabled={!writable}
                  onChange={(e) => setDraft({ ...draft, position: Number(e.target.value) || 0 })}
                />
              </Field>
            </div>

            <Tabs
              tabs={(["en", "hi", "gu"] as Lang[]).map((l) => ({ id: l, label: LANGUAGE_LABELS[l] + (l === "en" ? " (required)" : "") }))}
              active={lang}
              onChange={setLang}
              className="mb-2"
            />
            <Field label={`Title (${LANGUAGE_LABELS[lang]})`} htmlFor="guide-title">
              <Input
                id="guide-title"
                maxLength={120}
                value={draft.title[lang] ?? ""}
                disabled={!writable}
                onChange={(e) => setDraft({ ...draft, title: { ...draft.title, [lang]: e.target.value } })}
              />
            </Field>
            <Field label={`Steps (${LANGUAGE_LABELS[lang]})`} htmlFor="guide-body" hint="One step per line. Plain text; the app numbers the lines.">
              <Textarea
                id="guide-body"
                rows={10}
                maxLength={8000}
                value={draft.body[lang] ?? ""}
                disabled={!writable}
                onChange={(e) => setDraft({ ...draft, body: { ...draft.body, [lang]: e.target.value } })}
              />
            </Field>

            <div className="grid gap-2 sm:grid-cols-2">
              <Checkbox
                label="Active"
                hint="Shown on the Help page."
                checked={draft.active}
                disabled={!writable}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              <Checkbox
                label="Checked against the app"
                hint="Someone followed these steps on the live app."
                checked={draft.verified}
                disabled={!writable}
                onChange={(e) => setDraft({ ...draft, verified: e.target.checked })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" onClick={() => setDraft(null)}>{writable ? "Cancel" : "Close"}</Button>
              {writable && (
                <Button type="submit" variant="primary" disabled={!canSave || save.isPending}>
                  {save.isPending ? "Saving…" : "Save guide"}
                </Button>
              )}
            </div>
          </form>
        )}
      </Modal>

      <Modal open={deleting !== null} title="Delete this guide?" onClose={() => setDeleting(null)}>
        <p className="mb-4 text-sm text-ink-muted">
          “{deleting?.title.en}” is removed for good, in every language. To take it off the Help page but keep it, untick
          Active instead.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
            {remove.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
