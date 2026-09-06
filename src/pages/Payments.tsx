import { useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { SEED_ACTIVE, useDevSeed } from "@/lib/devSeed/store";
import {
  inrFromPaise,
  KIND_LABELS,
  transactionStore,
  type Transaction,
  type TxnKind,
  type TxnStatus,
} from "@/lib/devSeed/payments";
import {
  Badge,
  Button,
  Card,
  DevSeedBanner,
  Empty,
  Field,
  Input,
  Note,
  Page,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  ROW_HOVER,
  Select,
  Stack,
  Stat,
  StatusBadge,
  SubHeading,
  Table,
} from "@/components/ui";

/**
 * C2 - PAYMENTS LEDGER. DEV-SEED DATA. Nothing here reads or writes Supabase.
 *
 * `reports` keeps its KPI view unchanged; this is the row-level ledger beside
 * it. See src/lib/devSeed/payments.ts for why the rows are seeded rather than
 * derived from `subscription_invoices` and `ad_orders` (two tables, two
 * currency units, two status vocabularies, and Reports already normalises them
 * one particular way).
 *
 * roles.ts, section "payments": read super_admin/finance_admin/support, write
 * super_admin/finance_admin. Nothing on this page writes yet, so the write gate
 * is declared for Phase 2 rather than exercised.
 */

const ALL_KINDS = Object.keys(KIND_LABELS) as TxnKind[];
const STATUSES: TxnStatus[] = ["paid", "pending", "failed", "refunded"];

/** How many rows the Live strip holds. Named because the copy quotes it. */
const LIVE_WINDOW = 20;

export default function Payments() {
  const role = useRole();
  const writable = canWrite(role, "payments");
  const rows = useDevSeed(transactionStore);

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<TxnKind | "all">("all");
  const [status, setStatus] = useState<TxnStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // An empty date input is "no bound", not "the epoch". Parsing "" would
    // produce NaN and silently filter everything out.
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;

    return rows
      .filter((t) => {
        if (kind !== "all" && t.kind !== kind) return false;
        if (status !== "all" && t.status !== status) return false;
        const at = new Date(t.occurredAt).getTime();
        if (fromMs !== null && at < fromMs) return false;
        if (toMs !== null && at > toMs) return false;
        if (!q) return true;
        return (
          t.vendorName.toLowerCase().includes(q) ||
          t.vendorCity.toLowerCase().includes(q) ||
          t.reference.toLowerCase().includes(q) ||
          (t.gatewayRef ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [rows, query, kind, status, from, to]);

  const filtersActive = Boolean(query.trim() || kind !== "all" || status !== "all" || from || to);

  // Totals describe the FILTERED set, and the caption says so. A total that
  // silently covers everything while the table shows a subset is how a finance
  // screen gets quoted wrongly in a meeting.
  const settled = filtered.filter((t) => t.status === "paid" || t.status === "refunded");
  const netPaise = settled.reduce((s, t) => s + t.amountPaise + t.gstPaise, 0);
  const failedCount = filtered.filter((t) => t.status === "failed").length;
  const pendingCount = filtered.filter((t) => t.status === "pending").length;

  return (
    <Page width="wide">
      <PageHeader
        title="Payments"
        subtitle="Every money movement on Cosora, in one row-level ledger."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "payments")} />}
      {SEED_ACTIVE && <DevSeedBanner what="The payments ledger" />}

      <Stack>
        <LiveStrip rows={rows} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Net settled"
            value={inrFromPaise(netPaise)}
            sub={filtersActive ? "across the filtered rows" : "across all rows, GST included"}
          />
          <Stat label="Transactions" value={String(filtered.length)} sub={filtersActive ? `of ${rows.length}` : "all time"} />
          <Stat
            label="Pending"
            value={String(pendingCount)}
            tone={pendingCount > 0 ? "caution" : undefined}
            sub="awaiting gateway confirmation"
          />
          <Stat
            label="Failed"
            value={String(failedCount)}
            tone={failedCount > 0 ? "critical" : undefined}
            sub="no money moved"
          />
        </div>

        <Panel
          title="Ledger"
          description="Search matches a vendor, a city, a Cosora reference or a Razorpay id."
          actions={
            filtersActive && (
              <Button
                size="sm"
                onClick={() => {
                  setQuery("");
                  setKind("all");
                  setStatus("all");
                  setFrom("");
                  setTo("");
                }}
              >
                Clear filters
              </Button>
            )
          }
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Search" htmlFor="txn-search" className="lg:col-span-2">
              <Input
                id="txn-search"
                value={query}
                placeholder="Vendor, city, CSR reference or Razorpay id"
                onChange={(e) => setQuery(e.target.value)}
              />
            </Field>
            <Field label="Type" htmlFor="txn-kind">
              <Select id="txn-kind" value={kind} onChange={(e) => setKind(e.target.value as TxnKind | "all")}>
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
                value={status}
                onChange={(e) => setStatus(e.target.value as TxnStatus | "all")}
              >
                <option value="all">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From" htmlFor="txn-from">
                <Input id="txn-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To" htmlFor="txn-to">
                <Input id="txn-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
          </div>

          {filtered.length === 0 ? (
            <Empty>
              {rows.length === 0
                ? "No transactions. In a production build this ledger is empty because the transactions table does not exist yet."
                : "No transaction matches these filters."}
            </Empty>
          ) : (
            <Table head={["Reference", "Vendor", "Type", "Amount", "GST", "Status", "Gateway id", "When"]}>
              {filtered.map((t) => (
                <tr key={t.id} className={ROW_HOVER}>
                  <td className="px-3 py-2 font-mono text-xs text-ink">{t.reference}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink">{t.vendorName}</span>
                    <span className="block text-2xs text-ink-faint">{t.vendorCity}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={t.kind === "refund" ? "info" : "neutral"}>{KIND_LABELS[t.kind]}</Badge>
                  </td>
                  <td
                    className={`px-3 py-2 tabular-nums ${t.amountPaise < 0 ? "text-info-fg" : "text-ink"}`}
                  >
                    {inrFromPaise(t.amountPaise)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-muted">{inrFromPaise(t.gstPaise)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-2xs text-ink-faint">
                    {t.gatewayRef ?? <span className="font-sans text-ink-ghost">never reached the gateway</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-2xs tabular-nums text-ink-faint">
                    {format(new Date(t.occurredAt), "d MMM, HH:mm")}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </Stack>
    </Page>
  );
}

/* ------------------------------------------------------------------ *
 * The Live strip
 * ------------------------------------------------------------------ */

/**
 * THE MOST RECENT TRANSACTIONS, AND DELIBERATELY NOT A TICKER.
 *
 * There is no animation here, no marquee, no fake "new payment" pulse and no
 * relative clock that counts up on its own. This component renders a static
 * list of the most recent rows, because that is exactly as live as the data
 * actually is: this repo has no Realtime subscription anywhere, and the
 * `transactions` table does not exist. Animating it would be theatre that an
 * admin would reasonably read as "money is arriving right now".
 *
 * IT IS BUILT TO BECOME LIVE. The component takes rows as a prop and holds no
 * fetching of its own, so Phase 2 mounts it with a Realtime subscription
 * feeding the same prop and nothing in here changes. The only honest thing this
 * pass can show is the header state below: it says where the rows came from,
 * and it will say "live" when they are.
 */
function LiveStrip({ rows }: { rows: Transaction[] }) {
  const recent = useMemo(
    () =>
      [...rows]
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        .slice(0, LIVE_WINDOW),
    [rows],
  );

  if (recent.length === 0) return null;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SubHeading>Latest {LIVE_WINDOW} transactions</SubHeading>
        {/*
          The one place in this app where a status word is worth its own chip.
          It reports the connection state honestly. When Phase 2 attaches a
          Realtime channel this becomes a positive "live" badge; until then it
          says what it is.
        */}
        <Badge tone="neutral">not live yet, no subscription attached</Badge>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {recent.map((t) => (
          <div
            key={t.id}
            className="w-52 shrink-0 rounded-lg border border-line bg-surface-2 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="truncate text-xs font-medium text-ink">{t.vendorName}</span>
              <StatusBadge status={t.status} dot={false} />
            </div>
            <div className="mt-1.5 font-display text-base font-bold tabular-nums text-ink">
              {inrFromPaise(t.amountPaise)}
            </div>
            <div className="mt-0.5 text-2xs text-ink-faint">
              {KIND_LABELS[t.kind]} · {formatDistanceToNow(new Date(t.occurredAt), { addSuffix: true })}
            </div>
          </div>
        ))}
      </div>

      <Note className="mt-3">
        These are the most recent rows in the ledger, rendered once. They do not update on their own:
        this repo has no Realtime subscriptions and the table behind this screen does not exist yet.
        The strip takes its rows as a prop with no fetching of its own, so wiring a Supabase Realtime
        channel to it in Phase 2 is a change to its parent, not to the strip.
      </Note>
    </Card>
  );
}
