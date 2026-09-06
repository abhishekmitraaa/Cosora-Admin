import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAdminSession } from "@/hooks/useAdminSession";
import { canSee, type Section } from "@/lib/roles";
import { Card, ErrorNote, Spinner } from "./ui";

/**
 * Blocks entry to the whole app unless the signed-in user's `profiles` row says
 * is_admin = true. This is the coarse gate; `admin_role` then decides which
 * sections render.
 *
 * Both are UX. Someone who bypasses this component still cannot read or write
 * anything the RLS policies don't allow their JWT to.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, session, identity, error } = useAdminSession();
  const location = useLocation();

  if (loading) return <Spinner label="Checking admin access…" />;
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  if (error) {
    return (
      <div className="p-8">
        <ErrorNote message={`Could not read your admin profile: ${error}`} />
      </div>
    );
  }

  if (!identity?.isAdmin) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-canvas p-6">
        <Card className="max-w-md text-center">
          <h1 className="font-display text-base font-bold text-ink">Not an admin account</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {identity?.email} is signed in but does not have admin access. Ask a super admin to
            grant it.
          </p>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Per-section gate. Renders a plain explanation rather than a 404 so an admin
 * who follows a link from a colleague understands why they can't see it.
 */
export function RequireSection({ section, children }: { section: Section; children: ReactNode }) {
  const role = useAdminSession().identity?.role ?? null;

  if (!canSee(role, section)) {
    return (
      <Card className="max-w-lg">
        <h1 className="font-display text-base font-bold text-ink">
          Section not available for your role
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Your admin role does not include the{" "}
          <span className="font-medium text-ink">{section}</span> section. If you reached this by a
          link, ask a super admin to change your role.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
}
