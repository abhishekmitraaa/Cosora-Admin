import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { Inbox } from "lucide-react";
import {
  hoursBetween,
  NO_FILTERS,
  STAGE_LABELS,
  STAGE_RULES,
  useLeadDetail,
  useLeads,
  useLeadsSummary,
  type LeadFilters,
  type LeadRow,
  type LeadStage,
  type StageFilter,
} from "@/lib/leads";
import {
  Badge,
  Button,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  Note,
  Page,
  PageHeader,
  Panel,
  ROW_HOVER,
  Select,
  SkeletonList,
  Stack,
  Stat,
  Table,
  cn,
  type Tone,
} from "@/components/ui";

/**
 * LEADS: THE RFQ PIPELINE (admin completion Phase 7).
 *
 * Every buyer request and where it stands, and how fast vendors answer. The rows
 * come from admin_leads_list() and the numbers from admin_leads_summary()
 * (src/lib/leads.ts); filters, search and paging run in the database.
 *
 * Read-only for every role: nothing here changes an RFQ or a quote. roles.ts,
 * section "leads": super_admin, vendor_ops, product_moderator, support.
 */

const STAGE_TONE: Record<LeadStage, Tone> = {
  new: "info",
  unanswered: "caution",
  quoted: "info",
  won: "positive",
  closed: "neutral",
};

const STAGE_FILTERS: StageFilter[] = ["all", "new", "unanswered", "overdue", "quoted", "won", "closed"];
const WINDOWS: { days: number | null; label: string }[] = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: null, label: "All time" },
];
const AGES: { hours: number | null; label: string }[] = [
  { hours: null, label: "Any age" },
  { hours: 24, label: "24 hours or older" },
  { hours: 48, label: "48 hours or older" },
  { hours: 168, label: "A week or older" },
];
const SEARCH_DEBOUNCE_MS = 300;

