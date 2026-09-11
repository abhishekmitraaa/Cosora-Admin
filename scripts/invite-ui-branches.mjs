/**
 * Browser check of the three invite confirmations on the real Admins screen:
 *   - branch 3 (existing + password)   -> BLUE "already had a password" panel
 *   - branch 2 while rate-limited      -> AMBER "email did NOT send" warning
 *   - support                          -> no invite form at all
 *
 * Email is rate-limited by the time this runs, so the OTP-user invite exercises
 * the warning path — which is exactly the state worth seeing rendered.
 * Run with the preview up on :4174.
 */
import { chromium } from "file:///c:/Users/Abhishek Mitra/OneDrive/Desktop/cosora lovable/textile-spark-net/node_modules/playwright/index.mjs";
import { credential } from "./lib/test-credentials.mjs";

const BASE = "http://localhost:4174";
const HASPW = "rlstest-haspw@cosora.test";
const OTP = "abhishekmitra.work1+cosora-otp@gmail.com";

async function loginAs(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', credential("FIXTURE_PASSWORD"));
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3500);
}

async function invite(page, email) {
  await page.waitForSelector('input[placeholder="person@company.com"]', { timeout: 15000 });
  await page.fill('input[placeholder="person@company.com"]', email);
  await page.click('button:has-text("Invite")');
  await page.waitForTimeout(7000);
  for (const [tone, sel] of [["green", ".border-green-200"], ["blue", ".border-blue-200"], ["amber", ".border-amber-300"]]) {
    const el = await page.$(sel);
    if (el) return { tone, text: (await el.textContent()).replace(/\s+/g, " ").trim().slice(0, 90) };
  }
  const toast = await page.$$eval("[data-sonner-toast]", (e) => e.map((x) => x.textContent).slice(0, 1));
  return { tone: "toast/none", text: (toast[0] ?? "(nothing shown)").slice(0, 90) };
}

const browser = await chromium.launch();
const out = [];

const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await loginAs(page, "rlstest-superadmin@cosora.test");
await page.goto(`${BASE}/admins`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

out.push({ case: "super_admin sees form", tone: (await page.$('input[placeholder="person@company.com"]')) ? "yes" : "NO-FAIL", text: "" });

const b3 = await invite(page, HASPW);
out.push({ case: "branch3 existing+password", tone: b3.tone, text: b3.text });
await page.screenshot({ path: "screenshots/invite-branch3-promoted.png" });

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const b2 = await invite(page, OTP);
out.push({ case: "branch2 OTP (rate-limited now)", tone: b2.tone, text: b2.text });
await page.screenshot({ path: "screenshots/invite-branch2-warning.png" });

out.push({ case: "js errors", tone: String(errors.length), text: errors[0] ?? "" });
await page.close();

const p2 = await browser.newPage();
await loginAs(p2, "rlstest-support@cosora.test");
await p2.goto(`${BASE}/admins`, { waitUntil: "networkidle" });
await p2.waitForTimeout(1500);
out.push({ case: "support sees form", tone: (await p2.$('input[placeholder="person@company.com"]')) ? "YES-FAIL" : "no (blocked)", text: "" });
await p2.close();

await browser.close();
console.table(out);
