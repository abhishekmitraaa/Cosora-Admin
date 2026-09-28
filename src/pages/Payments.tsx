import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { inrFromPaise } from "@/lib/money";
import {
  KIND_LABELS,
  LATEST_COUNT,
  LATEST_REFRESH_MS,
  NO_FILTERS,
  STATUS_HELP,
  useLatestPayments,
  useLedger,
  usePaymentsSummary,
  type LedgerFilters,
  type LedgerKind,
  type LedgerRow,
  type LedgerStatus,
} from "@/lib/payments";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Note,
  Notice,
  Page,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  ROW_HOVER,
  Select,
  SkeletonList,
  Stack,
  Stat,
  StatusBadge,
  SubHeading,
  Table,
} from "@/components/ui";

/**
 * C2 - PAYMENTS LEDGER, from the database (admin completion Phase 5).
 *
 * Every row and total comes from admin_payments_ledger() / admin_payments_summary()
 * (src/lib/payments.ts). Filtering, search and paging run in the database, so the
 * page stays the same size however many payments there are, and its totals always
 * describe exactly the rows the filters select.
 *
 * roles.ts, section "payments": read super_admin/finance_admin/support, write
 * super_admin/finance_admin. Nothing on this page writes: refunds are on
 * Subscriptions, through admin-refund-payment.
 */

const ALL_KINDS = Object.keys(KIND_LABELS) as LedgerKind[];
const ALL_STATUSES = Object.keys(STATUS_HELP) as LedgerStatus[];
const SEARCH_DEBOUNCE_MS = 300;

export default function Payments() {
  const role = useRole();
  const writable = canWrite(role, "payments");

  const [draft, setDraft] = useState<LedgerFilters>(NO_FILTERS);
  // The search box asks the database once typing pauses, not on every key.
  const [filters, setFilters] = useState<LedgerFilters>(NO_FILTERS);
  useEffect(() => {
    const t = setTimeout(() => setFilters(draft), draft.search === filters.search ? 0 : SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, filters.search]);

  const ledger = useLedger(filters);
  const summary = usePaymentsSummary(filters);
  const rows = ledger.data?.pages.flat() ?? [];
  const s = summary.data;

  const filtersActive =
    Boolean(filters.search.trim()) || filters.kind !== "all" || filters.status !== "all" || Boolean(filters.from || filters.to);
  const scope = filtersActive ? "the filtered rows" : "all time";

  return (
    <Page width="wide">
      <PageHeader
        title="Payments"
        subtitle="Every money movement on Cosora in one ledger: subscription payments and refunds, unfinished checkouts, and ad and certificate orders."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "payments")} />}

      <Stack>
        <LatestStrip />

        {summary.error ? (
          <ErrorNote message={(summary.error as Error).message} />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Paid in"
              value={s ? inrFromPaise(s.paid_paise) : "…"}
              sub={s ? `${s.paid} payments, GST included · ${scope}` : undefined}
            />
            <Stat
              label="Refunded"
              value={s ? inrFromPaise(s.refunded_paise) : "…"}
              sub={s ? `${s.refunds} refund${s.refunds === 1 ? "" : "s"} · ${scope}` : undefined}
            />
            <Stat
              label="Unfinished checkouts"
              value={s ? String(s.pending + s.abandoned) : "…"}
              tone={s && s.pending > 0 ? "caution" : undefined}
              sub={s ? `${s.pending} pending, ${s.abandoned} abandoned` : undefined}
            />
            <Stat
              label="Needs attention"
              value={s ? String(s.failed + s.review) : "…"}
              tone={s && s.failed + s.review > 0 ? "critical" : undefined}
              sub={s ? `${s.failed} failed, ${s.review} paid but not fulfilled` : undefined}
            />
          </div>
        )}

        {s && s.unverified > 0 && (
          <Notice tone="caution" title={`${inrFromPaise(s.unverified_paise)} of "paid" has no gateway payment`}>
            {s.unverified} paid row{s.unverified === 1 ? " has" : "s have"} no Razorpay payment id: activations
            made in demo mode, not money received. Reports flags the same amount.
          </Notice>
        )}

        <Panel
          title="Ledger"
          description="Search matches a vendor's name, a Cosora reference (invoice number or order id) or a Razorpay id."
          actions={
            filtersActive && (
              <Button size="sm" onClick={() => setDraft(NO_FILTERS)}>
                Clear filters
              </Button>
            )
          }
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Search" htmlFor="txn-search" className="lg:col-span-2">
              <Input
                id="txn-search"
                value={draft.search}
                placeholder="Vendor, INV- number, order or Razorpay id"
                onChange={(e) => setDraft({ ...draft, search: e.target.value })}
              />
            </Field>
            <Field label="Type" htmlFor="txn-kind">
              <Select
                id="txn-kind"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as LedgerKind | "all" })}
              >
                <option value="all">All types</option>
                {ALL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="txn-status">
              <Select
                id="txn-status"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as LedgerStatus | "all" })}
              >
                <option value="all">All statuses</option>
                {ALL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From" htmlFor="txn-from">
                <Input id="txn-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </Field>
              <Field label="To" htmlFor="txn-to">
                <Input id="txn-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
              </Field>
            </div>
          </div>

          {ledger.isPending ? (
            <SkeletonList rows={4} height="h-10" />
          ) : ledger.error ? (
            <ErrorNote message={(ledger.error as Error).message} />
          ) : rows.length === 0 ? (
            <Empty>{filtersActive ? "No payment matches these filters." : "No payments yet."}</Empty>
          ) : (
            <>
              <Table head={["Reference", "Vendor", "Type", "Amount", "GST", "Status", "Gateway id", "When"]}>
                {rows.map((t) => (
                  <LedgerLine key={t.entry_key} row={t} />
                ))}
              </Table>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <Note>
                  Showing {rows.length}
                  {s ? ` of ${s.entries}` : ""}. Dates are IST days. Amounts include GST where a GST column shows one.
                </Note>
                {ledger.hasNextPage && (
                  <Button size="sm" disabled={ledger.isFetchingNextPage} onClick={() => void ledger.fetchNextPage()}>
                    {ledger.isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                )}
              </div>
            </>
          )}

          <details className="mt-4 text-2xs text-ink-faint">
            <summary className="cursor-pointer">What the statuses mean</summary>
            <ul className="mt-2 space-y-1">
              {ALL_STATUSES.map((st) => (
                <li key={st}>
                  <StatusBadge status={st} dot={false} /> {STATUS_HELP[st]}
                </li>
              ))}
            </ul>
          </details>
        </Panel>
      </Stack>
    </Page>
  );
}

