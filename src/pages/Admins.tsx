import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, TriangleAlert, UserCheck } from "lucide-react";
import { supabase, assertWrote } from "@/lib/supabase";
import { ALL_ROLES, ROLE_LABELS, type AdminRole } from "@/lib/roles";
import { useAdminSession } from "@/hooks/useAdminSession";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
} from "@/components/ui";

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  is_admin: boolean;
  admin_role: AdminRole | null;
}

/** Mirrors the admin-invite edge function's success payload. */
interface InviteResult {
  ok: true;
  outcome: "invited" | "promoted";
  email: string;
  admin_role: AdminRole;
  created: boolean; // was a brand-new auth user created
  hadPassword: boolean; // did the existing user already have a password
  emailSent: boolean; // did the set-password email actually send
  warning?: string; // present when granted but the email failed
  detail: string;
}

/**
 * Part 2 — admin & role management.
 *
 * Every mutation here is a plain `profiles` UPDATE from the signed-in admin's
 * own JWT. The `enforce_admin_grants` BEFORE trigger (textile-spark-net
 * 20260717130000) raises 42501 unless the caller is a super_admin, so a
 * non-super-admin who reaches this page — by URL, by editing the bundle, or by
 * calling PostgREST directly — gets rejected by Postgres, not by React.
 */
