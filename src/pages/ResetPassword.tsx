import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/hooks/useAdminSession";
import { AuthLayout, Button, Card, ErrorNote, Input, Spinner } from "@/components/ui";

/**
 * The route a Supabase invite / recovery link lands on. This is the piece that
 * makes invites usable at all: without it, the secure link has nowhere to go
 * that can complete onboarding.
 *
 * How the arriving session is established:
 *   The link points at Supabase's /auth/v1/verify, which (after allow-listing —
 *   see below) redirects the browser here with the session in the URL hash
 *   (#access_token=…&type=invite|recovery). The client parses that hash
 *   (detectSessionInUrl, implicit flow — configured in lib/supabase.ts) and
 *   fires an auth event: SIGNED_IN, plus PASSWORD_RECOVERY for recovery-type
 *   links. We treat EITHER a fresh event OR an already-present session as "this
 *   link is good, show the form".
 *
 * Routed OUTSIDE RequireAdmin on purpose: the arriving person may be a brand-new
 * admin who has never signed in, and bouncing them off an admin wall before they
 * can set a password would be a dead end.
 *
 * IMPORTANT dashboard step (not code): this route's URL must be added to
 * Supabase → Auth → URL Configuration → Redirect URLs. Supabase silently drops
 * any redirect_to that isn't allow-listed and falls back to the project Site URL
 * (the main app) — so an un-allow-listed invite lands on the wrong app entirely.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const { refresh } = useAdminSession();

  // "recoverable" = a session usable for updateUser exists (from the link hash
  // or already established). Null = still deciding; false = no link session.
  const [recoverable, setRecoverable] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let settled = false;
    const accept = (session: Session | null) => {
      if (!session) return;
      settled = true;
      setEmail(session.user.email ?? null);
      setRecoverable(true);
    };

    // 1. Explicitly catch the recovery/invite events the URL hash produces.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        accept(session);
      }
    });

    // 2. Fallback: the hash may have been parsed before this component mounted,
    //    so also check for an already-present session directly.
    supabase.auth.getSession().then(({ data }) => accept(data.session));

    // 3. Give the client a moment to parse the URL; if nothing turned up, the
    //    link is missing/expired — show the invalid state, never a live form.
    const t = setTimeout(() => {
      if (!settled) setRecoverable((r) => (r === null ? false : r));
    }, 1600);

    return () => {
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  if (recoverable === null) return <Spinner label="Checking your link…" />;

  if (recoverable === false) {
    return (
      <AuthLayout>
        <Card className="shadow-pop">
          <h1 className="text-lg font-semibold tracking-tight text-ink">This link isn't valid</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Your invite or password-reset link is missing, expired, or already used. Ask a super
            admin to send a new invite, or{" "}
            <button
              className="font-medium text-brand underline underline-offset-2 hover:text-brand-700"
              onClick={() => navigate("/login")}
            >
              sign in
            </button>{" "}
            if you've already set a password.
          </p>
        </Card>
      </AuthLayout>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }
    // Re-read is_admin / admin_role now onboarding is done, so the shell renders
    // the right sections immediately, then drop them into the panel.
    await refresh();
    setDone(true);
    setBusy(false);
    navigate("/", { replace: true });
  }

  return (
    <AuthLayout>
      <Card className="shadow-pop">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Set your password</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Welcome to Cosora Admin. Choose a password
          {email ? (
            <>
              {" "}
              for <span className="font-medium text-ink">{email}</span>
            </>
          ) : null}
          .
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted">New password</label>
            <Input
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted">Confirm password</label>
            <Input
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && <ErrorNote message={error} />}
          <Button type="submit" variant="primary" className="w-full" disabled={busy || done}>
            {busy ? "Saving…" : "Set password and continue"}
          </Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