function LedgerLine({ row: t }: { row: LedgerRow }) {
  const kind = t.kind as LedgerKind;
  return (
    <tr className={ROW_HOVER}>
      <td className="px-3 py-2">
        <span className="font-mono text-xs text-ink">{t.reference}</span>
        <span className="block max-w-[16rem] truncate text-2xs text-ink-faint" title={t.detail}>
          {t.detail}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="font-medium text-ink">{t.vendor_name ?? "Unknown vendor"}</span>
        {t.vendor_city && <span className="block text-2xs text-ink-faint">{t.vendor_city}</span>}
      </td>
      <td className="px-3 py-2">
        <Badge tone={kind === "refund" ? "info" : "neutral"}>{KIND_LABELS[kind] ?? t.kind}</Badge>
        {t.includes_certificate && kind !== "certificate" && (
          <span className="mt-1 block text-2xs text-ink-faint">includes certificate</span>
        )}
      </td>
      <td className={`px-3 py-2 tabular-nums ${t.total_paise < 0 ? "text-info-fg" : "text-ink"}`}>
        {inrFromPaise(t.total_paise)}
      </td>
      <td className="px-3 py-2 tabular-nums text-ink-muted">
        {t.gst_paise === null ? <span className="text-ink-ghost">—</span> : inrFromPaise(t.gst_paise)}
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={t.status} />
      </td>
      <td className="px-3 py-2 font-mono text-2xs text-ink-faint">
        {t.gateway_ref ?? (
          <span className="font-sans text-ink-ghost">
            {t.status === "paid" ? "no gateway payment (demo mode)" : "none"}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-2xs tabular-nums text-ink-faint">
        {format(new Date(t.occurred_at), "d MMM yyyy, HH:mm")}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ *
 * The Latest strip
 * ------------------------------------------------------------------ */

/**
 * THE MOST RECENT ROWS, ASKED FOR AGAIN EVERY 30 SECONDS.
 *
 * Polling, not a push: the chip says exactly that and when it last asked.
 * React Query pauses the timer while the tab is hidden. No animation and no
 * "new payment" pulse: an admin reads a ticker as money arriving right now, and
 * this shows what the database held at the last refresh, nothing more.
 */
function LatestStrip() {
  const latest = useLatestPayments();
  const rows = latest.data ?? [];

  if (latest.error) return <ErrorNote message={(latest.error as Error).message} />;
  if (!latest.isPending && rows.length === 0) return null;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SubHeading>Latest {LATEST_COUNT}</SubHeading>
        <Badge tone="neutral">
          refreshes every {LATEST_REFRESH_MS / 1000} s while this tab is open
          {latest.dataUpdatedAt ? ` · updated ${format(new Date(latest.dataUpdatedAt), "HH:mm:ss")}` : ""}
        </Badge>
      </div>

      {latest.isPending ? (
        <SkeletonList rows={1} height="h-20" />
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {rows.map((t) => (
            <div key={t.entry_key} className="w-52 shrink-0 rounded-lg border border-line bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-xs font-medium text-ink">{t.vendor_name ?? "Unknown vendor"}</span>
                <StatusBadge status={t.status} dot={false} />
              </div>
              <div className="mt-1.5 font-display text-base font-bold tabular-nums text-ink">
                {inrFromPaise(t.total_paise)}
              </div>
              <div className="mt-0.5 text-2xs text-ink-faint">
                {KIND_LABELS[t.kind as LedgerKind] ?? t.kind} ·{" "}
                {formatDistanceToNow(new Date(t.occurred_at), { addSuffix: true })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
