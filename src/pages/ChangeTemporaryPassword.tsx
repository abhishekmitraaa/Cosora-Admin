import { useState, type FormEvent } from "react";
import { useAdminSession } from "@/hooks/useAdminSession";
import { setOwnPassword } from "@/lib/staff";
import { AuthLayout, Button, Card, ErrorNote, Field, Input } from "@/components/ui";

/**
 * First sign-in for a registered staff member (admin-staff edge function). Their
 * account has a temporary password, sent to their personal email or handed over by
 * whoever registered them, and app_metadata.must_change_password is true until they
 * choose their own. RequireAdmin renders this page instead of the panel until then.
 *
 * The change goes through the edge function, not supabase.auth.updateUser(), so the
 * password and the flag change together. The gate is the panel's: what an account
 * can do is still decided by its role in the database.
 */
export default function ChangeTemporaryPassword() {
  const { session, refresh, signOut } = useAdminSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Use at least 10 characters, with letters and numbers.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await setOwnPassword(password);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <Card className="shadow-pop">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Choose your password</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          You signed in with a temporary password
          {session?.user.email ? (
            <>
              {" "}
              for <span className="font-medium text-ink">{session.user.email}</span>
            </>
          ) : null}
          . Choose your own to continue. The temporary one stops working once you save.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <Field label="New password" htmlFor="new-password" hint="At least 10 characters, with letters and numbers.">
            <Input
              id="new-password"
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Confirm password" htmlFor="confirm-password">
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>
          {error && <ErrorNote message={error} />}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save password and continue"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </form>
      </Card>
    </AuthLayout>
  );
}
