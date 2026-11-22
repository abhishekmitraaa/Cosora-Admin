import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { inrFromPaise } from "@/lib/money";
import {
  KIND_LABELS,
  LATEST_COUNT,
  LATEST_REFRESH_MS,
  MODE_LABELS,
  NO_FILTERS,
  STATUS_HELP,
  refundAdOrder,
  resolveAdOrder,
  useLatestPayments,
  useLedger,
  usePaymentsSummary,
  type LedgerFilters,
  type LedgerKind,
  type LedgerRow,
  type LedgerStatus,
  type MoneyMode,
} from "@/lib/payments";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
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
  Textarea,
} from "@/components/ui";
import { useUrlFilters } from "@/hooks/useUrlState";

/**
 * C2 - PAYMENTS LEDGER, from the database (admin completion Phase 5).
 *
 * Every row and total comes from admin_payments_ledger() / admin_payments_summary()
 * (src/lib/payments.ts). Filtering, search and paging run in the database, so the
 * page stays the same size however many payments there are, and its totals always
 * describe exactly the rows the filters select.
 *
 * roles.ts, section "payments": read super_admin/finance_admin/support, write
 * super_admin/finance_admin. Its only writes are ad-order refunds and "no refund needed" (AR-H15); plan refunds are on
 * Subscriptions, through admin-refund-payment.
 */

const ALL_KINDS = Object.keys(KIND_LABELS) as LedgerKind[];
const ALL_STATUSES = Object.keys(STATUS_HELP) as LedgerStatus[];
const SEARCH_DEBOUNCE_MS = 300;

