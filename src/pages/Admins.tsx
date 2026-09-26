import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, TriangleAlert, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ROLE_LABELS, TEAM_ROLES, assignableRoles, type AdminRole } from "@/lib/roles";
import { useAdminSession } from "@/hooks/useAdminSession";
import {
  Badge,
  Button,
  Empty,
  Field,
  Input,
  Notice,
  Page,
  PageHeader,
  Panel,
  ROW_HOVER,
  Select,
  SkeletonList,
  Stack,
  Table,
} from "@/components/ui";

const SUBTITLE =
  "Grant, change, and revoke admin access. Super admins manage everyone; managers manage teammates in the team roles. The database enforces that, not this page.";

/** A row of admin_list_admins(). admin.admin_users.admin_role is NOT NULL. */
interface AdminRow {
  id: string;
  email: string | null;
  full_name: string | null;
  admin_role: AdminRole;
}

/** A row of admin_search_candidates(): a profile with no active admin row. */
interface CandidateRow {
  id: string;
  email: string | null;
  full_name: string | null;
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
 * Every read and write here goes through a SECURITY DEFINER RPC over
 * admin.admin_users (admin-schema separation Phase 5; textile-spark-net
 * migration 20260922120000): admin_list_admins, admin_search_candidates,
 * admin_set_role, admin_grant, admin_revoke. Each checks the caller itself and
 * RAISES 42501 on refusal, so a caller who reaches this page — by URL, by
 * editing the bundle, or by calling PostgREST directly — is rejected by
 * Postgres, not by React. Because they raise rather than silently matching zero
 * rows, a plain `if (error)` is a complete check (like set_account_status).
 *
 * Managers (Mitra, 2026-09-26; migration 20260925210601) add, change and remove
 * teammates in TEAM_ROLES only. For a manager this page offers only those roles,
 * and shows super admins, other managers and their own row read-only; the
 * database refuses the rest anyway.
 */
export default function Admins() {
  const qc = useQueryClient();
  const { identity } = useAdminSession();
  const myRole = identity?.role ?? null;
  const isManager = myRole === "manager";
  const assignable = assignableRoles(myRole);
  const [search, setSearch] = useState("");
  const [promoteRole, setPromoteRole] = useState<AdminRole>("support");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminRole>("support");
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  const admins = useQuery({
    queryKey: ["admins"],
    queryFn: async (): Promise<AdminRow[]> => {
      // Ordered by admin_role (enum order), then email.
      const { data, error } = await supabase.rpc("admin_list_admins");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // Candidates to promote: non-admin profiles matching the email search.
  const candidates = useQuery({
    queryKey: ["promote-candidates", search],
    enabled: search.trim().length >= 3,
    queryFn: async (): Promise<CandidateRow[]> => {
      // Same match as before: email ilike %search%, 10 rows, 3+ characters.
      const { data, error } = await supabase.rpc("admin_search_candidates", { p_query: search.trim() });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: AdminRole }) => {
      const { error } = await supabase.rpc("admin_set_role", { p_user_id: id, p_role: role });
      if (error) throw new Error(`Couldn't change admin role: ${error.message}`);
    },
    onSuccess: () => {
      toast.success("Role updated");
      void qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const promote = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: AdminRole }) => {
      const { error } = await supabase.rpc("admin_grant", { p_user_id: id, p_role: role });
      if (error) throw new Error(`Couldn't grant admin access: ${error.message}`);
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
      const { error } = await supabase.rpc("admin_revoke", { p_user_id: id });
      if (error) throw new Error(`Couldn't remove admin access: ${error.message}`);
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
            detail = [body.detail || body.error, body.hint].filter(Boolean).join(" - ") || detail;
          } catch {
            /* keep the original message */
          }
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error([data.detail || data.error, data.hint].filter(Boolean).join(" - "));
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

  if (admins.isLoading) {
    return (
      <Page>
        <PageHeader title="Admins" subtitle={SUBTITLE} />
        <SkeletonList rows={3} height="h-40" />
      </Page>
    );
  }

  const superAdminCount = (admins.data ?? []).filter((a) => a.admin_role === "super_admin").length;

  return (
    <Page>
      <PageHeader title="Admins" subtitle={SUBTITLE} />

      <Stack>
      <Panel title="Current admins">
        <Table head={["Name", "Email", "Role", "Actions"]}>
          {(admins.data ?? []).map((a) => {
            const isSelf = a.id === identity?.id;
            const isLastSuperAdmin = a.admin_role === "super_admin" && superAdminCount === 1;
            // A manager changes teammates only: not a super admin, another manager or themselves.
            const managerReadOnly = isManager && (isSelf || !TEAM_ROLES.includes(a.admin_role));
            return (
              <tr key={a.id} className={ROW_HOVER}>
                <td className="px-3 py-2 text-ink">
                  {a.full_name || <span className="text-ink-ghost">no name</span>}
                  {isSelf && (
                    <span className="ml-1.5">
                      <Badge tone="info">you</Badge>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-muted">{a.email}</td>
                <td className="px-3 py-2">
                  {managerReadOnly ? (
                    <span className="flex flex-wrap items-center gap-1.5 text-ink" data-role-readonly={a.admin_role}>
                      {ROLE_LABELS[a.admin_role]}
                      {!isSelf && <Badge tone="neutral">Super admin only</Badge>}
                    </span>
                  ) : (
                    <Select
                      aria-label={`Role for ${a.email ?? "this admin"}`}
                      value={a.admin_role}
                      disabled={isSelf || setRole.isPending}
                      onChange={(e) => setRole.mutate({ id: a.id, role: e.target.value as AdminRole })}
                    >
                      {assignable.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isSelf || isLastSuperAdmin || managerReadOnly || demote.isPending}
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
          Two different guards, said plainly so nobody mistakes one for the other:
          - self-edit is blocked HERE only, as a footgun guard; the database lets a
            super_admin change their own role while another super_admin remains;
          - leaving zero active super_admins IS a database rule since Phase 5a:
            admin_set_role / admin_revoke / admin_grant raise 42501. Only direct
            SQL as postgres on admin.admin_users can still do it.
        */}
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          {isManager ? (
            <>
              As a manager you add, change and remove teammates in the team roles:{" "}
              {TEAM_ROLES.map((r) => ROLE_LABELS[r]).join(", ")}. Super admins, managers and your own
              access are changed by a super admin only, and the database refuses anything else.
            </>
          ) : (
            <>
              You cannot change your own role from this screen, as a guard against locking yourself out.
              Removing or downgrading the last remaining super admin is refused by the database itself;
              only direct SQL on the admin schema can still do that. Managers can add, change and remove
              teammates in the team roles, and no one else.
            </>
          )}
        </p>
      </Panel>

      <Panel
        title="Invite an admin by email"
        description={
          <>
            Works for anyone, including people who have never used Cosora. If they already have an
            account they are granted the role directly; if not, they get a secure link to set their
            own password. <span className="font-medium text-ink">No password is ever emailed.</span>
          </>
        }
      >
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setInviteResult(null);
            invite.mutate({ email: inviteEmail.trim(), role: inviteRole });
          }}
        >
          <Field label="Email address" htmlFor="invite-email" className="w-full max-w-xs">
            <Input
              id="invite-email"
              type="email"
              required
              placeholder="person@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </Field>
          <Field label="Role" htmlFor="invite-role">
            <Select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as AdminRole)}
            >
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
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
      </Panel>

      <Panel
        title="Grant admin access"
        description="Search an account that already exists, then promote it with a role. Inviting by email above does this too; this is the browse-and-pick route."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="Search existing accounts"
            htmlFor="promote-search"
            hint="At least 3 characters."
            className="w-full max-w-xs"
          >
            <Input
              id="promote-search"
              placeholder="name@company.com"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Role to grant" htmlFor="promote-role">
            <Select
              id="promote-role"
              value={promoteRole}
              onChange={(e) => setPromoteRole(e.target.value as AdminRole)}
            >
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          {search.trim().length < 3 ? (
            <p className="text-xs text-ink-faint">Type at least 3 characters to search.</p>
          ) : candidates.isLoading ? (
            <SkeletonList rows={2} height="h-10" />
          ) : (candidates.data ?? []).length === 0 ? (
            <Empty>No non-admin account matches &ldquo;{search}&rdquo;.</Empty>
          ) : (
            <Table head={["Name", "Email", ""]}>
              {(candidates.data ?? []).map((c) => (
                <tr key={c.id} className={ROW_HOVER}>
                  <td className="px-3 py-2 text-ink">
                    {c.full_name || <span className="text-ink-ghost">no name</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{c.email}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="primary"
                      size="sm"
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
      </Panel>
      </Stack>
    </Page>
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
      <Notice
        tone="caution"
        className="mt-4"
        icon={<TriangleAlert size={14} />}
        title={
          <span className="flex flex-wrap items-center gap-1.5">
            Access granted to {r.email}, but the email did NOT send
            <Badge tone="caution">{ROLE_LABELS[r.admin_role]}</Badge>
          </span>
        }
      >
        <p className="mt-1 text-xs">{r.warning ?? r.detail}</p>
        <p className="mt-1 text-xs opacity-80">
          This account has no password, so they cannot sign in until a set-password link reaches
          them. Resend the invite once email works.
        </p>
      </Notice>
    );
  }

  // Promoted only: existing account that already had a password. No email.
  if (r.outcome === "promoted") {
    return (
      <Notice
        tone="info"
        className="mt-4"
        icon={<UserCheck size={14} />}
        title={
          <span className="flex flex-wrap items-center gap-1.5">
            {r.email} already had a password. Access granted, no email needed.
            <Badge tone="info">{ROLE_LABELS[r.admin_role]}</Badge>
          </span>
        }
      >
        <p className="mt-1 text-xs">{r.detail}</p>
      </Notice>
    );
  }

  // Invited: a set-password email went out — either to a brand-new account or to
  // an existing OTP-only one (which needed it just as much).
  return (
    <Notice
      tone="positive"
      className="mt-4"
      icon={<Mail size={14} />}
      title={
        <span className="flex flex-wrap items-center gap-1.5">
          {r.created
            ? `New account created. Set-password link emailed to ${r.email}.`
            : `${r.email} had no password. Access granted and a set-password link emailed.`}
          <Badge tone="positive">{ROLE_LABELS[r.admin_role]}</Badge>
        </span>
      }
    >
      <p className="mt-1 text-xs">{r.detail}</p>
      <p className="mt-1 text-xs opacity-80">
        They will not appear as signed in until they open the link and set a password. The link must
        return to this panel, so its /reset-password URL has to be allow-listed in Supabase under
        Auth &rarr; URL Configuration &rarr; Redirect URLs.
      </p>
    </Notice>
  );
}
