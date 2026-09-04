import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase, describeWriteError } from "@/lib/supabase";
import { canSuspendAccounts, ROLE_LABELS } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import ReasonPicker from "./ReasonPicker";
import { Badge, Button, Card, ErrorNote, Note, Spinner } from "./ui";

interface SuspensionRow {
  id: string;
  source: string;
  suspended_at: string;
  suspended_by: string | null;
  reinstated_at: string | null;
  reinstated_by: string | null;
  active: boolean;
  conversation_review_id: string | null;
  reason: { reason: string } | null;
}

/**
 * Suspend / reinstate one account — buyer or vendor, they share
 * `profiles.account_status` and this one control.
 *
 * The status is NEVER written directly. A BEFORE trigger rejects a direct
 * UPDATE outright; the only way through is set_account_status(), which is
 * SECURITY DEFINER, gated to support/super_admin, and which also writes the
 * `account_suspensions` ledger. That is why nothing here calls assertWrote():
 * the RPC raises on every refusal, so a plain `if (error)` is a complete check —
 * unlike the table UPDATEs elsewhere in this app, where RLS denials are silent.
 *
 * `source` distinguishes where the decision came from: 'admin_manual' here,
 * 'chat_review' when the review queue does it. The ledger keeps them apart.
 */
export default function AccountStatus({
  profileId,
  name,
  kind = "account",
}: {
  profileId: string;
  name: string;
  /** Only affects the wording. */
  kind?: "buyer" | "vendor" | "account";
}) {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canSuspendAccounts(role);
  const [picking, setPicking] = useState(false);

  const account = useQuery({
    queryKey: ["account-status", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, account_status")
        .eq("id", profileId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  // The audit ledger. Read-only for support/super_admin, so it is not even
  // requested for roles that would get an empty list and read it as "never
  // suspended" — a materially wrong impression.
  const history = useQuery({
    queryKey: ["account-suspensions", profileId],
    enabled: writable,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_suspensions")
        .select(
          `id, source, suspended_at, suspended_by, reinstated_at, reinstated_by, active,
           conversation_review_id, reason:chat_block_reasons(reason)`,
        )
        .eq("profile_id", profileId)
        .order("suspended_at", { ascending: false });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as SuspensionRow[];
      // suspended_by / reinstated_by / profile_id all FK to profiles, so
      // PostgREST cannot embed the actor (PGRST201) — resolved separately.
      const actorIds = [
        ...new Set(rows.flatMap((r) => [r.suspended_by, r.reinstated_by]).filter(Boolean)),
      ] as string[];
      const actors = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: people } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", actorIds);
        for (const p of people ?? []) actors.set(p.id, p.full_name || p.email || p.id.slice(0, 8));
      }
      return { rows, actors };
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ status, reasonId }: { status: "suspended" | "active"; reasonId: string | null }) => {
      const { error } = await supabase.rpc("set_account_status", {
        p_profile_id: profileId,
        p_new_status: status,
        p_reason_id: reasonId,
        p_source: "admin_manual",
        p_conversation_review_id: null,
      });
      if (error) throw new Error(describeWriteError(error));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["account-status", profileId] });
      void qc.invalidateQueries({ queryKey: ["account-suspensions", profileId] });
      void qc.invalidateQueries({ queryKey: ["chats"] });
      void qc.invalidateQueries({ queryKey: ["chat-review"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (account.isLoading) return <Card><Spinner label="Reading account status…" /></Card>;
  if (account.error) return <Card><ErrorNote message={(account.error as Error).message} /></Card>;
  if (!account.data) return <Card><ErrorNote message="No profiles row for this account." /></Card>;

  const suspended = account.data.account_status === "suspended";
  const noun = kind === "account" ? "account" : `${kind} account`;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Account status</h2>
        {suspended ? (
          <Badge tone="red" dot>suspended</Badge>
        ) : (
          <Badge tone="green" dot>active</Badge>
        )}
      </div>

      <p className="mb-3 text-xs leading-relaxed text-ink-muted">
        This is <span className="font-mono text-[11px]">profiles.account_status</span> — the flag
        buyer and vendor accounts share. It can only be changed through{" "}
        <span className="font-mono text-[11px]">set_account_status()</span>, which records every
        change on the <span className="font-mono text-[11px]">account_suspensions</span> ledger.
      </p>

      {writable ? (
        <Button
          variant={suspended ? "outline" : "danger"}
          disabled={setStatus.isPending}
          onClick={() => {
            if (suspended) {
              if (!confirm(`Reinstate ${name}? Their ${noun} becomes active again.`)) return;
              setStatus.mutate(
                { status: "active", reasonId: null },
                { onSuccess: () => toast.success(`${name} reinstated`) },
              );
            } else {
              setPicking(true);
            }
          }}
        >
          {suspended ? "Reinstate account" : "Suspend account"}
        </Button>
      ) : (
        <Note>
          Suspending or reinstating an account requires the Super admin or Support role — you are
          signed in as {role ? ROLE_LABELS[role] : "no role"}, and{" "}
          <span className="font-mono text-[11px]">set_account_status()</span> would refuse the call.
          The suspension history is hidden for the same reason, so an empty list here is never
          mistaken for "never suspended".
        </Note>
      )}

      {writable && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Suspension ledger
          </h3>
          {history.isLoading ? (
            <p className="text-xs text-ink-faint">Loading…</p>
          ) : history.error ? (
            <ErrorNote message={(history.error as Error).message} />
          ) : (history.data?.rows ?? []).length === 0 ? (
            <p className="text-xs text-ink-faint">This account has never been suspended.</p>
          ) : (
            <ul className="space-y-2">
              {history.data!.rows.map((s) => (
                <li key={s.id} className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-ink">{s.reason?.reason ?? "No reason recorded"}</span>
                    {s.active ? <Badge tone="red">in force</Badge> : <Badge>lifted</Badge>}
                    <Badge tone="slate">{s.source}</Badge>
                  </div>
                  <div className="mt-1 text-ink-muted">
                    Suspended {format(new Date(s.suspended_at), "d MMM yyyy, HH:mm")}
                    {s.suspended_by && ` by ${history.data!.actors.get(s.suspended_by) ?? "an admin"}`}
                    {s.reinstated_at &&
                      ` · reinstated ${format(new Date(s.reinstated_at), "d MMM yyyy, HH:mm")}${
                        s.reinstated_by
                          ? ` by ${history.data!.actors.get(s.reinstated_by) ?? "an admin"}`
                          : ""
                      }`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ReasonPicker
        open={picking}
        title={`Suspend ${name}`}
        confirmLabel="Suspend account"
        description={`Their ${noun} is set to suspended and the decision is written to the audit ledger as a manual admin action.`}
        busy={setStatus.isPending}
        onClose={() => setPicking(false)}
        onConfirm={(reasonId) =>
          setStatus.mutate(
            { status: "suspended", reasonId },
            {
              onSuccess: () => {
                toast.success(`${name} suspended`);
                setPicking(false);
              },
            },
          )
        }
      />
    </Card>
  );
}
