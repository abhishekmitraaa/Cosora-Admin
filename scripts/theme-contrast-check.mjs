/**
 * Design-system verification for the Phase-4 UI pass.
 *
 * Two things this checks that eyeballing a screenshot cannot:
 *
 *   1. EVERY token resolves in BOTH modes. A variable that exists in :root and
 *      was forgotten in the dark block does not throw - it silently inherits the
 *      light value, and you find out when a near-black accent disappears on a
 *      near-black ground. This walks the full token list in both modes and
 *      fails on any that did not change where it should have.
 *
 *   2. WCAG AA contrast, measured rather than claimed. Every text token is
 *      checked against every surface it is actually used on, in both modes,
 *      with the real computed values off the built stylesheet.
 *
 * It needs no login: it drives /login, which mounts the whole token set
 * (AuthLayout, Card, Input, Button) and is the one route outside RequireAdmin.
 *
 * Run with the preview server up:
 *   npm run build && npx vite preview --port 4174
 *   node scripts/theme-contrast-check.mjs
 *
 * Playwright comes from the sibling textile-spark-net checkout, the same way
 * scripts/smoke.mjs borrows it.
 */
import { chromium } from "file:///c:/Users/Abhishek Mitra/OneDrive/Desktop/cosora testing/cosora lovable/textile-spark-net/node_modules/playwright/index.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:4174";

/** Every token src/index.css defines, and whether dark mode must redefine it. */
const TOKENS = [
  ["canvas", true],
  ["surface", true],
  ["surface-2", true],
  ["line", true],
  ["line-strong", true],
  ["line-control", true],
  ["ink", true],
  ["ink-muted", true],
  ["ink-faint", true],
  ["ink-ghost", true],
  ["brand", true],
  ["brand-hover", true],
  ["brand-fg", true],
  ["brand-tint", true],
  ["danger", true],
  ["danger-hover", true],
  ["danger-fg", false], // deliberately the same off-white in both modes
  ["rail", true],
  ["rail-2", true],
  ["rail-line", true],
  ["rail-fg", true],
  ["rail-muted", true],
  ["tone-neutral-bg", true],
  ["tone-neutral-fg", true],
  ["tone-neutral-line", true],
  ["tone-neutral-dot", true],
  ["tone-positive-bg", true],
  ["tone-positive-fg", true],
  ["tone-positive-line", true],
  ["tone-positive-dot", true],
  ["tone-caution-bg", true],
  ["tone-caution-fg", true],
  ["tone-caution-line", true],
  ["tone-caution-dot", true],
  ["tone-critical-bg", true],
  ["tone-critical-fg", true],
  ["tone-critical-line", true],
  ["tone-critical-dot", true],
  ["tone-info-bg", true],
  ["tone-info-fg", true],
  ["tone-info-line", true],
  ["tone-info-dot", true],
  ["viz-series", true],
  ["viz-grid", true],
  ["viz-axis", true],
];

/**
 * Foreground/background pairs that actually occur in the app, with the minimum
 * ratio each must clear. 4.5 is AA for body text; 3.0 is AA for large text and
 * for non-text UI (borders, dots, focus rings).
 *
 * `ink-ghost` is deliberately absent from the 4.5 list: it is the one sub-AA
 * token and is used only for disabled controls and decorative fallbacks, never
 * for text carrying meaning.
 */
