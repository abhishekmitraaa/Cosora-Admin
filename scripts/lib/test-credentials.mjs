/**
 * Test credentials, read from the environment — never from source.
 *
 * Master Prompt 8, Phase 1: every script and spec used to carry the test
 * accounts' passwords as string literals, in a public repository, and the demo
 * password also shipped in the production bundle (demo-admin is a super_admin).
 * Those passwords were rotated on 2026-09-11 and now live only in the
 * gitignored `.env` locally, or in CI secrets. `.env.example` lists the names.
 *
 * `process.env` wins over `.env`, so CI can inject secrets without writing a
 * file. A missing value throws here, with the variable's name, instead of
 * surfacing later as an unexplained "Invalid login credentials".
 */
import { readFileSync } from "node:fs";

const fileEnv = (() => {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../../.env", import.meta.url), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
})();

/** One credential by variable name. */
export function credential(name) {
  const value = process.env[name] || fileEnv[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to .env (the names are listed in .env.example) or export it.`);
  }
  return value;
}

/**
 * One credential, or "" when it is unset. For Playwright specs: a throw while
 * Playwright collects test files aborts the whole run, so a spec reads with
 * this and calls `test.skip(!value, ...)`, as mp7-admin-vendor-panels does.
 */
export function optionalCredential(name) {
  return process.env[name] || fileEnv[name] || "";
}

/** True when every named credential is set. */
export function hasCredentials(...names) {
  return names.every((n) => optionalCredential(n) !== "");
}

export const DEMO_EMAILS = {
  buyer: "demo-buyer@cosora.dev",
  vendor: "demo-vendor@cosora.dev",
  admin: "demo-admin@cosora.dev",
};

/** `{ email, password }` for one of the three seeded demo accounts. */
export function demoAccount(role) {
  return { email: DEMO_EMAILS[role], password: credential(`DEMO_${role.toUpperCase()}_PASSWORD`) };
}

/** The password for a demo account, looked up by its email address. */
export function demoPasswordFor(email) {
  const role = Object.keys(DEMO_EMAILS).find((r) => DEMO_EMAILS[r] === email);
  if (!role) throw new Error(`${email} is not one of the demo accounts`);
  return credential(`DEMO_${role.toUpperCase()}_PASSWORD`);
}
