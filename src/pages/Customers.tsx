import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Users, X } from "lucide-react";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { inrFromPaise } from "@/lib/money";
import {
  NO_FILTERS,
  SEGMENT_LABELS,
  SEGMENT_RULES,
  SORT_LABELS,
  TAG_LABEL_RE,
  useCustomerList,
  useCustomerTags,
  useRefreshCustomers,
  useSegmentCounts,
  useTagWrites,
  type CustomerFilters,
  type CustomerKind,
  type CustomerRow,
  type CustomerSort,
  type CustomerTag,
  type Segment,
} from "@/lib/customers";
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
  ReadOnlyBanner,
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
 * C5 - CUSTOMERS, from the database (admin completion Phase 6).
 *
 * Distinct from the `accounts` section: that one answers "is this person
 * suspended and why", this one answers "who are our customers and which ones
 * are worth a call". The rows come from admin.customer_summary through
 * admin_customer_list() (src/lib/customers.ts); filters, search, sort and paging
 * run in the database.
 *
 * roles.ts, section "customers": read super_admin/support/finance_admin; tags
 * super_admin/support. The tag RPCs refuse anyone else.
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
const ALL_SORTS = Object.keys(SORT_LABELS) as CustomerSort[];
const SEARCH_DEBOUNCE_MS = 300;
const REFRESH_MINUTES = 10;