const PAIRS = [
  // Body text on the two grounds it sits on
  ["ink", "surface", 4.5, "body text on a card"],
  ["ink", "canvas", 4.5, "body text on the page ground"],
  ["ink", "surface-2", 4.5, "body text on an inset panel"],
  ["ink-muted", "surface", 4.5, "secondary text on a card"],
  ["ink-muted", "canvas", 4.5, "secondary text on the page ground"],
  ["ink-muted", "surface-2", 4.5, "secondary text on an inset panel"],
  ["ink-faint", "surface", 4.5, "labels and helper text on a card"],
  ["ink-faint", "canvas", 4.5, "labels and helper text on the page ground"],
  ["ink-faint", "surface-2", 4.5, "labels on an inset panel"],
  // Buttons
  ["brand-fg", "brand", 4.5, "primary button label"],
  ["danger-fg", "danger", 4.5, "destructive button label"],
  ["ink", "brand-tint", 4.5, "text on the accent tint"],
  // Status badges and notices
  ["tone-neutral-fg", "tone-neutral-bg", 4.5, "neutral badge text"],
  ["tone-positive-fg", "tone-positive-bg", 4.5, "positive badge text"],
  ["tone-caution-fg", "tone-caution-bg", 4.5, "caution badge text"],
  ["tone-critical-fg", "tone-critical-bg", 4.5, "critical badge text"],
  ["tone-info-fg", "tone-info-bg", 4.5, "info badge text"],
  // Navigation rail
  ["rail-fg", "rail", 4.5, "active nav item"],
  ["rail-muted", "rail", 4.5, "inactive nav item"],
  // Non-text UI, 3:1
  ["line-control", "surface", 3.0, "input and outline-button borders"],
  ["line-control", "surface-2", 3.0, "input borders on an inset panel"],
  ["tone-positive-dot", "surface", 3.0, "positive status dot"],
  ["tone-caution-dot", "surface", 3.0, "caution status dot"],
  ["tone-critical-dot", "surface", 3.0, "critical status dot"],
  ["tone-info-dot", "surface", 3.0, "info status dot"],
];

const srgb = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function luminance(triplet) {
  const [r, g, b] = triplet.trim().split(/\s+/).map(Number);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

async function readTokens(page, mode) {
  await page.evaluate((m) => {
    document.documentElement.setAttribute("data-theme", m);
  }, mode);
  // One frame, so the attribute change is applied before the values are read.
  await page.waitForTimeout(60);
  return page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const n of names) out[n] = cs.getPropertyValue(`--${n}`).trim();
    return out;
  }, TOKENS.map(([n]) => n));
}

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`  FAIL  ${msg}`);
};
const pass = (msg) => console.log(`  ok    ${msg}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

console.log("\n1. Token completeness");
const light = await readTokens(page, "light");
const dark = await readTokens(page, "dark");

for (const [name, mustDiffer] of TOKENS) {
  if (!light[name]) fail(`--${name} is not defined in light mode`);
  else if (!dark[name]) fail(`--${name} is not defined in dark mode`);
  else if (mustDiffer && light[name] === dark[name]) {
    fail(`--${name} is identical in both modes (${light[name]}); the dark block is missing it`);
  } else pass(`--${name}`);
}

console.log("\n2. WCAG contrast, light mode");
for (const [fg, bg, min, what] of PAIRS) {
  const r = ratio(light[fg], light[bg]);
  const line = `${what}: ${fg} on ${bg} = ${r.toFixed(2)}:1 (needs ${min})`;
  r >= min ? pass(line) : fail(line);
}

console.log("\n3. WCAG contrast, dark mode");
for (const [fg, bg, min, what] of PAIRS) {
  const r = ratio(dark[fg], dark[bg]);
  const line = `${what}: ${fg} on ${bg} = ${r.toFixed(2)}:1 (needs ${min})`;
  r >= min ? pass(line) : fail(line);
}

console.log("\n4. No pure black or pure white in the ground and text tokens");
for (const [mode, set] of [["light", light], ["dark", dark]]) {
  for (const n of ["canvas", "surface", "surface-2", "ink", "brand", "brand-fg"]) {
    const v = set[n];
    if (v === "0 0 0" || v === "255 255 255") fail(`${mode} --${n} is a pure value (${v})`);
    else pass(`${mode} --${n} = ${v}`);
  }
}

console.log("\n5. The page renders in both modes");
for (const mode of ["light", "dark"]) {
  await page.evaluate((m) => document.documentElement.setAttribute("data-theme", m), mode);
  await page.waitForTimeout(120);
  const shot = `screenshots/login-${mode}.png`;
  await page.screenshot({ path: shot });
  const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  pass(`${mode}: body background ${body}, screenshot at ${shot}`);
}

console.log("\n6. Console");
if (consoleErrors.length === 0) pass("no console or page errors");
else for (const e of consoleErrors) fail(`console: ${e.slice(0, 160)}`);

await browser.close();

console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
