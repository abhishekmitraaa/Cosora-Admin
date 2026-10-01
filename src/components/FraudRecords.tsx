import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { Badge, Empty, ErrorNote, Panel, ROW_HOVER, SkeletonList, Table, type Tone } from "@/components/ui";

/**
 * Confirmed fraud: the lasting record (Help & Support P6; textile-spark-net D-16, revised
 * by Andy on 2026-10-01). A fraud report is kept for a year; when a reviewer decides it was
 * fraud (warned, suspended or sent to legal), admin.fraud_findings records who it was,
 * what they did (the reviewer's note) and the account's status then, and keeps it after
 * the report itself is deleted. Changing the outcome to "no action" withdraws the record.
 *
 * Read through admin_fraud_findings(): super_admin, support and manager, like the queue.
 */

interface FindingRow {
  id: string;
  ticket_no: string;
  subject_profile_id: string | null;
  subject_kind: "vendor" | "buyer" | null;
  subject_name: string | null;
  what_happened: string | null;
  amount_inr: number | null;
  incident_date: string | null;
  outcome: "warned" | "suspended" | "escalated_legal";
  account_status: string | null;
  decided_by_name: string | null;
  decided_at: string;
  withdrawn_at: string | null;
  report_purged_at: string | null;
}

const OUTCOME: Record<FindingRow["outcome"], { label: string; tone: Tone }> = {
  warned: { label: "Warned", tone: "caution" },
  suspended: { label: "Suspended", tone: "critical" },
  escalated_legal: { label: "Sent to legal", tone: "critical" },
};

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function FraudRecordsPanel() {
  const findings = useQuery({
    queryKey: ["support", "fraud-findings"],
    queryFn: async (): Promise<FindingRow[]> => {
      const { data, error } = await supabase.rpc("admin_fraud_findings", { p_limit: 200 });
      // PGRST202: the P6 migration isn't applied yet. Say so instead of failing the page.
      if (error?.code === "PGRST202") return [];
      if (error) throw new Error(error.message);
      return (data ?? []) as FindingRow[];
    },
  });

  return (
    <Panel
      title="Confirmed fraud"
      description="One line per report decided as fraud. It stays after the report itself is deleted, a year after it was filed. A decision changed to “no action” is marked withdrawn."
    >
      {findings.isPending ? (
        <SkeletonList rows={2} height="h-10" />
      ) : findings.error ? (
        <ErrorNote message={(findings.error as Error).message} />
      ) : (findings.data ?? []).length === 0 ? (
        <Empty>No report has been decided as fraud yet.</Empty>
      ) : (
        <Table head={["Decided", "Who", "What they did", "Outcome", "Account then", "Report"]}>
          {(findings.data ?? []).map((f) => (
            <tr key={f.id} className={f.withdrawn_at ? `opacity-60 ${ROW_HOVER}` : ROW_HOVER}>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-muted">
                {format(new Date(f.decided_at), "d MMM yyyy")}
                <div className="text-ink-ghost">{f.decided_by_name ?? "—"}</div>
              </td>
              <td className="px-3 py-2">
                <div className="text-ink">{f.subject_name ?? <span className="text-ink-ghost">not named</span>}</div>
                <div className="text-xs text-ink-faint">
                  {f.subject_kind === "vendor" ? "Vendor" : f.subject_kind === "buyer" ? "Buyer" : "Not linked to an account"}
                </div>
              </td>
              <td className="max-w-sm px-3 py-2 text-xs text-ink-muted">
                <p className="line-clamp-3">{f.what_happened ?? "No note was written."}</p>
                {(f.amount_inr != null || f.incident_date) && (
                  <p className="mt-0.5 text-ink-faint">
                    {[f.amount_inr != null ? INR.format(f.amount_inr) : null, f.incident_date ? format(new Date(f.incident_date), "d MMM yyyy") : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </td>
              <td className="px-3 py-2">
                <Badge tone={OUTCOME[f.outcome].tone}>{OUTCOME[f.outcome].label}</Badge>
                {f.withdrawn_at && <div className="mt-1 text-2xs text-ink-faint">withdrawn {format(new Date(f.withdrawn_at), "d MMM")}</div>}
              </td>
              <td className="px-3 py-2 text-xs text-ink-muted">{f.account_status ?? "—"}</td>
              <td className="px-3 py-2 text-xs font-mono text-ink-muted">
                {f.ticket_no}
                <div className="font-sans text-ink-faint">
                  {f.report_purged_at ? `deleted ${format(new Date(f.report_purged_at), "d MMM yyyy")}` : "kept a year from filing"}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}
