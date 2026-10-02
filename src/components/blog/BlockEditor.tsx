import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, SectionTitle } from "../ui";
import { RichTextField } from "./RichTextField";
import { BlogImageField } from "./BlogImageField";
import type { BlogBlock } from "@/lib/blogs";

/**
 * Builds an article out of ordered blocks.
 *
 * Array order is the render order, so moving a block is a swap and there is no
 * position field to keep in step. Blocks are validated again in the database by
 * public.blog_blocks_valid, which is what actually guarantees, for example, that
 * every image carries alt text.
 */

const BLOCK_LABELS: Record<BlogBlock["type"], string> = {
  heading: "Heading",
  rich_text: "Text",
  list: "List",
  image: "Image",
  table: "Table",
  faq: "FAQ",
  quote: "Quote",
  cta: "Call to action",
  divider: "Divider",
};

function emptyBlock(type: BlogBlock["type"]): BlogBlock {
  switch (type) {
    case "heading":
      return { type: "heading", level: 2, text: "" };
    case "rich_text":
      return { type: "rich_text", html: "" };
    case "list":
      return { type: "list", style: "bullet", items: [""] };
    case "image":
      return { type: "image", path: "", alt: "", caption: "" };
    case "table":
      return { type: "table", caption: "", columns: ["", ""], rows: [["", ""]] };
    case "faq":
      return { type: "faq", items: [{ q: "", a: "" }] };
    case "quote":
      return { type: "quote", text: "", attribution: "" };
    case "cta":
      return { type: "cta", heading: "", body: "", label: "Post RFQ", href: "/go/post-rfq" };
    default:
      return { type: "divider" };
  }
}

export function BlockEditor({
  blocks,
  onChange,
  disabled,
}: {
  blocks: BlogBlock[];
  onChange: (next: BlogBlock[]) => void;
  disabled?: boolean;
}) {
  const hasFaq = blocks.some((b) => b.type === "faq");

  const set = (i: number, next: BlogBlock) =>
    onChange(blocks.map((b, j) => (j === i ? next : b)));
  const remove = (i: number) => onChange(blocks.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...blocks];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };
  const add = (type: BlogBlock["type"]) => onChange([...blocks, emptyBlock(type)]);

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-2xs uppercase tracking-wide text-ink-muted">
              {BLOCK_LABELS[block.type]}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Move up"
                disabled={disabled || i === 0}
                onClick={() => move(i, -1)}
              >
                <ChevronUp size={14} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Move down"
                disabled={disabled || i === blocks.length - 1}
                onClick={() => move(i, 1)}
              >
                <ChevronDown size={14} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove block"
                disabled={disabled}
                onClick={() => remove(i)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>

          <BlockBody block={block} disabled={disabled} onChange={(b) => set(i, b)} />
        </div>
      ))}

      <div className="flex flex-wrap gap-1 rounded-xl border border-dashed border-line p-3">
        <span className="mr-1 self-center text-2xs uppercase tracking-wide text-ink-muted">
          Add
        </span>
        {(Object.keys(BLOCK_LABELS) as BlogBlock["type"][]).map((t) => (
          <Button
            key={t}
            type="button"
            variant="outline"
            size="sm"
            // One FAQ block per article: two FAQPage entities on one URL is a
            // structured data error, and the database rejects it anyway.
            disabled={disabled || (t === "faq" && hasFaq)}
            title={t === "faq" && hasFaq ? "An article can have one FAQ block" : undefined}
            onClick={() => add(t)}
          >
            {BLOCK_LABELS[t]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function BlockBody({
  block,
  onChange,
  disabled,
}: {
  block: BlogBlock;
  onChange: (b: BlogBlock) => void;
  disabled?: boolean;
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <Field label="Level">
            <Select
              value={String(block.level)}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...block, level: Number(e.target.value) === 3 ? 3 : 2 })
              }
            >
              <option value="2">Heading 2</option>
              <option value="3">Heading 3</option>
            </Select>
          </Field>
          {/* Plain text on purpose: the heading is also the table of contents
              label and the anchor id, so it must not carry formatting. */}
          <Field label="Text">
            <Input
              value={block.text}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          </Field>
        </div>
      );

    case "rich_text":
      return (
        <RichTextField
          label="Text"
          value={block.html}
          disabled={disabled}
          rows={5}
          onChange={(html) => onChange({ ...block, html })}
        />
      );

    case "list":
      return (
        <div className="flex flex-col gap-3">
          <Field label="Style">
            <Select
              value={block.style}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...block, style: e.target.value === "number" ? "number" : "bullet" })
              }
            >
              <option value="bullet">Bulleted</option>
              <option value="number">Numbered</option>
            </Select>
          </Field>
          {block.items.map((item, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <RichTextField
                  label={`Item ${i + 1}`}
                  value={item}
                  disabled={disabled}
                  rows={2}
                  onChange={(v) =>
                    onChange({ ...block, items: block.items.map((x, j) => (j === i ? v : x)) })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove item"
                disabled={disabled || block.items.length === 1}
                onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={disabled}
            onClick={() => onChange({ ...block, items: [...block.items, ""] })}
          >
            Add item
          </Button>
        </div>
      );

    case "image":
      return (
        <div className="flex flex-col gap-3">
          <BlogImageField
            label="Image"
            path={block.path}
            disabled={disabled}
            onChange={(path) => onChange({ ...block, path: path ?? "" })}
          />
          <Field
            label="Alt text"
            hint="Describes the image for screen readers and search engines. Required."
          >
            <Input
              value={block.alt}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, alt: e.target.value })}
            />
          </Field>
          <Field label="Caption" hint="Optional, shown under the image.">
            <Input
              value={block.caption ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, caption: e.target.value })}
            />
          </Field>
        </div>
      );

    case "table":
      return <TableBlock block={block} onChange={onChange} disabled={disabled} />;

    case "faq":
      return (
        <div className="flex flex-col gap-3">
          <SectionTitle>Questions</SectionTitle>
          {block.items.map((it, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <Field label={`Question ${i + 1}`}>
                <Input
                  value={it.q}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      items: block.items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)),
                    })
                  }
                />
              </Field>
              <RichTextField
                label="Answer"
                value={it.a}
                disabled={disabled}
                rows={3}
                onChange={(a) =>
                  onChange({
                    ...block,
                    items: block.items.map((x, j) => (j === i ? { ...x, a } : x)),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || block.items.length === 1}
                onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
              >
                Remove question
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={disabled}
            onClick={() => onChange({ ...block, items: [...block.items, { q: "", a: "" }] })}
          >
            Add question
          </Button>
        </div>
      );

    case "quote":
      return (
        <div className="flex flex-col gap-3">
          <Field label="Quote">
            <Input
              value={block.text}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          </Field>
          <Field label="Attribution" hint="Optional.">
            <Input
              value={block.attribution ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, attribution: e.target.value })}
            />
          </Field>
        </div>
      );

    case "cta":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Heading">
            <Input
              value={block.heading ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, heading: e.target.value })}
            />
          </Field>
          <Field label="Body">
            <Input
              value={block.body ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, body: e.target.value })}
            />
          </Field>
          <Field label="Button label">
            <Input
              value={block.label}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
            />
          </Field>
          <Field label="Button link" hint="A path on cosora.in, such as /go/post-rfq.">
            <Input
              value={block.href}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, href: e.target.value })}
            />
          </Field>
        </div>
      );

    default:
      return <p className="text-sm text-ink-muted">A horizontal rule between sections.</p>;
  }
}

