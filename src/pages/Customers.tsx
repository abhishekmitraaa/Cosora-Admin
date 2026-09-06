import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { Users } from "lucide-react";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { SEED_ACTIVE, useDevSeed } from "@/lib/devSeed/store";
import {
  allTags,
  customerStore,
  inr,
  SEGMENT_LABELS,
  SEGMENT_RULES,
  type Customer,
  type CustomerKind,
  type Segment,
} from "@/lib/devSeed/customers";
import {
  Badge,
  Button,
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
  Table,
  cn,
  type Tone,
} from "@/components/ui";

/**
 * C5 - CUSTOMERS. DEV-SEED DATA. Nothing here reads or writes Supabase.
 *
 * Distinct from the `accounts` section: that one answers "is this person
 * suspended and why", this one answers "who are our customers and which ones
 * are worth a call". See src/lib/devSeed/customers.ts for why every column here
 * needs a table that does not exist (there is no tag table, no last-active
 * timestamp, and no per-account spend rollup).
 *
 * roles.ts, section "customers": read super_admin/support/finance_admin, write
 * nobody. Read-only by design in this pass; tag editing is Phase 2.
 */

const SEGMENT_TONE: Record<Segment, Tone> = {
  new: "info",
  active: "positive",
  high_value: "positive",
  at_risk: "caution",
  dormant: "neutral",
  never_transacted: "neutral",
};

const ALL_SEGMENTS = Object.keys(SEGMENT_LABELS) as Segment[];

export default function Customers() {
  const role = useRole();
  const writable = canWrite(role, "customers");
  const rows = useDevSeed(customerStore);

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<CustomerKind | "all">("all");
  const [segment, setSegment] = useState<Segment | "all">("all");
  const [tag, setTag] = useState<string>("all");

  const tags = useMemo(() => allTags(rows), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((c) => {
        if (kind !== "all" && c.kind !== kind) return false;
        if (segment !== "all" && !c.segments.includes(segment)) return false;
        if (tag !== "all" && !c.tags.includes(tag)) return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q) ||
          c.tags.some((t) => t.includes(q))
        );
      })
      .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend || b.interactions - a.interactions);
  }, [rows, query, kind, segment, tag]);

  const filtersActive = Boolean(query.trim() || kind !== "all" || segment !== "all" || tag !== "all");
  const totalSpend = filtered.reduce((s, c) => s + c.lifetimeSpend, 0);
  const vendors = filtered.filter((c) => c.kind === "vendor").length;

  // Counts per segment, so the chips carry a number instead of being blind
  // filters you have to click to discover are empty.
  const segmentCounts = useMemo(() => {
    const m = new Map<Segment, number>();
    for (const s of ALL_SEGMENTS) m.set(s, rows.filter((c) => c.segments.includes(s)).length);
    return m;
  }, [rows]);

  return (
    <Page width="wide">
      <PageHeader
        title="Customers"
        subtitle="Buyers and vendors as a population: who is active, who is spending, and who has gone quiet."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "customers")} />}
      {SEED_ACTIVE && <DevSeedBanner what="Customer segmentation" />}

      <Stack>
        <Note>
          This is not the{" "}
          <Link to="/accounts" className="font-medium underline underline-offset-2 hover:text-ink">
            Accounts
          </Link>{" "}
          screen. Accounts answers one question about one person, is this account suspended and why,
          and is search-first for that reason. This screen is the population view, and it is
          read-only: nothing on it suspends, messages or edits anyone.
        </Note>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            icon={<Users size={18} />}
            label="Customers"
            value={String(filtered.length)}
            sub={filtersActive ? `of ${rows.length} total` : `${vendors} vendors, ${filtered.length - vendors} buyers`}
          />
          <Stat
            label="Lifetime spend"
            value={inr(totalSpend)}
            sub={filtersActive ? "across the filtered set" : "across every customer"}
          />
          <Stat
            label="At risk"
            value={String(segmentCounts.get("at_risk") ?? 0)}
            tone={(segmentCounts.get("at_risk") ?? 0) > 0 ? "caution" : undefined}
            sub={SEGMENT_RULES.at_risk}
          />
          <Stat
            label="Dormant"
            value={String(segmentCounts.get("dormant") ?? 0)}
            sub={SEGMENT_RULES.dormant}
          />
        </div>

        <Panel
          title="Segments"
          description="Each rule is written out because a filter whose definition lives only in someone's head becomes folklore within a month."
        >
          <div className="flex flex-wrap gap-2">
            <SegmentChip
              label="Everyone"
              rule="No segment filter."
              count={rows.length}
              active={segment === "all"}
              onClick={() => setSegment("all")}
            />
            {ALL_SEGMENTS.map((s) => (
              <SegmentChip
                key={s}
                label={SEGMENT_LABELS[s]}
                rule={SEGMENT_RULES[s]}
                count={segmentCounts.get(s) ?? 0}
                active={segment === s}
                onClick={() => setSegment(segment === s ? "all" : s)}
              />
            ))}
          </div>
        </Panel>

        <Panel
          title="Customer list"
          description="Sorted by lifetime spend, then by activity."
          actions={
            filtersActive && (
              <Button
                size="sm"
                onClick={() => {
                  setQuery("");
                  setKind("all");
                  setSegment("all");
                  setTag("all");
                }}
              >
                Clear filters
              </Button>
            )
          }
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search" htmlFor="cust-search" className="lg:col-span-2">
              <Input
                id="cust-search"
                value={query}
                placeholder="Name, email, city or tag"
                onChange={(e) => setQuery(e.target.value)}
              />
            </Field>
            <Field label="Side" htmlFor="cust-kind">
              <Select
                id="cust-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as CustomerKind | "all")}
              >
                <option value="all">Buyers and vendors</option>
                <option value="vendor">Vendors only</option>
                <option value="buyer">Buyers only</option>
              </Select>
            </Field>
            <Field label="Tag" htmlFor="cust-tag">
              <Select id="cust-tag" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="all">Any tag</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {filtered.length === 0 ? (
            <Empty>
              {rows.length === 0
                ? "No customers. In a production build this list is empty because the tag and summary tables do not exist yet."
                : "No customer matches these filters."}
            </Empty>
          ) : (
            <Table head={["Customer", "Side", "Segments", "Tags", "Lifetime spend", "Activity", "Last seen"]}>
              {filtered.map((c) => (
                <CustomerRow key={c.id} customer={c} />
              ))}
            </Table>
          )}
        </Panel>
      </Stack>
    </Page>
  );
}

