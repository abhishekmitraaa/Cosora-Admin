/**
 * Browser smoke test: log in as two different roles and confirm the shell
 * renders the right nav, and that a read-only role sees the read-only banner
 * with its actions disabled.
 *
 * Uses the Playwright install from the sibling textile-spark-net repo.
 * Run with the preview server up on :4174.
 */
import { chromium } from "file:///c:/Users/Abhishek Mitra/OneDrive/Desktop/cosora lovable/textile-spark-net/node_modules/playwright/index.mjs";

const BASE = "http://localhost:4174";

async function loginAs(page, email) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "TestPass123!");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3500);
}

const browser = await chromium.launch();
const out = [];

for (const [label, email] of [
  ["super_admin", "rlstest-superadmin@cosora.test"],
  ["support", "rlstest-support@cosora.test"],
  ["product_moderator", "rlstest-productmod@cosora.test"],
]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await loginAs(page, email);

  const nav = await page.$$eval("aside nav a", (as) => as.map((a) => a.textContent.trim()));
  const url = page.url();

  // Visit Products and see what this role is offered.
  await page.goto(BASE + "/products", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const banner = await page.$$eval(".bg-amber-50", (els) => els.map((e) => e.textContent.trim()).slice(0, 1));
  const approve = await page.$$eval("button", (bs) =>
    bs.filter((b) => b.textContent.trim() === "Approve").map((b) => ({ disabled: b.disabled })),
  );

  await page.screenshot({ path: `../screenshots/${label}-products.png`, fullPage: false });

  out.push({
    role: label,
    landed_on: url.replace(BASE, ""),
    nav: nav.join(", "),
    read_only_banner: banner[0] ? banner[0].slice(0, 60) + "…" : "(none)",
    approve_buttons: approve.length,
    approve_disabled: approve.length ? approve.every((a) => a.disabled) : "n/a",
    js_errors: errors.length,
  });
  await page.close();
}

await browser.close();
console.table(out);
