import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Grant admin access</h2>
        <p className="mb-3 text-xs text-slate-500">
          Search an existing account by email, then promote it with a role.
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
