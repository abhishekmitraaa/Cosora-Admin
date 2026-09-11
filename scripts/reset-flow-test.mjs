/**
 * End-to-end proof that /reset-password consumes a link-style session and sets a
 * WORKING password — the piece Part 0 exists to deliver.
 *
 * A real invite/recovery link, once Supabase verifies it, redirects the browser
 * to /reset-password with the session in the URL hash
 * (#access_token=…&refresh_token=…&type=recovery). We reproduce that exact
 * landing state without needing email or the dashboard allow-list: sign a seeded
 * user in to get real tokens, build the implicit-flow hash the link would
 * produce, load it in a browser, set a NEW password, then prove the new password
 * logs in and the old one no longer does.
 *
 * The page cannot tell an injected-hash session from a real-link one — the
 * detectSessionInUrl mechanism is identical either way — so this genuinely
 * exercises the page's link-consumption path.
 *
 * Run with the preview server up on :4174.
 */
import { createClient } from "@supabase/supabase-js";
import { credential } from "./lib/test-credentials.mjs";
import { chromium } from "file:///c:/Users/Abhishek Mitra/OneDrive/Desktop/cosora lovable/textile-spark-net/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const BASE = "http://localhost:4174";
const EMAIL = "rlstest-reset@cosora.test";
const OLD = credential("FIXTURE_PASSWORD");
const NEW = "NewResetPass456!";

const out = [];
const check = (name, pass, detail = "") => out.push({ case: name, verdict: pass ? "PASS" : "*** FAIL ***", detail: String(detail).slice(0, 64) });

// ── 1. Obtain a real session, exactly as a verified link would produce ──────
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: OLD });
if (signErr) throw new Error(`seed sign-in failed: ${signErr.message}`);
const { access_token, refresh_token } = signIn.session;

// The implicit-flow hash a Supabase recovery/invite redirect carries.
const hash = new URLSearchParams({
  access_token,
  refresh_token,
  expires_in: "3600",
  token_type: "bearer",
  type: "recovery",
}).toString();
const landingUrl = `${BASE}/reset-password#${hash}`;

// ── 2. Drive the page as the invited person would ──────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(landingUrl, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

// The form must appear (link accepted), NOT the "invalid link" state.
const hasForm = (await page.$('input[type="password"]')) !== null;
const invalidShown = (await page.$('text=This link is\'t valid')) !== null;
check("link accepted -> set-password form shown", hasForm && !invalidShown, hasForm ? "form" : "no form");

const emailShown = (await page.textContent("body")).includes(EMAIL);
check("form addresses the invited email", emailShown, emailShown ? EMAIL : "email not shown");

// Set the new password.
const pwFields = await page.$$('input[type="password"]');
if (pwFields.length >= 2) {
  await pwFields[0].fill(NEW);
  await pwFields[1].fill(NEW);
  await page.click('button:has-text("Set password")');
  await page.waitForTimeout(3500);
}

// Should have left /reset-password and be inside the panel now.
const urlAfter = page.url();
const leftResetPage = !urlAfter.includes("/reset-password") && !urlAfter.includes("/login");
const navVisible = (await page.$("aside nav")) !== null;
check("after submit -> lands in the panel", leftResetPage && navVisible, urlAfter.replace(BASE, ""));
check("no JS errors on the page", errors.length === 0, errors[0] ?? "");

await page.screenshot({ path: "screenshots/reset-password-landed.png" });
await browser.close();

// ── 3. Prove the password actually changed ─────────────────────────────────
const c2 = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: newErr } = await c2.auth.signInWithPassword({ email: EMAIL, password: NEW });
check("NEW password logs in", !newErr, newErr?.message ?? "ok");
await c2.auth.signOut();

const c3 = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: oldErr } = await c3.auth.signInWithPassword({ email: EMAIL, password: OLD });
check("OLD password no longer works", Boolean(oldErr), oldErr ? "rejected" : "STILL WORKS");

console.table(out);
const failed = out.filter((r) => r.verdict !== "PASS").length;
console.log(failed === 0 ? "\nRESET-PASSWORD FLOW WORKS END TO END" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