export default function Admins() {
  const qc = useQueryClient();
  const { identity } = useAdminSession();
  const [search, setSearch] = useState("");
  const [promoteRole, setPromoteRole] = useState<AdminRole>("support");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminRole>("support");
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  const admins = useQuery({
    queryKey: ["admins"],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, is_admin, admin_role")
        .eq("is_admin", true)
        .order("admin_role", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // Candidates to promote: non-admin profiles matching the email search.
  const candidates = useQuery({
    queryKey: ["promote-candidates", search],
    enabled: search.trim().length >= 3,
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, is_admin, admin_role")
        .eq("is_admin", false)
        .ilike("email", `%${search.trim()}%`)
        .limit(10);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: AdminRole }) => {
      assertWrote(
        await supabase.from("profiles").update({ admin_role: role }).eq("id", id).select("id"),
        "change admin role",
      );
    },
    onSuccess: () => {
      toast.success("Role updated");
      void qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const promote = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: AdminRole }) => {
      assertWrote(
        await supabase
          .from("profiles")
          .update({ is_admin: true, admin_role: role })
          .eq("id", id)
          .select("id"),
        "grant admin access",
      );
    },
    onSuccess: () => {
      toast.success("Admin access granted");
      setSearch("");
      void qc.invalidateQueries({ queryKey: ["admins"] });
      void qc.invalidateQueries({ queryKey: ["promote-candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const demote = useMutation({
    mutationFn: async (id: string) => {
      assertWrote(
        await supabase
          .from("profiles")
          .update({ is_admin: false, admin_role: null })
          .eq("id", id)
          .select("id"),
        "remove admin access",
      );
    },
    onSuccess: () => {
      toast.success("Admin access removed");
      void qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Invite by email — goes through the admin-invite edge function, never a
   * direct table write, because it may need to CREATE an auth user (service-role
   * only). The function reports which branch it took; we surface that verbatim
   * rather than a generic "success", so nobody is told an email went out when
   * the person already existed and this was only a role change.
   */
  const invite = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: AdminRole }): Promise<InviteResult> => {
      const { data, error } = await supabase.functions.invoke("admin-invite", {
        body: {
          email,
          admin_role: role,
          // Where the secure link lands — explicitly, never the global default
          // (which is the main app's Site URL). Must ALSO be allow-listed under
          // Supabase → Auth → URL Configuration → Redirect URLs, or Supabase
          // silently drops it and falls back to that Site URL.
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
      if (error) {
        // A non-2xx arrives as FunctionsHttpError with the real body on
        // error.context — surface the function's own words (e.g. an SMTP
        // failure), not a generic "Edge Function returned a non-2xx status".
        let detail = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            detail = [body.detail || body.error, body.hint].filter(Boolean).join(" — ") || detail;
          } catch {
            /* keep the original message */
          }
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error([data.detail || data.error, data.hint].filter(Boolean).join(" — "));
      return data as InviteResult;
    },
    onSuccess: (r) => {
      setInviteResult(r);
      setInviteEmail("");
      void qc.invalidateQueries({ queryKey: ["admins"] });
      void qc.invalidateQueries({ queryKey: ["promote-candidates"] });
    },
    onError: (e: Error) => {
      setInviteResult(null);
      toast.error(e.message, { duration: 12000 });
    },
  });

  if (admins.isLoading) return <Spinner />;

  const superAdminCount = (admins.data ?? []).filter((a) => a.admin_role === "super_admin").length;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Admins"
        subtitle="Grant, change, and revoke admin access. Super admin only — the database enforces this, not this page."
      />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Current admins</h2>
        <Table head={["Name", "Email", "Role", "Actions"]}>
          {(admins.data ?? []).map((a) => {
            const isSelf = a.id === identity?.id;
            const isLastSuperAdmin = a.admin_role === "super_admin" && superAdminCount === 1;
            return (
              <tr key={a.id}>
                <td className="px-3 py-2">
                  {a.full_name || <span className="text-slate-400">—</span>}
                  {isSelf && (
                    <span className="ml-1.5">
                      <Badge tone="blue">you</Badge>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{a.email}</td>
                <td className="px-3 py-2">
                  <Select
                    value={a.admin_role ?? ""}
                    disabled={isSelf || setRole.isPending}
                    onChange={(e) => setRole.mutate({ id: a.id, role: e.target.value as AdminRole })}
                  >
                    {a.admin_role === null && <option value="">No role assigned</option>}
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Button
                    variant="danger"
                    disabled={isSelf || isLastSuperAdmin || demote.isPending}
                    onClick={() => {
                      if (confirm(`Remove admin access for ${a.email}?`)) demote.mutate(a.id);
                    }}
                  >
                    Remove admin
                  </Button>
                </td>
              </tr>
            );
          })}
        </Table>

        {/*
          Self-edit is blocked here purely as a footgun guard — the database will
          happily let a super_admin demote themselves or drop the last one. Said
          plainly so nobody mistakes this for an enforced invariant.
        */}
        <p className="mt-3 text-xs text-slate-500">
          You can't change your own role or the last remaining super admin from this screen. That's a
          UI guard against locking everyone out, not a database rule — both are still possible via
          SQL with the service role.
        </p>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Invite an admin by email</h2>
        <p className="mb-3 text-xs text-slate-500">
          Works for anyone, including people who have never used Cosora. If they already have an
          account they're granted the role directly; if not, they get a secure link to set their own
          password. <span className="font-medium">No password is ever emailed.</span>
        </p>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setInviteResult(null);
            invite.mutate({ email: inviteEmail.trim(), role: inviteRole });
          }}
        >
          <Input
            type="email"
            required
            placeholder="person@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="max-w-xs"
          />
          <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as AdminRole)}>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="primary" disabled={!inviteEmail.trim() || invite.isPending}>
            {invite.isPending ? "Sending…" : "Invite"}
          </Button>
        </form>

        {/*
          Four distinct outcomes, each with an honest message. The critical
          distinction is whether a set-password email actually went out — saying
          "invite sent" when it wasn't (a plain promotion, or a failed send)
          would strand the new admin waiting on an email. `emailSent` drives the
          copy, never `outcome` alone.
        */}
        {inviteResult && <InviteConfirmation r={inviteResult} />}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Grant admin access</h2>
        <p className="mb-3 text-xs text-slate-500">
          Search an account that already exists, then promote it with a role. (Inviting by email
          above does this too — this is the browse-and-pick route.)
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search by email (min 3 characters)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={promoteRole} onChange={(e) => setPromoteRole(e.target.value as AdminRole)}>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-3">
          {search.trim().length < 3 ? (
            <p className="text-xs text-slate-400">Type at least 3 characters to search.</p>
          ) : candidates.isLoading ? (
            <Spinner label="Searching…" />
          ) : (candidates.data ?? []).length === 0 ? (
            <Empty>No non-admin account matches "{search}".</Empty>
          ) : (
            <Table head={["Name", "Email", ""]}>
              {(candidates.data ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">{c.full_name || <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-2 text-slate-600">{c.email}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="primary"
                      disabled={promote.isPending}
                      onClick={() => promote.mutate({ id: c.id, role: promoteRole })}
                    >
                      Make {ROLE_LABELS[promoteRole]}
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * Renders the confirmation for an invite/promote, keyed on what actually
 * happened. `emailSent` — not `outcome` — decides whether we claim an email
 * went out, so a failed send or a plain promotion is never dressed up as one.
 */
function InviteConfirmation({ r }: { r: InviteResult }) {
  // Granted but the set-password email failed: the person is an admin who
  // literally cannot log in yet. This must read as a problem, not a success.
  if (r.outcome === "invited" && !r.emailSent) {
    return (
      <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <div className="flex items-center gap-1.5 font-medium">
          <TriangleAlert size={14} /> Access granted to {r.email}, but the email did NOT send
          <Badge tone="amber">{ROLE_LABELS[r.admin_role]}</Badge>
        </div>
        <p className="mt-1 text-xs opacity-90">{r.warning ?? r.detail}</p>
        <p className="mt-1 text-xs opacity-75">
          This account has no password, so they can't sign in until a set-password link reaches
          them. Resend the invite once email works.
        </p>
      </div>
    );
  }

  // Promoted only: existing account that already had a password. No email.
  if (r.outcome === "promoted") {
    return (
      <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <div className="flex items-center gap-1.5 font-medium">
          <UserCheck size={14} /> {r.email} already had a password — access granted, no email needed
          <Badge tone="blue">{ROLE_LABELS[r.admin_role]}</Badge>
        </div>
        <p className="mt-1 text-xs opacity-90">{r.detail}</p>
      </div>
    );
  }

  // Invited: a set-password email went out — either to a brand-new account or to
  // an existing OTP-only one (which needed it just as much).
  return (
    <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
      <div className="flex items-center gap-1.5 font-medium">
        <Mail size={14} />
        {r.created
          ? `New account created — set-password link emailed to ${r.email}`
          : `${r.email} had no password — access granted and a set-password link emailed`}
        <Badge tone="green">{ROLE_LABELS[r.admin_role]}</Badge>
      </div>
      <p className="mt-1 text-xs opacity-90">{r.detail}</p>
      <p className="mt-1 text-xs opacity-75">
        They won't appear as signed-in until they open the link and set a password. The link must
        return to this panel — its /reset-password URL has to be allow-listed in Supabase under
        Auth &rarr; URL Configuration &rarr; Redirect URLs.
      </p>
    </div>
  );
}
