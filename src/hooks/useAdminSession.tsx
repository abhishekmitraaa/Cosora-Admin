import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AdminRole } from "@/lib/roles";

export interface AdminIdentity {
  id: string;
  email: string | null;
  fullName: string | null;
  isAdmin: boolean;
  role: AdminRole | null;
}

interface AdminSessionValue {
  loading: boolean;
  session: Session | null;
  /** Null when signed out, or when the signed-in user has no profiles row. */
  identity: AdminIdentity | null;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AdminSessionValue | null>(null);

/**
 * Reads is_admin / admin_role straight from `profiles` for the signed-in user on
 * every session change — never from JWT claims or localStorage, which the client
 * controls and which go stale the moment a super_admin changes someone's role.
 *
 * This read is also subject to RLS, so it can only ever return the caller's own
 * row. It gates what the UI RENDERS; it does not gate what the user can DO —
 * that is Postgres's job on each write (see lib/roles.ts).
 */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadIdentity(current: Session | null) {
    if (!current?.user) {
      setIdentity(null);
      setError(null);
      setLoading(false);
      return;
    }
    const { data, error: dbError } = await supabase
      .from("profiles")
      .select("id, email, full_name, is_admin, admin_role")
      .eq("id", current.user.id)
      .maybeSingle();

    if (dbError) {
      setError(dbError.message);
      setIdentity(null);
    } else if (!data) {
      // Authenticated but no profiles row — treat as a non-admin, not an error.
      setIdentity({
        id: current.user.id,
        email: current.user.email ?? null,
        fullName: null,
        isAdmin: false,
        role: null,
      });
      setError(null);
    } else {
      setIdentity({
        id: data.id,
        email: data.email,
        fullName: data.full_name,
        isAdmin: data.is_admin,
        role: data.admin_role,
      });
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      void loadIdentity(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(true);
      // Re-read the profile on every auth transition: a role changed in another
      // tab (or by another super_admin) must not survive on stale state.
      void loadIdentity(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AdminSessionValue = {
    loading,
    session,
    identity,
    error,
    refresh: async () => {
      const { data } = await supabase.auth.getSession();
      await loadIdentity(data.session);
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setIdentity(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminSession(): AdminSessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdminSession must be used inside <AdminSessionProvider>");
  return ctx;
}

/** Convenience for pages: the current role, or null. */
export function useRole(): AdminRole | null {
  return useAdminSession().identity?.role ?? null;
}