function SegmentChip({
  label,
  rule,
  count,
  active,
  onClick,
}: {
  label: string;
  rule: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-3 py-2 text-left transition-colors",
        active
          ? "border-brand bg-brand-tint text-ink"
          : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
      )}
    >
      <span className="flex items-center gap-2 text-xs font-medium">
        {label}
        <span className="tabular-nums text-ink-faint">{count}</span>
      </span>
      <span className="mt-0.5 block max-w-[16rem] text-2xs leading-snug text-ink-faint">{rule}</span>
    </button>
  );
}

function CustomerRow({ customer: c }: { customer: Customer }) {
  return (
    <tr className={ROW_HOVER}>
      <td className="px-3 py-2">
        <span className="font-medium text-ink">{c.name}</span>
        <span className="block text-2xs text-ink-faint">
          {c.email} · {c.city}
        </span>
      </td>
      <td className="px-3 py-2">
        {c.kind === "vendor" ? <Badge tone="info">vendor</Badge> : <Badge>buyer</Badge>}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {c.segments.map((s) => (
            <Badge key={s} tone={SEGMENT_TONE[s]}>
              {SEGMENT_LABELS[s]}
            </Badge>
          ))}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <span
              key={t}
              className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink-muted ring-1 ring-inset ring-line"
            >
              {t}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2 tabular-nums text-ink">
        {c.lifetimeSpend > 0 ? (
          inr(c.lifetimeSpend)
        ) : (
          // Zero is the true and interesting value for every buyer: buyers do
          // not pay Cosora anything today. Rendering it as a blank would hide
          // that the entire buyer side is unmonetised.
          <span className="text-ink-ghost">nothing yet</span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums text-ink-muted">
        {c.interactions}
        <span className="block text-2xs text-ink-faint">chats, RFQs and quotes</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-2xs tabular-nums text-ink-faint">
        {formatDistanceToNow(new Date(c.lastActiveAt), { addSuffix: true })}
        <span className="block">joined {format(new Date(c.joinedAt), "MMM yyyy")}</span>
      </td>
    </tr>
  );
}
