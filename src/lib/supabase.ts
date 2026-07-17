import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env — " +
      "point them at the same Supabase project as textile-spark-net.",
  );
}

// Anon key only. Every request carries the signed-in admin's JWT, so the RLS and
// the moderation triggers from textile-spark-net are what actually authorize each
// write. There is deliberately no service-role key in this app.
//
// detectSessionInUrl + implicit flow are set EXPLICITLY, not left to defaults,
// because the invite / recovery flow depends on them: a Supabase invite link
// lands on /reset-password with the session in the URL hash
// (#access_token=…&type=invite), and the client must parse that hash to
// establish the session. Implicit flow (not PKCE) is required here — an invite
// link is generated server-side, so the recipient's browser has no PKCE code
// verifier to exchange; the token arrives directly in the hash instead.
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "implicit",
  },
});

/**
 * Postgres raises 42501 (insufficient_privilege) both from an RLS violation and
 * from the `raise exception ... errcode = '42501'` in the moderation triggers.
 * Surfacing the database's own message — rather than a generic one — keeps it
 * obvious that the rejection came from the DB and not from this UI.
 */
export function describeWriteError(error: { message: string; code?: string }): string {
  if (error.code === "42501" || /row-level security|not authorized|requires the/i.test(error.message)) {
    return `Database rejected this write: ${error.message}`;
  }
  return error.message;
}

/**
 * Assert that an UPDATE/DELETE actually changed something.
 *
 * THIS IS LOAD-BEARING, not a nicety. An RLS policy does not raise on UPDATE:
 * a row whose USING clause fails is simply invisible, so the statement matches
 * zero rows and PostgREST returns success with no error. Only the moderation
 * triggers raise 42501 explicitly.
 *
 * So `if (error) fail()` is NOT enough — without this check a support user's
 * blocked approval would return no error and the UI would cheerfully report
 * success while the database changed nothing. Every mutation in this app
 * therefore appends `.select()` and routes the result through here.
 *
 * (INSERTs don't need this: a WITH CHECK violation does raise.)
 */
export function assertWrote<T>(
  result: { data: T[] | null; error: { message: string; code?: string } | null },
  action: string,
): T[] {
  if (result.error) throw new Error(describeWriteError(result.error));
  if (!result.data || result.data.length === 0) {
    throw new Error(
      `Database rejected this write (${action}): no rows matched. Your admin role does not ` +
        `permit it, or the row no longer exists. Nothing was changed.`,
    );
  }
  return result.data;
}
