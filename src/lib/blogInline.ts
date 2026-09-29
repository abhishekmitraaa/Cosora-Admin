/**
 * Client-side mirror of the inline allowlist the blog enforces on render
 * (cosora-blogs/src/lib/inlineHtml.ts).
 *
 * This is for the editor preview only. It is NOT the security boundary: the
 * blog sanitises again on the server before anything reaches a reader. Keeping a
 * mirror here means the author sees roughly what will ship instead of finding
 * out after publishing that a pasted tag was dropped.
 *
 * Keep the two lists in step. If they drift, the preview is optimistic and the
 * live page is correct, which is the safe direction.
 */

const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "a", "br", "sup", "sub", "span"];
const ALLOWED_SPAN_CLASSES = ["blog-lead", "blog-small"];

/** The two font-size steps. Named, so the type scale stays a scale. */
export const SIZE_CLASSES = ALLOWED_SPAN_CLASSES;

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Strips everything outside the allowlist and returns display-safe HTML.
 * Deliberately conservative: anything unrecognised becomes visible text rather
 * than markup, so a mistake shows up in the preview instead of hiding.
 */
export function previewInline(html: string): string {
  if (!html) return "";
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*)?)\/?>/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(html))) {
    out += escapeText(html.slice(last, m.index));
    last = m.index + m[0].length;

    const raw = m[0];
    const tag = m[1].toLowerCase();
    const attrs = m[2] ?? "";
    const closing = raw.startsWith("</");

    if (!ALLOWED_TAGS.includes(tag)) {
      out += escapeText(raw);
      continue;
    }
    if (closing) {
      out += `</${tag}>`;
      continue;
    }
    if (tag === "br") {
      out += "<br>";
      continue;
    }
    if (tag === "a") {
      const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
      out += /^(https?:|mailto:|\/)/i.test(href)
        ? `<a href="${escapeText(href)}">`
        : "<a>";
      continue;
    }
    if (tag === "span") {
      const cls = /class\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
      const keep = cls
        .split(/\s+/)
        .filter((c) => ALLOWED_SPAN_CLASSES.includes(c))
        .join(" ");
      out += keep ? `<span class="${keep}">` : "<span>";
      continue;
    }
    out += `<${tag}>`;
  }

  out += escapeText(html.slice(last));
  return out;
}

/** Plain text, for word counts and the SEO description fallback. */
export function inlineToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
