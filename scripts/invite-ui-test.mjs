/**
 * Drives the real Invite form in a browser as a super_admin, and checks that the
 * two outcomes render DIFFERENT confirmations — the whole point of the feature's
 * UX requirement. Also checks the form is absent for a non-super_admin.
 *
 * Run with the preview server up on :4174.
 */
import { chromium } from "file:///c:/Users/Abhishek Mitra/OneDrive/Desktop/cosora lovable/textile-spark-net/node_modules/playwright/index.mjs";
import { credential } from "./lib/test-credentials.mjs";

const BASE = "http://localhost:4174";
const NEW_EMAIL = process.argv[2] || `abhishekmitra.work1+cosora-ui-${Date.now()}@gmail.com`;

async function loginAs(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', credential("FIXTURE_PASSWORD"));
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3500);
}

async function submitInvite(page, email) {
  await page.fill('input[placeholder="person@company.com"]', email);
  await page.click('button:has-text("Invite")');
  // Wait for either the confirmation panel or an error toast.
  await page.waitForTimeout(6000);
  const panel = await page.$$eval(
    ".border-green-200, .border-blue-200",
    (els) => els.map((e) => e.textContent.trim().replace(/\s+/g, " ")).slice(0, 1),
  );
  const toast = await page.$$eval("[data-sonner-toast]", (els) =>
    els.map((e) => e.textContent.trim().replace(/\s+/g, " ")).slice(0, 1),
  );
  return { panel: panel[0] ?? null, toast: toast[0] ?? null };
}

const browser = await chromium.launch();
const out = [];

// ── super_admin: the form exists and both branches report correctly ─────────
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await loginAs(page, "rlstest-superadmin@cosora.test");
await page.goto(`${BASE}/admins`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const formPresent = (await page.$('input[placeholder="person@company.com"]')) !== null;
out.push({ case: "super_admin sees invite form", result: formPresent ? "yes" : "NO — FAIL" });

// Branch A: an email that already has an account -> "promoted" (blue, no email).
const promoted = await submitInvite(page, "demo-buyer@cosora.dev");
out.push({
  case: "existing email -> promoted msg",
  result: (promoted.panel ?? promoted.toast ?? "").slice(0, 78),
});
await page.screenshot({ path: "screenshots/invite-promoted.png" });

// Branch B: a brand-new email -> "invited" (green) OR a clearly surfaced
// send failure (e.g. the built-in mailer's rate limit). Both are acceptable
// outcomes for this check; a silent success is not.
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const invited = await submitInvite(page, NEW_EMAIL);
out.push({
  case: "new email -> invited or clear error",
  result: (invited.panel ?? invited.toast ?? "(nothing shown — FAIL)").slice(0, 78),
});
await page.screenshot({ path: "screenshots/invite-new.png" });
out.push({ case: "js errors", result: String(errors.length) });
await page.close();

// ── support: form must not be offered ──────────────────────────────────────
const p2 = await browser.newPage();
await loginAs(p2, "rlstest-support@cosora.test");
await p2.goto(`${BASE}/admins`, { waitUntil: "networkidle" });
await p2.waitForTimeout(2000);
const supportSeesForm = (await p2.$('input[placeholder="person@company.com"]')) !== null;
const bodyText = (await p2.textContent("body")).replace(/\s+/g, " ").slice(0, 70);
out.push({ case: "support sees invite form", result: supportSeesForm ? "YES — FAIL" : "no (blocked)" });
out.push({ case: "support /admins shows", result: bodyText });
await p2.close();

await browser.close();
console.table(out);
console.log(`\nNew email used: ${NEW_EMAIL}`);