export default function Leads() {
  const [days, setDays] = useState<number | null>(30);
  const [draft, setDraft] = useState<LeadFilters>(NO_FILTERS);
  const [filters, setFilters] = useState<LeadFilters>(NO_FILTERS);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setFilters(draft), draft.search === filters.search ? 0 : SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, filters.search]);

  const summary = useLeadsSummary(days);
  const leads = useLeads(filters);
  const rows = leads.data?.pages.flat() ?? [];
  const s = summary.data;
  const filtersActive =
    filters.stage !== "all" || filters.audience !== "all" || filters.minAgeHours !== null || Boolean(filters.search.trim());

  const answeredPct =
    s && s.window.eligible_24h > 0 ? Math.round((100 * s.window.answered_24h) / s.window.eligible_24h) : null;

  return (
    <Page width="wide">
      <PageHeader
        title="Leads"
        subtitle="Every buyer request (RFQ) and where it stands: waiting for a first quote, quoted, won or closed. Read-only."
      />

      <Stack>
        {summary.error ? (
          <ErrorNote message={(summary.error as Error).message} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                icon={<Inbox size={18} />}
                label="Waiting for a first quote"
                value={s ? String(s.open.new + s.open.unanswered) : "…"}
                sub={s ? `${s.open.new} new, ${s.open.unanswered} unanswered` : undefined}
              />
              <Stat
                label="Overdue"
                value={s ? String(s.open.overdue) : "…"}
                tone={s && s.open.overdue > 0 ? "critical" : undefined}
                sub={STAGE_RULES.overdue}
              />
              <Stat
                label="Median time to a first quote"
                value={s?.window.median_first_quote_hours != null ? `${s.window.median_first_quote_hours} h` : "—"}
                sub={s ? `${s.window.answered} of ${s.window.rfqs} answered · ${windowLabel(days)}` : undefined}
              />
              <Stat
                label="Answered within 24 hours"
                value={answeredPct === null ? "—" : `${answeredPct}%`}
                sub={s ? `${s.window.answered_24h} of ${s.window.eligible_24h} at least a day old · ${windowLabel(days)}` : undefined}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Field label="Window for the timing figures" htmlFor="leads-window">
                <Select
                  id="leads-window"
                  value={days === null ? "all" : String(days)}
                  onChange={(e) => setDays(e.target.value === "all" ? null : Number(e.target.value))}
                >
                  {WINDOWS.map((w) => (
                    <option key={w.label} value={w.days === null ? "all" : String(w.days)}>
                      {w.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {s && (
                <Note>
                  {windowLabel(days)}: {s.window.rfqs} RFQ{s.window.rfqs === 1 ? "" : "s"} ({s.window.direct} direct),{" "}
                  {s.window.won} won, {s.window.closed} closed. {s.open.quoted} open RFQ
                  {s.open.quoted === 1 ? " has" : "s have"} quotes waiting on the buyer.
                </Note>
              )}
            </div>
          </>
        )}

        <Panel
          title="Pipeline"
          description="Search matches the request's title or product, or the buyer's name or company."
          actions={
            filtersActive && (
              <Button size="sm" onClick={() => setDraft(NO_FILTERS)}>
                Clear filters
              </Button>
            )
          }
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {STAGE_FILTERS.map((st) => (
              <button
                key={st}
                onClick={() => setDraft({ ...draft, stage: st })}
                aria-pressed={draft.stage === st}
                title={st === "all" ? "Every stage" : STAGE_RULES[st]}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  draft.stage === st
                    ? "border-brand bg-brand-tint text-ink"
                    : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {st === "all" ? "All" : STAGE_LABELS[st]}
              </button>
            ))}
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search" htmlFor="leads-search" className="lg:col-span-2">
              <Input
                id="leads-search"
                value={draft.search}
                placeholder="Title, product, buyer or company"
                onChange={(e) => setDraft({ ...draft, search: e.target.value })}
              />
            </Field>
            <Field label="Addressed to" htmlFor="leads-audience">
              <Select
                id="leads-audience"
                value={draft.audience}
                onChange={(e) => setDraft({ ...draft, audience: e.target.value as LeadFilters["audience"] })}
              >
                <option value="all">Everyone</option>
                <option value="marketplace">The open marketplace</option>
                <option value="direct">One vendor (direct)</option>
              </Select>
            </Field>
            <Field label="Age" htmlFor="leads-age">
              <Select
                id="leads-age"
                value={draft.minAgeHours === null ? "any" : String(draft.minAgeHours)}
                onChange={(e) => setDraft({ ...draft, minAgeHours: e.target.value === "any" ? null : Number(e.target.value) })}
              >
                {AGES.map((a) => (
                  <option key={a.label} value={a.hours === null ? "any" : String(a.hours)}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {leads.isPending ? (
            <SkeletonList rows={4} height="h-12" />
          ) : leads.error ? (
            <ErrorNote message={(leads.error as Error).message} />
          ) : rows.length === 0 ? (
            <Empty>{filtersActive ? "No RFQ matches these filters." : "No RFQs yet."}</Empty>
          ) : (
            <>
              <Table head={["Request", "Buyer", "Stage", "Quotes", "Vendor", "Posted", ""]}>
                {rows.map((r) => (
                  <LeadLine key={r.id} lead={r} onOpen={() => setOpen(r.id)} />
                ))}
              </Table>
              <div className="mt-3 flex justify-end">
                {leads.hasNextPage && (
                  <Button size="sm" disabled={leads.isFetchingNextPage} onClick={() => void leads.fetchNextPage()}>
                    {leads.isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                )}
              </div>
            </>
          )}
        </Panel>
      </Stack>

      <LeadDetailModal id={open} onClose={() => setOpen(null)} />
    </Page>
  );
}

function windowLabel(days: number | null): string {
  return days === null ? "all time" : `last ${days} days`;
}

function money(n: number | null | undefined): string {
  return n == null ? "" : `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function budget(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${money(min)}–${money(max)}`;
  return min != null ? `from ${money(min)}` : `up to ${money(max)}`;
}

function StageBadge({ stage, overdue }: { stage: LeadStage; overdue: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone={STAGE_TONE[stage]}>{STAGE_LABELS[stage]}</Badge>
      {overdue && <Badge tone="critical">overdue</Badge>}
    </span>
  );
}

function LeadLine({ lead: r, onOpen }: { lead: LeadRow; onOpen: () => void }) {
  const stage = r.stage as LeadStage;
  const facts = [r.category, r.quantity != null ? `${r.quantity.toLocaleString("en-IN")} pcs` : null, budget(r.budget_min, r.budget_max)]
    .filter(Boolean)
    .join(" · ");
  const vendorId = r.accepted_vendor_id ?? r.target_vendor_id;
  const vendorName = r.accepted_vendor_name ?? r.target_vendor_name;

  return (
    <tr className={ROW_HOVER}>
      <td className="px-3 py-2">
        <span className="font-medium text-ink" data-no-translate>
          {r.title}
        </span>
        {facts && <span className="block text-2xs text-ink-faint">{facts}</span>}
      </td>
      <td className="px-3 py-2">
        <Link
          to={`/accounts?q=${encodeURIComponent(r.buyer_id)}`}
          className="text-ink underline-offset-2 hover:underline"
          title="Open this buyer in Accounts"
        >
          {r.buyer_name}
        </Link>
      </td>
      <td className="px-3 py-2">
        <StageBadge stage={stage} overdue={r.overdue} />
      </td>
      <td className="px-3 py-2 tabular-nums text-ink-muted">
        {r.quotes}
        {r.first_quote_at && (
          <span className="block text-2xs text-ink-faint">first after {hoursBetween(r.created_at, r.first_quote_at)}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {vendorId ? (
          <>
            <Link to={`/vendors/${vendorId}`} className="text-ink underline-offset-2 hover:underline">
              {vendorName ?? "Unnamed vendor"}
            </Link>
            <span className="block text-2xs text-ink-faint">{r.accepted_vendor_id ? "won it" : "direct request"}</span>
          </>
        ) : (
          <span className="text-2xs text-ink-faint">open marketplace</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-2xs tabular-nums text-ink-faint">
        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
        <span className="block">{format(new Date(r.created_at), "d MMM yyyy")}</span>
      </td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" onClick={onOpen}>
          View
        </Button>
      </td>
    </tr>
  );
}

function LeadDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useLeadDetail(id);
  const d = detail.data;

  return (
    <Modal open={id !== null} title={d ? d.title : "Request"} onClose={onClose} width="lg">
      {detail.isPending ? (
        <SkeletonList rows={3} height="h-10" />
      ) : detail.error ? (
        <ErrorNote message={(detail.error as Error).message} />
      ) : d ? (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={d.stage} overdue={d.overdue} />
            {d.direct && <Badge>direct</Badge>}
            <span className="text-2xs text-ink-faint">
              Posted {format(new Date(d.created_at), "d MMM yyyy, HH:mm")} by{" "}
              <Link to={`/accounts?q=${encodeURIComponent(d.buyer.id)}`} className="underline-offset-2 hover:underline">
                {d.buyer.name}
              </Link>
              {d.target_vendor && (
                <>
                  {" "}
                  for{" "}
                  <Link to={`/vendors/${d.target_vendor.id}`} className="underline-offset-2 hover:underline">
                    {d.target_vendor.name ?? "a vendor"}
                  </Link>
                </>
              )}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted sm:grid-cols-4">
            <span>Product: {d.product_name ?? "—"}</span>
            <span>Category: {d.category ?? "—"}</span>
            <span>Quantity: {d.quantity != null ? d.quantity.toLocaleString("en-IN") : "—"}</span>
            <span>Budget: {budget(d.budget_min, d.budget_max) ?? "—"}</span>
          </div>

          {d.description && (
            <p className="whitespace-pre-line rounded-md bg-surface-2 p-3 text-ink" data-no-translate>
              {d.description}
            </p>
          )}

          {d.images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {d.images.slice(0, 6).map((src) => (
                <a key={src} href={src} target="_blank" rel="noreferrer">
                  <img src={src} alt="" className="h-20 w-20 rounded-md object-cover ring-1 ring-line" />
                </a>
              ))}
            </div>
          )}

          {d.quotes.length === 0 ? (
            <Empty>No quotes yet.</Empty>
          ) : (
            <Table head={["Vendor", "Price", "MOQ", "Lead time", "Status", "When"]}>
              {d.quotes.map((q) => (
                <tr key={q.id} className={ROW_HOVER}>
                  <td className="px-3 py-2">
                    <Link to={`/vendors/${q.vendor_id}`} className="underline-offset-2 hover:underline">
                      {q.vendor_name ?? "Unnamed vendor"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {q.price_per_unit != null ? `${q.currency}${q.price_per_unit}` : "—"}
                    {q.price_inr != null && q.currency !== "₹" && (
                      <span className="block text-2xs text-ink-faint">≈ {money(q.price_inr)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{q.moq ?? "—"}</td>
                  <td className="px-3 py-2">{q.lead_time ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={q.status === "accepted" ? "positive" : q.status === "rejected" ? "neutral" : "info"}>
                      {q.status}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-faint">
                    after {hoursBetween(d.created_at, q.created_at)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
