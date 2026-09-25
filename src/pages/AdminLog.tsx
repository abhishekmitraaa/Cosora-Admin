import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ROLE_LABELS, type AdminRole } from "@/lib/roles";
import type { Json } from "@/lib/database.types";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Note,
  Page,
  PageHeader,
  ROW_HOVER,
  Select,
  SkeletonList,
  Table,
  type Tone,
} from "@/components/ui";

/**
 * The Admin Log (MPF-26, 2026-09-25): every change an admin makes and every
 * sign-in to this panel, with date and time. Readable by super_admin and manager
 * only; admin_audit_log_list() enforces that in the database.
 *
 * Rows come from admin.audit_log, which the database writes itself: a trigger on
 * each table the panel changes records the admin who made the change, whatever
 * page or RPC made it, and the two edge functions (invites, refunds) record
 * themselves. Nobody can edit or delete a row, including from here.
 */

const PAGE = 100;

type LogRow = {
  id: number;
  at: string;
  actor_id: string | null;
  actor_role: AdminRole | null;
  actor_name: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  own_row: boolean;
  changes: Json;
  source: string;
};

/** What each audited table is called here. */
const AREAS: Record<string, string> = {
  "public.faqs": "FAQ",
  "public.profiles": "Account status",
  "admin.account_suspensions": "Suspension record",
  "public.conversations": "Chat",
  "admin.conversation_reviews": "Chat review",
  "public.vendor_documents": "KYC document",
  "public.advertisements": "Ad campaign",
  "public.certificate_orders": "Certificate order",
  "public.products": "Product",
  "public.product_videos": "Video Closeup",
  "public.catalogues": "Catalogue",
  "admin.admin_users": "Admin access",
  "admin.keyword_blocklist": "Keyword blocklist",
  "admin.flag_patterns": "Flag pattern",
  "admin.admin_flags": "Flag",
  "admin.chat_block_reasons": "Block reason",
  "public.vendor_profiles": "Vendor profile",
  "public.vendor_subscriptions": "Subscription",
  "public.subscription_invoices": "Invoice (refund)",
};

const ACTIONS: Record<string, { label: string; tone: Tone }> = {
  insert: { label: "Created", tone: "positive" },
  update: { label: "Changed", tone: "info" },
  delete: { label: "Deleted", tone: "critical" },
  sign_in: { label: "Signed in", tone: "neutral" },
  sign_out: { label: "Signed out", tone: "neutral" },
  invite: { label: "Invited", tone: "positive" },
  refund: { label: "Refund", tone: "caution" },
};