export default function Customers() {
  const role = useRole();
  const writable = canWrite(role, "customers");

  const [draft, setDraft] = useState<CustomerFilters>(NO_FILTERS);
  const [filters, setFilters] = useState<CustomerFilters>(NO_FILTERS);
  useEffect(() => {
    const t = setTimeout(() => setFilters(draft), draft.search === filters.search ? 0 : SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, filters.search]);

  const counts = useSegmentCounts();
  const list = useCustomerList(filters);
  const tags = useCustomerTags();
  const refresh = useRefreshCustomers();

  // Rebuild the summary on open. The database does it at most once every 10
  // minutes and otherwise just answers with the current data's time.
  const { mutate: refreshNow } = refresh;
  useEffect(() => {
    refreshNow();
  }, [refreshNow]);

  const rows = list.data?.pages.flat() ?? [];
  const c = counts.data;
  const filteredTotal = rows[0]?.total_count ?? 0;
  const filteredSpend = rows[0]?.total_spend_paise ?? 0;
  const filtersActive =
    Boolean(filters.search.trim()) || filters.kind !== "all" || filters.segment !== "all" || filters.tag !== "all";

  const refreshedAt = refresh.data?.refreshed_at ?? c?.refreshed_at ?? null;
  const fresh = refreshedAt ? Date.now() - new Date(refreshedAt).getTime() < REFRESH_MINUTES * 60_000 : false;

  return (
    <Page width="wide">
      <PageHeader
        title="Customers"
        subtitle="Buyers and vendors as a population: who is active, who is spending, and who has gone quiet."
        actions={
          <>
            {refreshedAt && (
              <span className="text-2xs text-ink-faint">Data as of {format(new Date(refreshedAt), "d MMM, HH:mm")}</span>
            )}
            <Button
              size="sm"
              disabled={refresh.isPending || fresh}
              title={fresh ? `Refreshes at most every ${REFRESH_MINUTES} minutes` : undefined}
              onClick={() => refresh.mutate()}
            >
              {refresh.isPending ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "customers")} />}

      <Stack>
        <Note>
          This is not the{" "}
          <Link to="/accounts" className="font-medium underline underline-offset-2 hover:text-ink">
            Accounts
          </Link>{" "}
          screen: that one answers whether one person is suspended and why. This is the population view.
          Nothing on it suspends, messages or edits anyone; tags are notes for the team. Cosora staff
          accounts aren't listed.
        </Note>

        {counts.error ? (
          <ErrorNote message={(counts.error as Error).message} />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              icon={<Users size={18} />}
              label="Customers"
              value={c ? String(filtersActive ? filteredTotal : c.customers) : "…"}
              sub={c ? (filtersActive ? `of ${c.customers} total` : `${c.vendors} vendors, ${c.buyers} buyers`) : undefined}
            />
            <Stat
              label="Lifetime spend"
              value={c ? inrFromPaise(filtersActive ? filteredSpend : c.spend_paise) : "…"}
              sub={filtersActive ? "across the filtered customers" : "paid to Cosora, less refunds"}
            />
            <Stat
              label="At risk"
              value={c ? String(c.at_risk) : "…"}
              tone={c && c.at_risk > 0 ? "caution" : undefined}
              sub={SEGMENT_RULES.at_risk}
            />
            <Stat label="Dormant" value={c ? String(c.dormant) : "…"} sub={SEGMENT_RULES.dormant} />
          </div>
        )}

        <Panel
          title="Segments"
          description="Each rule is written out because a filter whose definition lives only in someone's head becomes folklore within a month. A customer can be in several."
        >
          <div className="flex flex-wrap gap-2">
            <SegmentChip
              label="Everyone"
              rule="No segment filter."
              count={c?.customers}
              active={draft.segment === "all"}
              onClick={() => setDraft({ ...draft, segment: "all" })}
            />
            {ALL_SEGMENTS.map((s) => (
              <SegmentChip
                key={s}
                label={SEGMENT_LABELS[s]}
                rule={SEGMENT_RULES[s]}
                count={c?.[s]}
                active={draft.segment === s}
                onClick={() => setDraft({ ...draft, segment: draft.segment === s ? "all" : s })}
              />
            ))}
          </div>
        </Panel>

        <Panel
          title="Customer list"
          description="Lifetime spend is what an account paid Cosora (subscriptions with GST, and ad orders), less refunds. Buyers pay nothing today."
          actions={
            filtersActive && (
              <Button size="sm" onClick={() => setDraft({ ...NO_FILTERS, sort: draft.sort })}>
                Clear filters
              </Button>
            )
          }
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Search" htmlFor="cust-search" className="lg:col-span-2">
              <Input
                id="cust-search"
                value={draft.search}
                placeholder="Name, email, city or tag"
                onChange={(e) => setDraft({ ...draft, search: e.target.value })}
              />
            </Field>
            <Field label="Side" htmlFor="cust-kind">
              <Select
                id="cust-kind"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as CustomerKind | "all" })}
              >
                <option value="all">Buyers and vendors</option>
                <option value="vendor">Vendors only</option>
                <option value="buyer">Buyers only</option>
              </Select>
            </Field>
            <Field label="Tag" htmlFor="cust-tag">
              <Select id="cust-tag" value={draft.tag} onChange={(e) => setDraft({ ...draft, tag: e.target.value })}>
                <option value="all">Any tag</option>
                {(tags.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} ({t.uses})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sort by" htmlFor="cust-sort">
              <Select
                id="cust-sort"
                value={draft.sort}
                onChange={(e) => setDraft({ ...draft, sort: e.target.value as CustomerSort })}
              >
                {ALL_SORTS.map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {list.isPending ? (
            <SkeletonList rows={4} height="h-12" />
          ) : list.error ? (
            <ErrorNote message={(list.error as Error).message} />
          ) : rows.length === 0 ? (
            <Empty>{filtersActive ? "No customer matches these filters." : "No customers yet."}</Empty>
          ) : (
            <>
              <Table head={["Customer", "Side", "Segments", "Tags", "Lifetime spend", "Activity", "Last seen"]}>
                {rows.map((row) => (
                  <CustomerLine key={row.id} customer={row} tags={tags.data ?? []} writable={writable} />
                ))}
              </Table>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <Note>
                  Showing {rows.length} of {filteredTotal}.
                </Note>
                {list.hasNextPage && (
                  <Button size="sm" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                    {list.isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                )}
              </div>
            </>
          )}
        </Panel>

        <TagsPanel tags={tags.data ?? []} writable={writable} loading={tags.isPending} />
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
  count: number | undefined;
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
        <span className="tabular-nums text-ink-faint">{count ?? "…"}</span>
      </span>
      <span className="mt-0.5 block max-w-[16rem] text-2xs leading-snug text-ink-faint">{rule}</span>
    </button>
  );
}

function CustomerLine({
  customer: c,
  tags,
  writable,
}: {
  customer: CustomerRow;
  tags: CustomerTag[];
  writable: boolean;
}) {
  const { apply, unapply } = useTagWrites();
  const unused = tags.filter((t) => !c.tags.some((x) => x.id === t.id));
  const fail = (e: Error) => toast.error(e.message);

  return (
    <tr className={ROW_HOVER}>
      <td className="px-3 py-2">
        <span className="font-medium text-ink">{c.name}</span>
        <span className="block text-2xs text-ink-faint">{[c.email, c.city].filter(Boolean).join(" · ") || "—"}</span>
        {c.account_status === "suspended" && (
          <span className="mt-1 block">
            <Badge tone="critical">suspended</Badge>
          </span>
        )}
      </td>
      <td className="px-3 py-2">{c.kind === "vendor" ? <Badge tone="info">vendor</Badge> : <Badge>buyer</Badge>}</td>
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
        <div className="flex flex-wrap items-center gap-1">
          {c.tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink-muted ring-1 ring-inset ring-line"
            >
              {t.label}
              {writable && (
                <button
                  aria-label={`Remove tag ${t.label}`}
                  className="text-ink-faint hover:text-ink"
                  disabled={unapply.isPending}
                  onClick={() => unapply.mutate({ profileId: c.id, tagId: t.id }, { onError: fail })}
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
          {writable && unused.length > 0 && (
            <select
              aria-label={`Add a tag to ${c.name}`}
              className="rounded-md border border-line bg-surface px-1 py-0.5 text-2xs text-ink-muted"
              value=""
              disabled={apply.isPending}
              onChange={(e) => {
                if (e.target.value) apply.mutate({ profileId: c.id, tagId: e.target.value }, { onError: fail });
              }}
            >
              <option value="">+ tag</option>
              {unused.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </td>
      <td className="px-3 py-2 tabular-nums text-ink">
        {c.spend_paise > 0 ? (
          inrFromPaise(c.spend_paise)
        ) : (
          // Zero is the true and interesting value for every buyer: buyers do
          // not pay Cosora anything today. A blank would hide that.
          <span className="text-ink-ghost">nothing yet</span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums text-ink-muted">
        {c.interactions}
        <span className="block text-2xs text-ink-faint">chats, RFQs and quotes</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-2xs tabular-nums text-ink-faint">
        {c.last_active_at ? formatDistanceToNow(new Date(c.last_active_at), { addSuffix: true }) : "never"}
        <span className="block">joined {format(new Date(c.joined_at), "MMM yyyy")}</span>
      </td>
    </tr>
  );
}

function TagsPanel({ tags, writable, loading }: { tags: CustomerTag[]; writable: boolean; loading: boolean }) {
  const { create, remove } = useTagWrites();
  const [label, setLabel] = useState("");
  const [confirm, setConfirm] = useState<CustomerTag | null>(null);
  const clean = label.trim().toLowerCase();
  const valid = TAG_LABEL_RE.test(clean);

  return (
    <Panel
      title="Tags"
      description="Notes the team attaches to customers, e.g. export-ready or follow-up. Lowercase letters, digits and hyphens, up to 32. Every change is in the Admin Log."
    >
      {writable && (
        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            create.mutate(clean, {
              onSuccess: () => {
                setLabel("");
                toast.success(`Tag "${clean}" is ready`);
              },
              onError: (err) => toast.error(err.message),
            });
          }}
        >
          <Field label="New tag" htmlFor="tag-new">
            <Input id="tag-new" value={label} placeholder="export-ready" onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Button type="submit" size="sm" variant="primary" disabled={!valid || create.isPending}>
            Add tag
          </Button>
          {label && !valid && (
            <span className="text-2xs text-critical-fg">Use lowercase letters, digits and hyphens (up to 32).</span>
          )}
        </form>
      )}

      {loading ? (
        <SkeletonList rows={1} height="h-8" />
      ) : tags.length === 0 ? (
        <Empty>No tags yet.</Empty>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 font-mono text-2xs text-ink-muted ring-1 ring-inset ring-line"
            >
              {t.label}
              <span className="font-sans text-ink-faint">{t.uses}</span>
              {writable && (
                <button aria-label={`Delete tag ${t.label}`} className="text-ink-faint hover:text-ink" onClick={() => setConfirm(t)}>
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <Modal open={confirm !== null} title={`Delete the tag "${confirm?.label ?? ""}"?`} onClose={() => setConfirm(null)}>
        <p className="text-sm text-ink-muted">
          {confirm && confirm.uses > 0
            ? `It's on ${confirm.uses} customer${confirm.uses === 1 ? "" : "s"}; they lose it too.`
            : "No customer carries it."}{" "}
          The Admin Log keeps the record.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={() => setConfirm(null)}>
            Keep it
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={remove.isPending}
            onClick={() =>
              confirm &&
              remove.mutate(confirm.id, {
                onSuccess: () => setConfirm(null),
                onError: (err) => toast.error(err.message),
              })
            }
          >
            Delete tag
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}
