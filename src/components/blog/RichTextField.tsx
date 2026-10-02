import { useRef, useState } from "react";
import { Bold, Eraser, Italic, Link2, Minus, Plus, Underline } from "lucide-react";
import { Button, Field, Textarea } from "../ui";
import { previewInline } from "@/lib/blogInline";

/**
 * Formatting for article text: bold, italic, underline, link, and two font-size
 * steps.
 *
 * A textarea with a toolbar that wraps the current selection, not a
 * contenteditable surface. contenteditable would mean owning paste
 * sanitisation, an undo stack, IME composition on Android and selection
 * restoration across re-renders, which is where hand-rolled editors go wrong.
 * The stored format is HTML either way, so swapping in TipTap later is a UI
 * change with no data migration.
 *
 * Font size is two named steps rather than a picker: an arbitrary size would
 * let an author fake a heading with large text and cost the page the heading
 * hierarchy its SEO depends on. Headings are their own block type.
 */
export function RichTextField({
  label,
  hint,
  value,
  onChange,
  disabled,
  rows = 4,
  error,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  rows?: number;
  error?: string | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(true);

  /** Wraps the selection, or inserts the pair and puts the caret between them. */
  function wrap(open: string, close: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${open}${selected}${close}${value.slice(end)}`;
    onChange(next);
    // Restore a sensible selection after React re-renders the value.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + open.length;
      el.setSelectionRange(caret, caret + selected.length);
    });
  }

  function addLink() {
    const url = window.prompt("Link address");
    if (!url) return;
    const safe = /^(https?:\/\/|\/|mailto:)/i.test(url) ? url : `https://${url}`;
    wrap(`<a href="${safe.replace(/"/g, "&quot;")}">`, "</a>");
  }

  function clearFormatting() {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) return;
    const stripped = value.slice(start, end).replace(/<\/?[^>]+>/g, "");
    onChange(`${value.slice(0, start)}${stripped}${value.slice(end)}`);
  }

  const tools = [
    { label: "Bold", icon: Bold, run: () => wrap("<b>", "</b>") },
    { label: "Italic", icon: Italic, run: () => wrap("<i>", "</i>") },
    { label: "Underline", icon: Underline, run: () => wrap("<u>", "</u>") },
    { label: "Larger", icon: Plus, run: () => wrap('<span class="blog-lead">', "</span>") },
    { label: "Smaller", icon: Minus, run: () => wrap('<span class="blog-small">', "</span>") },
    { label: "Link", icon: Link2, run: addLink },
    { label: "Clear formatting", icon: Eraser, run: clearFormatting },
  ];

  return (
    <Field label={label} hint={hint} error={error}>
      <div className="flex flex-wrap items-center gap-1 pb-2">
        {tools.map((t) => (
          <Button
            key={t.label}
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={t.label}
            title={t.label}
            onClick={t.run}
          >
            <t.icon size={14} />
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? "Hide preview" : "Show preview"}
        </Button>
      </div>

      <Textarea
        ref={ref}
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          const key = e.key.toLowerCase();
          if (key === "b") { e.preventDefault(); wrap("<b>", "</b>"); }
          if (key === "i") { e.preventDefault(); wrap("<i>", "</i>"); }
          if (key === "u") { e.preventDefault(); wrap("<u>", "</u>"); }
        }}
      />

      {showPreview ? (
        <div className="mt-2 rounded-lg border border-line bg-surface px-3 py-2">
          <p className="mb-1 text-2xs uppercase tracking-wide text-ink-muted">Preview</p>
          <div
            className="text-sm leading-relaxed text-ink [&_.blog-lead]:text-base [&_.blog-small]:text-xs"
            // Preview only. The blog sanitises again on the server before any
            // reader sees this; previewInline mirrors that allowlist.
            dangerouslySetInnerHTML={{ __html: previewInline(value) }}
          />
        </div>
      ) : null}
    </Field>
  );
}
