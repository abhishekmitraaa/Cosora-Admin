import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/hooks/useAdminSession";
import { Button, Card, ErrorNote, Input, Spinner } from "@/components/ui";

/**
 * Where an invite link lands. The invited person arrives with a session already
 * established from the secure link (supabase-js picks the token out of the URL
 * via detectSessionInUrl), and sets their own password here.
 *
 * This is the reason no password is ever generated or emailed: the credential is
 * created by its owner, on this page, and never travels through an inbox.
 *
 * Routed OUTSIDE RequireAdmin: the arriving session is real, but sending someone
 * to a "not an admin" wall before they've finished onboarding would be a dead end.
 */
export default function SetPassword() {
  const navigate = useNavigate();
  const { session, loading, refresh } = useAdminSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // supabase-js clears the token from the URL once consumed; give it a beat
  // before deciding the link was bad.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (loading || (!session && !settled)) return <Spinner label="Checking your invite link…" />;

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md">
          <h1 className="text-base font-semibold text-slate-900">This invite link isn't valid</h1>
          <p className="mt-2 text-sm text-slate-600">
            It may have expired or already been used. Ask a super admin to send a new invite, or{" "}
            <button className="underline" onClick={() => navigate("/login")}>
              sign in
            </button>{" "}
            if you've already set a password.
          </p>
        </Card>
      </div>
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
    // Re-read is_admin/admin_role now that onboarding is done, so the shell
    // renders the right sections immediately.
    await refresh();
    setDone(true);
    setBusy(false);
    navigate("/", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <h1 className="text-base font-semibold text-slate-900">Set your password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Welcome to Cosora Admin. Choose a password for{" "}
          <span className="font-medium text-slate-700">{session.user.email}</span>.
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">New password</label>
            <Input
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Confirm password</label>
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
    </div>
  );
}
