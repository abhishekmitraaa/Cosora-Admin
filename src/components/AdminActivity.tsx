import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { ROLE_LABELS, type AdminRole } from "@/lib/roles";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Note,
  ROW_HOVER,
  Select,
  SkeletonList,
  Table,
} from "@/components/ui";

/**
 * The Admin Log's Activity tab (2026-10-13): what each admin looked at.
 *
 * Two reads, both for super admins and managers only (the database refuses everyone else):
 *   admin_activity_summary(days)  one row per active admin: pages, records, changes, sign-ins;
 *   admin_activity_list(actor…)   the views themselves, newest first.
 * Rows are written by admin_activity_record() as admins move through the panel (lib/activity.ts).
 * Page visits older than 180 days are deleted by a daily job; record views are kept.
 */

const PAGE = 100;

type ViewRow = {
  id: number;
  at: string;
  actor_id: string;
  actor_role: string | null;
  actor_name: string | null;
  kind: string;
  path: string;
  target_table: string | null;
  target_id: string | null;
  label: string | null;
};

/** What a record's table is called here. */
const RECORDS: Record<string, string> = {
  "public.vendor_profiles": "Vendor",
  "public.support_tickets": "Support request",
  "public.conversations": "Chat",
};

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const when = (at: string | null) => (at ? `${IST.format(new Date(at))} IST` : "Never");
const roleLabel = (r: string | null) => (r && r in ROLE_LABELS ? ROLE_LABELS[r as AdminRole] : r ?? "");

export default function AdminActivity() {
  const [days, setDays] = useState(30);
  const [actor, setActor] = useState("");
  const [kind, setKind] = useState("");

  const summary = useQuery({
    queryKey: ["admin-activity", "summary", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_activity_summary", { p_days: days });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const views = useInfiniteQuery({
    queryKey: ["admin-activity", "views", actor, kind],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("admin_activity_list", {
        p_actor: actor || undefined,
        p_kind: kind || undefined,
        p_before: pageParam,
        p_limit: PAGE,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ViewRow[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].at : undefined),
  });

  const rows = views.data?.pages.flat() ?? [];
  const people = summary.data ?? [];

  return (
    <>
      <Note className="mb-4">
        Pages opened and records opened in this panel, by admin. A page opened again within a minute
        counts once. Page visits are kept for 180 days; records opened, and everything on the Changes
        tab, are kept. Times are IST.
      </Note>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Summary period" htmlFor="activity-days">
            <Select id="activity-days" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="180">Last 180 days</option>
            </Select>
          </Field>
        </div>
      </Card>

      {summary.isLoading ? (
        <SkeletonList rows={3} height="h-12" />
      ) : summary.error ? (
        <ErrorNote message={(summary.error as Error).message} />
      ) : people.length === 0 ? (
        <Empty>No active admins.</Empty>
      ) : (
        <div className="mb-6">
          <Table head={["Admin", "Pages opened", "Records opened", "Changes made", "Sign-ins", "Last seen (IST)", ""]}>
            {people.map((p) => (
              <tr key={p.actor_id} className={ROW_HOVER} data-activity-admin={p.actor_id}>
                <td className="px-3 py-2">
                  <div className="font-medium text-ink">{p.actor_name ?? p.actor_id.slice(0, 8)}</div>
                  <div className="text-2xs text-ink-muted">{roleLabel(p.actor_role)}</div>
                </td>
                <td className="px-3 py-2 tabular-nums">{p.pages}</td>
                <td className="px-3 py-2 tabular-nums">{p.records}</td>
                <td className="px-3 py-2 tabular-nums">{p.changes}</td>
                <td className="px-3 py-2 tabular-nums">{p.sign_ins}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-muted">{when(p.last_seen)}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" onClick={() => setActor(p.actor_id)} disabled={actor === p.actor_id}>
                    {actor === p.actor_id ? "Showing" : "See activity"}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Admin" htmlFor="activity-actor">
            <Select id="activity-actor" value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p.actor_id} value={p.actor_id}>
                  {p.actor_name ?? p.actor_id.slice(0, 8)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kind" htmlFor="activity-kind">
            <Select id="activity-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Pages and records</option>
              <option value="page">Pages opened</option>
              <option value="record">Records opened</option>
            </Select>
          </Field>
        </div>
      </Card>

      {views.isLoading ? (
        <SkeletonList rows={3} height="h-12" />
      ) : views.error ? (
        <ErrorNote message={(views.error as Error).message} />
      ) : rows.length === 0 ? (
        <Empty>{actor || kind ? "Nothing matches these filters." : "No activity has been recorded yet."}</Empty>
      ) : (
        <Card padded={false}>
          <Table head={["When (IST)", "Admin", "Opened", "Where"]}>
            {rows.map((r) => (
              <tr key={r.id} className={ROW_HOVER} data-activity-id={r.id}>
                <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums text-ink-muted">{when(r.at)}</td>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-ink">{r.actor_name ?? "Unknown admin"}</div>
                  <div className="text-2xs text-ink-muted">{roleLabel(r.actor_role)}</div>
                </td>
                <td className="px-3 py-2 align-top">
                  {r.kind === "record" ? (
                    <>
                      <Badge tone="info">{RECORDS[r.target_table ?? ""] ?? r.target_table ?? "Record"}</Badge>
                      <div className="mt-0.5 break-all text-xs text-ink">{r.label ?? r.target_id}</div>
                    </>
                  ) : (
                    <Badge tone="neutral">Page</Badge>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <Link to={r.path} className="break-all font-mono text-2xs text-ink underline-offset-2 hover:underline">
                    {r.path}
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
          {views.hasNextPage && (
            <div className="border-t border-line p-3 text-center">
              <Button size="sm" onClick={() => void views.fetchNextPage()} disabled={views.isFetchingNextPage}>
                {views.isFetchingNextPage ? "Loading…" : "Load older activity"}
              </Button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
