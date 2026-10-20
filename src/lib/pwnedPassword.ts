/**
 * Have I Been Pwned's breached-password list, checked by k-anonymity: only the first 5 characters of the
 * password's SHA-1 are sent. Supabase's own leaked-password protection needs a paid plan (Cosora is on
 * Free, 2026-10-20), so the panel checks where a password is chosen: here for the set-password and reset
 * links (supabase.auth.updateUser), and in the admin-staff edge function for a first sign-in.
 *
 * Returns false when the service can't be reached: an outage there must not stop someone setting a password.
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password)));
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const r = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { "Add-Padding": "true" } });
    if (!r.ok) return false;
    const suffix = hex.slice(5);
    return (await r.text()).split("\n").some((line) => {
      const [s, count] = line.trim().split(":");
      return s === suffix && Number(count) > 0; // padding rows carry a count of 0
    });
  } catch {
    return false;
  }
}

/** The panel's password rule, the same as admin-staff's set_password. Null when it passes. */
export function passwordRuleProblem(password: string): string | null {
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Use at least 10 characters, with letters and numbers.";
  }
  if (password.length > 72) return "Use 72 characters or fewer.";
  return null;
}
