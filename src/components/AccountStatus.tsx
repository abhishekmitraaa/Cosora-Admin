import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase, describeWriteError } from "@/lib/supabase";
import { canSuspendAccounts, ROLE_LABELS } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import ReasonPicker from "./ReasonPicker";
import { Badge, Button, Card, ErrorNote, Note, Notice, SubHeading, Spinner } from "./ui";

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
      // Newest first. The flat reason text is folded back into the embed shape;
      // it is NOT NULL on chat_block_reasons, so null means no reason row.
      const { data, error } = await supabase.rpc("admin_account_suspension_list", {
        p_profile_ids: [profileId],
      });
      if (error) throw new Error(error.message);

      const rows: SuspensionRow[] = (data ?? []).map((s) => ({
        id: s.id,
        source: s.source,
        suspended_at: s.suspended_at,
        suspended_by: s.suspended_by,
        reinstated_at: s.reinstated_at,
        reinstated_by: s.reinstated_by,
        active: s.active,
        conversation_review_id: s.conversation_review_id,
        reason: s.reason !== null ? { reason: s.reason } : null,
      }));
      // suspended_by / reinstated_by / profile_id all FK to profiles, so
      // PostgREST cannot embed the actor (PGRST201) — resolved separately.
      const actorIds = [
        ...new Set(rows.flatMap((r) => [r.suspended_by, r.reinstated_by]).filter(Boolean)),
      ] as string[];
      const actors = new Map<string, string>();
      if (actorIds.length > 0) {
        // An RPC, not a profiles select: email is not client-selectable (MPF-3).
        const { data: people } = await supabase.rpc("admin_profile_emails", { p_ids: actorIds });
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
        // `p_reason_id uuid` accepts NULL in SQL (reinstating states no reason,
        // and chat_block_reasons may be empty). `supabase gen types` models a
        // function argument's TYPE but not its nullability, so it emits
        // `string` for every uuid param — the cast asserts what the DDL says.
        p_reason_id: reasonId as string,
        p_source: "admin_manual",
        // Omitted rather than passed as null: it has a SQL DEFAULT NULL, and
        // the generated Args type marks it optional accordingly.
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
          <Badge tone="critical" dot>suspended</Badge>
        ) : (
          <Badge tone="positive" dot>active</Badge>
        )}
      </div>

      <p className="mb-3 text-xs leading-relaxed text-ink-muted">
        This is <span className="font-mono text-2xs">profiles.account_status</span>, the flag buyer
        and vendor accounts share. It can only be changed through{" "}
        <span className="font-mono text-2xs">set_account_status()</span>, which records every change
        on the <span className="font-mono text-2xs">account_suspensions</span> ledger.
      </p>

      {/*
        Scope, stated honestly. This is NOT the old "sets a flag only" banner —
        suspension is really enforced now, just not everywhere. Narrow the claim
        when the remaining surfaces are gated; do not broaden it before.
      */}
      <Notice tone="caution" title="What suspending actually stops" className="mb-3 text-xs">
        Chat and calling, for real and server-side:{" "}
        <span className="font-mono text-2xs">messages_insert</span> requires the sender's account to
        be active, so a suspended account cannot send a message even with the UI bypassed, and the
        call gate refuses in both directions. It does <span className="font-semibold">not</span> yet
        stop them posting RFQs, submitting quotes, uploading products or running ads: those inserts
        are not gated on account status.
      </Notice>

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
          Suspending or reinstating an account requires the Super admin or Support role. You are
          signed in as {role ? ROLE_LABELS[role] : "no role"}, and{" "}
          <span className="font-mono text-2xs">set_account_status()</span> would refuse the call. The
          suspension history is hidden for the same reason, so an empty list here is never mistaken
          for &ldquo;never suspended&rdquo;.
        </Note>
      )}

      {writable && (
        <div className="mt-4 border-t border-line pt-3">
          <SubHeading className="mb-2">Suspension ledger</SubHeading>
          {history.isLoading ? (
            <p className="text-xs text-ink-faint">Loading…</p>
          ) : history.error ? (
            <ErrorNote message={(history.error as Error).message} />
          ) : (history.data?.rows ?? []).length === 0 ? (
            <p className="text-xs text-ink-faint">This account has never been suspended.</p>
          ) : (
            <ul className="space-y-2">
              {history.data!.rows.map((s) => (
                <li key={s.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-ink">{s.reason?.reason ?? "No reason recorded"}</span>
                    {s.active ? <Badge tone="critical">in force</Badge> : <Badge>lifted</Badge>}
                    <Badge tone="neutral">{s.source}</Badge>
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