export default function Payments() {
  const role = useRole();
  const writable = canWrite(role, "payments");

  // The applied filters live in the address (AR-M04); the box shows the draft while typing.
  const [filters, setFilters] = useUrlFilters<LedgerFilters>(NO_FILTERS);
  // The search box asks the database once typing pauses, not on every key.
  const [draft, setDraft] = useState<LedgerFilters>(filters);
  useEffect(() => {
    const t = setTimeout(() => setFilters(draft), draft.search === filters.search ? 0 : SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, filters.search]);

  const ledger = useLedger(filters);
  const summary = usePaymentsSummary(filters);
  const rows = ledger.data?.pages.flat() ?? [];
  const s = summary.data;

  const filtersActive =
    Boolean(filters.search.trim()) || filters.kind !== "all" || filters.status !== "all" || (filters.mode ?? "all") !== "all" ||
    Boolean(filters.from || filters.to);
  const scope = filtersActive ? "the filtered rows" : "all time";

  // A paid ad order: refund it through Razorpay, or (when flagged) mark that no refund is needed (AR-H15).
  const qc = useQueryClient();
  const [adAction, setAdAction] = useState<{ kind: "refund" | "resolve"; row: LedgerRow } | null>(null);
  const [adAmount, setAdAmount] = useState("");
  const [adNote, setAdNote] = useState("");
  const refreshPayments = () => {
    for (const key of ["payments-ledger", "payments-summary", "payments-latest", "reports"]) void qc.invalidateQueries({ queryKey: [key] });
  };
  const adRefund = useMutation({
    mutationFn: async () => {
      if (!adAction) return null;
      if (adAction.kind === "resolve") {
        await resolveAdOrder(adAction.row.source_id, adNote.trim());
        return null;
      }
      const rupees = Number(adAmount);
      const paise = adAmount.trim() === "" ? undefined : Math.round(rupees * 100);
      if (paise !== undefined && (!Number.isFinite(rupees) || paise <= 0)) throw new Error("Enter an amount in rupees, or leave it blank for the whole order.");
      return await refundAdOrder(adAction.row.source_id, paise, adNote.trim() || undefined);
    },
    onSuccess: (r) => {
      if (r) {
        if (r.refundStatus === "failed") toast.error(`Razorpay refused the refund (${r.refundId}). Nothing was refunded; you can try again.`);
        else if (r.recorded === false) toast.warning(`Razorpay took the refund (${r.refundId}) but the order wasn't updated. Don't refund it again: Razorpay's confirmation will finish it.`, { duration: 15000 });
        else toast.success(`Refund ${r.refundStatus === "processed" ? "processed" : "accepted"} by Razorpay (${r.refundId})`);
      } else {
        toast.success("Marked: no refund needed. Recorded in the Admin Log.");
      }
      setAdAction(null);
      refreshPayments();
    },
    onError: (e: Error) => toast.error(e.message, { duration: 10000 }),
  });
  const openAdAction = (kind: "refund" | "resolve", row: LedgerRow) => {
    setAdAmount("");
    setAdNote("");
    setAdAction({ kind, row });
  };

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
              sub={s ? `${s.paid} live payments, GST included · ${scope}` : undefined}
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
              sub={s ? `${s.failed} failed, ${s.review} waiting for a refund decision` : undefined}
            />
          </div>
        )}

        {s && s.discounted > 0 && (
          <Note>
            {s.discounted} paid {s.discounted === 1 ? "order" : "orders"} used a discount code, {inrFromPaise(s.discounts_paise)} off
            in total ({scope}). Every amount here is what was charged, after the discount.
          </Note>
        )}

        {/* AR-H13 (Mitra: "Exclude, show separately"): test-key and demo payments moved no money, so they are outside
            the totals and said here once. Reports does the same. */}
        {s && (s.test > 0 || s.demo > 0) && (
          <Notice tone="info" title="Not counted: payments that moved no money">
            {s.test > 0 && `${inrFromPaise(s.test_paise)} in ${s.test} Razorpay test payment${s.test === 1 ? "" : "s"}`}
            {s.test > 0 && s.demo > 0 && " and "}
            {s.demo > 0 && `${inrFromPaise(s.demo_paise)} in ${s.demo} demo checkout${s.demo === 1 ? "" : "s"}`} ({scope}). Use the
            Money filter to see them.
          </Notice>
        )}

        <Panel
          title="Ledger"
          description="Search matches a vendor's name, a Cosora reference (invoice number or order id), a Razorpay id or a discount code."
          actions={
            filtersActive && (
              <Button size="sm" onClick={() => setDraft(NO_FILTERS)}>
                Clear filters
              </Button>
            )
          }
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
            <Field label="Money" htmlFor="txn-mode">
              <Select
                id="txn-mode"
                value={draft.mode ?? "all"}
                onChange={(e) => setDraft({ ...draft, mode: e.target.value as MoneyMode | "all" })}
              >
                <option value="all">All money</option>
                {(Object.keys(MODE_LABELS) as MoneyMode[]).map((m) => (
                  <option key={m} value={m}>{MODE_LABELS[m]}</option>
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
              <Table head={["Reference", "Vendor", "Type", "Amount", "GST", "Status", "Gateway id", "When", ""]}>
                {rows.map((t) => (
                  <LedgerLine key={t.entry_key} row={t} writable={writable} onAdAction={openAdAction} />
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

      <Modal
        open={adAction !== null}
        title={adAction?.kind === "resolve" ? "No refund needed" : `Refund ad order ${adAction?.row.reference ?? ""}`}
        onClose={() => setAdAction(null)}
      >
        {adAction && (
          <>
            <Note className="mb-3">
              {adAction.kind === "resolve"
                ? "The order goes back to paid and leaves Needs attention. Say why: it goes into the Admin Log."
                : `${adAction.row.vendor_name ?? "The seller"} paid ${inrFromPaise(adAction.row.total_paise)}. Razorpay refunds it to the card or account they paid with; the seller is told, and the Admin Log records it.`}
            </Note>
            {adAction.kind === "refund" && (
              <Field label="Amount (₹)" htmlFor="ad-refund-amount" hint="Leave blank to refund the whole order.">
                <Input id="ad-refund-amount" inputMode="decimal" value={adAmount} onChange={(e) => setAdAmount(e.target.value)}
                  placeholder={(adAction.row.total_paise / 100).toFixed(2)} />
              </Field>
            )}
            <Field label={adAction.kind === "resolve" ? "Why no refund is needed" : "Note (optional)"} htmlFor="ad-refund-note" className="mt-3">
              <Textarea id="ad-refund-note" rows={3} value={adNote} onChange={(e) => setAdNote(e.target.value)} />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setAdAction(null)}>Cancel</Button>
              <Button
                variant={adAction.kind === "refund" ? "danger" : "primary"}
                disabled={adRefund.isPending || (adAction.kind === "resolve" && adNote.trim().length < 3)}
                onClick={() => adRefund.mutate()}
              >
                {adRefund.isPending ? "Working…" : adAction.kind === "refund" ? "Refund through Razorpay" : "Mark no refund needed"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </Page>
  );
}

function LedgerLine({
  row: t,
  writable,
  onAdAction,
}: {
  row: LedgerRow;
  writable: boolean;
  onAdAction: (kind: "refund" | "resolve", row: LedgerRow) => void;
}) {
  const kind = t.kind as LedgerKind;
  // A paid ad order, through Razorpay (not a ₹0 or demo one): refundable here (AR-H15).
  const adOrder = t.source_table === "ad_orders" && kind !== "refund" && /^order_/.test(t.source_id);
  const canAct = writable && adOrder && (t.status === "paid" || t.status === "review") && t.payment_mode !== "demo";
  const mode = t.payment_mode;
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
        {(t.discount_paise ?? 0) > 0 && (
          <span className="mt-0.5 block text-2xs text-ink-faint" title="Already taken off the amount">
            {inrFromPaise(t.discount_paise!)} off with <span className="font-mono">{t.discount_code}</span>
          </span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums text-ink-muted">
        {t.gst_paise === null ? <span className="text-ink-faint">—</span> : inrFromPaise(t.gst_paise)}
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={t.status} />
        {mode && mode !== "live" && (
          <span className="mt-1 block">
            <Badge tone={mode === "test" ? "info" : "caution"}>{mode}</Badge>
          </span>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-2xs text-ink-faint">
        {t.gateway_ref ?? (
          <span className="font-sans text-ink-faint">
            {t.status === "paid" && t.payment_mode === "demo" ? "no gateway payment (demo mode)" : "none"}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-2xs tabular-nums text-ink-faint">
        {format(new Date(t.occurred_at), "d MMM yyyy, HH:mm")}
      </td>
      <td className="px-3 py-2">
        {canAct && (
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="danger" onClick={() => onAdAction("refund", t)}>Refund</Button>
            {t.status === "review" && (
              <Button size="sm" onClick={() => onAdAction("resolve", t)}>No refund needed</Button>
            )}
          </div>
        )}
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