function TableBlock({
  block,
  onChange,
  disabled,
}: {
  block: Extract<BlogBlock, { type: "table" }>;
  onChange: (b: BlogBlock) => void;
  disabled?: boolean;
}) {
  const setCell = (r: number, c: number, v: string) =>
    onChange({
      ...block,
      rows: block.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)),
    });

  const addColumn = () =>
    onChange({
      ...block,
      columns: [...block.columns, ""],
      rows: block.rows.map((r) => [...r, ""]),
    });

  const removeColumn = (c: number) =>
    onChange({
      ...block,
      columns: block.columns.filter((_, j) => j !== c),
      rows: block.rows.map((r) => r.filter((_, j) => j !== c)),
    });

  return (
    <div className="flex flex-col gap-3">
      <Field label="Caption" hint="Optional. Describes what the table shows.">
        <Input
          value={block.caption ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...block, caption: e.target.value })}
        />
      </Field>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {block.columns.map((col, c) => (
                <th key={c} className="p-1 text-left align-bottom">
                  <Input
                    value={col}
                    disabled={disabled}
                    aria-label={`Column ${c + 1} heading`}
                    onChange={(e) =>
                      onChange({
                        ...block,
                        columns: block.columns.map((x, j) => (j === c ? e.target.value : x)),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1"
                    aria-label={`Remove column ${c + 1}`}
                    disabled={disabled || block.columns.length === 1}
                    onClick={() => removeColumn(c)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="p-1">
                    <Input
                      value={cell}
                      disabled={disabled}
                      aria-label={`Row ${r + 1} column ${c + 1}`}
                      onChange={(e) => setCell(r, c, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={addColumn}>
          Add column
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() =>
            onChange({ ...block, rows: [...block.rows, block.columns.map(() => "")] })
          }
        >
          Add row
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || block.rows.length === 1}
          onClick={() => onChange({ ...block, rows: block.rows.slice(0, -1) })}
        >
          Remove last row
        </Button>
      </div>
    </div>
  );
}
