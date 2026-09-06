/**
 * Source-level copy audit for the design system. No browser, no server.
 *
 *   node scripts/copy-audit.mjs
 *
 * Checks three things that are easy to reintroduce by hand and impossible to
 * spot by reading a diff:
 *
 *   1. NO EM-DASH OR EN-DASH IN USER-VISIBLE TEXT. Comments may use them freely
 *      (they carry the reasoning this repo is written around), so this strips
 *      every comment form first rather than matching line prefixes: a dash on
 *      the third line of a block comment is not a violation, and a naive
 *      line-prefix check calls it one.
 *
 *   2. NO RAW TAILWIND PALETTE COLOURS. `slate-600`, `amber-50`, `red-200` and
 *      friends are what made a dark mode impossible before this pass. Every
 *      colour goes through the token set in src/index.css.
 *
 *   3. NO ARBITRARY FONT SIZES. `text-[13px]` and `text-[1.55rem]` are how a
 *      type scale stops being one. Seven named steps, no others.
 *
 * Failures print with file, line and the offending text.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const SKIP = new Set(["database.types.ts"]);

/** Strip //, /* *\/ and {/* *\/} so a comment can say whatever it likes. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

const RULES = [
  {
    name: "em-dash or en-dash in user-visible text",
    re: /[—–]/g,
  },
  {
    name: "raw Tailwind palette colour (use a token from src/index.css)",
    re: /\b(?:bg|text|border|ring|fill|stroke|divide|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
  },
  {
    name: "arbitrary font size (use the named scale)",
    re: /\btext-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g,
  },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry) && !SKIP.has(entry)) out.push(p);
  }
  return out;
}

let failures = 0;

for (const file of walk(ROOT)) {
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);
  const lines = code.split("\n");

  for (const rule of RULES) {
    lines.forEach((line, i) => {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        failures += 1;
        console.log(`FAIL ${file}:${i + 1}  ${rule.name}`);
        console.log(`     ${raw.split("\n")[i].trim().slice(0, 120)}`);
      }
    });
  }
}

console.log(failures === 0 ? "\nPASS  copy audit clean" : `\nFAIL  ${failures} issue(s)`);
process.exit(failures === 0 ? 0 : 1);
