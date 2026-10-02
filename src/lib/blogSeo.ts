/**
 * Client-side mirror of how the blog derives an article's search title and
 * description (cosora-blogs: src/app/[slug]/page.tsx generateMetadata,
 * src/lib/blocks.tsx blocksToText, src/lib/format.ts summarise,
 * src/lib/markdown.ts stripMarkdown, and SITE_NAME from src/lib/site.ts).
 * inlineToText is mirrored separately in ./blogInline.ts, from
 * src/lib/inlineHtml.ts.
 *
 * The editor's SEO counters and preview are only useful if they measure what the
 * live page actually emits. They used to measure the raw seo_title field alone,
 * so every title read 21 characters short: the GSM article's 66-character
 * seo_title (since shortened) showed "66 of 60" for a <title> that rendered at
 * 87, because the blog appends " · The Cosora Journal" to every article title.
 *
 * Keep this file in step with all of those. If they drift, the counter lies, and
 * the only symptom is a truncated result in Google weeks later.
 */
import type { BlogBlock } from "@/lib/blogs";
import { inlineToText } from "@/lib/blogInline";

/** The blog's SITE_NAME (cosora-blogs src/lib/site.ts). */
export const SITE_NAME = "The Cosora Journal";

/** What generateMetadata appends to every article title. */
export const TITLE_SUFFIX = ` · ${SITE_NAME}`;

/** The suffix as a reader sees it in a hint, without the leading space. */
export const SUFFIX_LABEL = TITLE_SUFFIX.trim();

/** Roughly what Google shows before truncating. Advisory only. */
export const SEO_TITLE_MAX = 60;
export const SEO_DESC_MIN = 120;
export const SEO_DESC_MAX = 158;

/**
 * Characters as a reader and a search engine count them. String.length counts
 * UTF-16 units, so a single emoji would read as two.
 */
export function charCount(s: string): number {
  return [...s].length;
}

/** The article title before the suffix: seo_title when set, otherwise the title. */
export function effectiveTitle(seoTitle: string, title: string): string {
  return seoTitle.trim() || title.trim();
}

/** The full <title> tag the live page will carry, or "" when there is no title yet. */
export function renderedTitle(seoTitle: string, title: string): string {
  const t = effectiveTitle(seoTitle, title);
  return t ? `${t}${TITLE_SUFFIX}` : "";
}

/** Room left for the title itself once the suffix is spent. 39 today. */
export const TITLE_ROOM = SEO_TITLE_MAX - charCount(TITLE_SUFFIX);

/** Plain text of every block that carries prose, in the blog's order and rules. */
export function blocksToText(blocks: BlogBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        parts.push(b.text);
        break;
      case "rich_text":
        parts.push(inlineToText(b.html));
        break;
      case "list":
        parts.push(...(b.items ?? []).map(inlineToText));
        break;
      case "table":
        parts.push(...(b.rows ?? []).flat().map(inlineToText));
        break;
      case "faq":
        for (const it of b.items ?? []) parts.push(it.q, inlineToText(it.a));
        break;
      case "quote":
        parts.push(b.text);
        break;
      case "image":
        if (b.caption) parts.push(b.caption);
        break;
      default:
        break;
    }
  }
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** The blog's description fallback: 155 characters, cut on a word, with an ellipsis. */
export function summarise(text: string, max = 155): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max).replace(/\s+\S*$/, "")}\u2026`;
}

/**
 * The blog's last-resort description for posts written before the block editor:
 * the legacy Markdown body, stripped to text. Ported verbatim.
 */
export function stripMarkdown(md: string | null, max = 300): string {
  if (!md) return "";
  const text = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}\u2026`;
}

/**
 * cosora-blogs src/lib/metadata.ts clampDescription: trims to the last whole
 * word inside the limit, drops trailing punctuation, adds an ellipsis. Applied
 * to every listing and category description, including ones an editor wrote.
 */
export function clampDescription(text: string, max = SEO_DESC_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\u2014-]$/, "")}\u2026`;
}

/**
 * A category page's <title>. Unlike an article, a category's search title is
 * used exactly as written, with no site name appended; only the fallback, the
 * category name, gets the suffix. (cosora-blogs listingMetadata.)
 */
export function categoryRenderedTitle(seoTitle: string, name: string): string {
  return seoTitle.trim() || (name ? `${name}${TITLE_SUFFIX}` : "");
}

/** A category page's meta description, clamped exactly as the blog clamps it. */
export function categoryRenderedDescription(
  seoDescription: string,
  description: string,
  name: string,
): string {
  return clampDescription(
    seoDescription.trim() ||
      description.trim() ||
      `${name} stories from ${SITE_NAME}: sourcing, fabrics and manufacturing across India.`,
  );
}

/**
 * The meta description the live page will carry, through every fallback the
 * blog uses. `body` is the stored legacy Markdown, which the admin never edits
 * but the blog still reads when a post has no prose blocks.
 */
export function renderedDescription(
  seoDescription: string,
  excerpt: string,
  blocks: BlogBlock[],
  body: string | null = null,
): string {
  return (
    seoDescription.trim() ||
    excerpt.trim() ||
    summarise(blocksToText(blocks)) ||
    stripMarkdown(body, 160)
  );
}