// Fields worth naming first when a whole row was created or deleted.
const KEY_FIELDS = [
  "question", "term", "pattern", "label", "reason", "note", "title", "name", "brand_name",
  "status", "admin_role", "is_active", "account_status", "doc_type", "verified", "surface",
  "email", "outcome", "refund_status", "amount_paise",
];

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function when(at: string): string {
  return `${IST.format(new Date(at))} IST`;
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  const s = JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

function asObject(j: Json): Record<string, unknown> {
  return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
}

/** One line per change: "field: before → after" for an update, the key fields otherwise. */
function Details({ row }: { row: LogRow }) {
  const c = asObject(row.changes);
  if (row.action === "sign_in") return <span className="text-ink-muted">Signed in to the admin panel</span>;
  if (row.action === "sign_out") return <span className="text-ink-muted">Signed out of the admin panel</span>;

  let lines: string[];
  if (row.action === "update") {
    lines = Object.entries(c).map(([k, v]) => {
      const d = asObject(v as Json);
      return `${k}: ${show(d.from)} → ${show(d.to)}`;
    });
  } else {
    const keys = [...KEY_FIELDS.filter((k) => k in c), ...Object.keys(c).filter((k) => !KEY_FIELDS.includes(k))];
    lines = keys.slice(0, 4).map((k) => `${k}: ${show(c[k])}`);
    const rest = Object.keys(c).length - lines.length;
    if (rest > 0) lines.push(`and ${rest} more field${rest === 1 ? "" : "s"}`);
  }

  return (
    <div className="space-y-0.5">
      {lines.map((l) => (
        <div key={l} className="break-words font-mono text-2xs text-ink">{l}</div>
      ))}
      <details className="text-2xs text-ink-muted">
        <summary className="cursor-pointer select-none">Full record</summary>
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-2 p-2">
          {JSON.stringify(row.changes, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default function AdminLog() {
  const [actor, setActor] = useState("");
  const [area, setArea] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const actors = useQuery({
    queryKey: ["admin-log", "actors"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_audit_log_actors");
      if (error) throw new Error(error.message);
      return (data ?? []).slice().sort((a, b) => (a.actor_name ?? "").localeCompare(b.actor_name ?? ""));
    },
  });

  // Dates are picked in IST and sent as the start of that day and of the day after.
  const filters = useMemo(() => ({
    p_actor: actor || undefined,
    p_table: area || undefined,
    p_action: action || undefined,
    p_from: from ? new Date(`${from}T00:00:00+05:30`).toISOString() : undefined,
    p_to: to ? new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString() : undefined,
  }), [actor, area, action, from, to]);

  const log = useInfiniteQuery({
    queryKey: ["admin-log", "rows", filters],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("admin_audit_log_list", {
        ...filters,
        p_before_id: pageParam,
        p_limit: PAGE,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as LogRow[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].id : undefined),
  });

  const rows = log.data?.pages.flat() ?? [];
  const filtered = Boolean(actor || area || action || from || to);

  return (
    <Page width="wide">
      <PageHeader
        title="Admin Log"
        subtitle="Every change an admin makes in this panel, and every sign-in and sign-out, with date and time."
      />

      <Note className="mb-4">
        Written by the database, not by this page: each table the panel changes records the admin
        who made the change and what it was before, whichever page made it. Invites and refunds record
        themselves. Rows can&rsquo;t be edited or deleted by anyone. Times are IST.
      </Note>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Admin" htmlFor="log-actor">
            <Select id="log-actor" value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="">Everyone</option>
              {(actors.data ?? []).map((a) => (
                <option key={a.actor_id} value={a.actor_id}>
                  {a.actor_name ?? a.actor_id.slice(0, 8)}
                  {a.actor_role ? ` (${ROLE_LABELS[a.actor_role]})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Area" htmlFor="log-area">
            <Select id="log-area" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">All areas</option>
              {Object.entries(AREAS).map(([t, label]) => (
                <option key={t} value={t}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Action" htmlFor="log-action">
            <Select id="log-action" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {Object.entries(ACTIONS).map(([a, { label }]) => (
                <option key={a} value={a}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="From" htmlFor="log-from">
            <Input id="log-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="log-to">
            <Input id="log-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        {filtered && (
          <div className="mt-3">
            <Button size="sm" onClick={() => { setActor(""); setArea(""); setAction(""); setFrom(""); setTo(""); }}>
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      {log.isLoading ? (
        <SkeletonList rows={3} height="h-16" />
      ) : log.error ? (
        <ErrorNote message={(log.error as Error).message} />
      ) : rows.length === 0 ? (
        <Empty>{filtered ? "No entries match these filters." : "Nothing has been logged yet."}</Empty>
      ) : (
        <Card padded={false}>
          <Table head={["When (IST)", "Admin", "Action", "What", "Details"]}>
            {rows.map((r) => {
              const act = ACTIONS[r.action] ?? { label: r.action, tone: "neutral" as Tone };
              return (
                <tr key={r.id} className={ROW_HOVER} data-log-id={r.id}>
                  <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums text-ink-muted">{when(r.at)}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-ink">{r.actor_name ?? "Unknown admin"}</div>
                    {r.actor_role && <div className="text-2xs text-ink-muted">{ROLE_LABELS[r.actor_role]}</div>}
                  </td>
                  <td className="px-3 py-2 align-top"><Badge tone={act.tone}>{act.label}</Badge></td>
                  <td className="px-3 py-2 align-top">
                    {r.target_table ? (
                      <>
                        <div className="text-ink">{AREAS[r.target_table] ?? r.target_table}</div>
                        {r.target_id && <div className="font-mono text-2xs text-ink-muted">{r.target_id.slice(0, 8)}</div>}
                        {r.own_row && <div className="mt-0.5"><Badge tone="caution">their own</Badge></div>}
                      </>
                    ) : (
                      <span className="text-ink-muted">Admin panel</span>
                    )}
                  </td>
                  <td className="max-w-md px-3 py-2 align-top"><Details row={r} /></td>
                </tr>
              );
            })}
          </Table>
          {log.hasNextPage && (
            <div className="border-t border-line p-3 text-center">
              <Button size="sm" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>
                {log.isFetchingNextPage ? "Loading…" : "Load older entries"}
              </Button>
            </div>
          )}
        </Card>
      )}
    </Page>
  );
}
