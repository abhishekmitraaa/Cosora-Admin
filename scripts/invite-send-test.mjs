/**
 * Exercises the INVITE branch of admin-invite — which sends a REAL email and
 * creates a REAL auth user. Kept separate from invite-tests.mjs so it is never
 * run by accident.
 *
 * Target defaults to a plus-addressed variant of the project owner's own inbox,
 * so the only person who can receive a test invite is the person running this.
 *
 * Usage: node scripts/invite-send-test.mjs [email]
 * Cleanup afterwards: scripts/invite-tests-cleanup.sql
 */
import { createClient } from "@supabase/supabase-js";
import { credential } from "./lib/test-credentials.mjs";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const TARGET = process.argv[2] || "abhishekmitra.work1+cosora-admin-invite@gmail.com";

const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { error: loginErr } = await db.auth.signInWithPassword({
  email: "rlstest-superadmin@cosora.test",
  password: credential("FIXTURE_PASSWORD"),
});
if (loginErr) throw new Error(`login failed: ${loginErr.message}`);

console.log(`Inviting: ${TARGET}\n`);

const { data, error } = await db.functions.invoke("admin-invite", {
  body: {
    email: TARGET,
    admin_role: "support",
    redirectTo: "http://localhost:5174/set-password",
  },
});

let body = data;
if (error?.context && typeof error.context.json === "function") {
  try {
    body = await error.context.json();
  } catch {
    body = { error: error.message };
  }
}

console.log(JSON.stringify(body, null, 2));

if (body?.ok && body.outcome === "invited") {
  console.log("\n==> INVITE BRANCH SUCCEEDED. An email was accepted by the auth service.");
  console.log("    Confirm actual delivery in the inbox / Supabase auth logs (mail.send).");
} else {
  console.log("\n==> INVITE DID NOT SUCCEED. Reported reason above — no success is being claimed.");
}
await db.auth.signOut();
