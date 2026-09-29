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

/**
 * Escapes text for the preview while leaving well-formed entity references
 * alone. Escaping every "&" turned an author's &plusmn; into &amp;plusmn;, so
 * the preview showed the code instead of the ±, where the live page (which
 * parses the HTML) shows the character. An entity can only ever decode to text,
 * never to markup, so passing it through is safe.
 */
function escapeText(s: string): string {
  return s
    .replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

const NON_PROSE = new Set(["script", "style", "template"]);

/**
 * Plain text, for word counts and the SEO description fallback.
 *
 * Mirrors cosora-blogs src/lib/inlineHtml.ts inlineToText, which parses with
 * parse5 in a <template> fragment context. A <template> element parses its
 * content in that same context, so every entity decodes the way it does on the
 * live page (&plusmn; is ±) and the SEO counters count exactly what ships.
 *
 * innerHTML on a <template> is safe here: its content is parsed into an inert
 * document fragment, so no script runs, no image loads and no handler fires,
 * and the fragment is never inserted into the page. Only text nodes are read.
 */
export function inlineToText(html: string | null | undefined): string {
  if (!html) return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  let out = "";
  const walk = (nodes: NodeListOf<ChildNode>) => {
    nodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue ?? "";
      else if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as Element).localName;
        if (tag === "br") out += " ";
        else if (!NON_PROSE.has(tag)) walk(n.childNodes);
      }
    });
  };
  walk(tpl.content.childNodes);
  return out.replace(/\s+/g, " ").trim();
}
