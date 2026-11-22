import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchListingRevs, ListingChangedError, ListingEditedError, moderateFrom } from "@/lib/moderation";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { fetchVendorsByIds, type VendorSummary } from "@/lib/vendors";
import {
  canEditReasons,
  useFlagProduct,
  useModerationHistory,
  useReinstateProduct,
  useRemoveProduct,
} from "@/lib/productModeration";
import FlagLog from "@/components/FlagLog";
import ProductModerationDialog from "@/components/ProductModerationDialog";
import ProductDetailsModal from "@/components/ProductDetailsModal";
import { EditedBadge, ListingEditNotice } from "@/components/ListingEditNotice";
import { fetchListingEdits, type ListingEdit } from "@/lib/listingEdits";
import {
  Attr,
  AttrGrid,
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Modal,
  Notice,
  Page,
  PageHeader,
  ReadOnlyBanner,
  SkeletonList,
  StatusBadge,
  Tabs,
  Textarea,
} from "@/components/ui";
import { useUrlState } from "@/hooks/useUrlState";
import { afterCursor, defaultQueueSort, mergeQueuePages, nextCursor, QUEUE_PAGE, QUEUE_SORTS, type QueueCursor, type QueueSort } from "@/lib/queuePaging";
import { QueueSortToggle } from "@/components/QueueSortToggle";

// "paused" (subscriptions P4): over the vendor's plan limit, hidden from buyers until the
// plan allows it again. The plan pauses and resumes it, so the tab is for looking only.
type Status = "under_review" | "live" | "rejected" | "paused";
type Tab = Status | "removed";

interface ProductRow {
  id: string;
  name: string;
  price_value: number | null;
  currency: string;
  moq: string | null;
  fabric: string | null;
  gsm: string | null;
  colour: string | null;
  status: Status | "draft";
  rejection_reason: string | null;
  removed_at: string | null;
  removed_reason: string | null;
  flagged_at: string | null;
  flag_reason: string | null;
  vendor_id: string;
  created_at: string;
  category: { name: string } | null;
  images: { url: string; position: number }[];
  /** The listing's revision when this page loaded (AR-H10). */
  rev?: number;
}

const SUBTITLE =
  "Moderate vendor listings. Approving publishes to buyers; rejecting asks the vendor to fix it; flagging hides a live listing for review; removing takes it down for good.";

const TABS: { id: Tab; label: string }[] = [
  { id: "under_review", label: "Queue (under review)" },
  { id: "live", label: "Live" },
  { id: "rejected", label: "Rejected" },
  { id: "removed", label: "Removed" },
  { id: "paused", label: "Paused (plan limit)" },
];


const COLUMNS = `id, name, price_value, currency, moq, fabric, gsm, colour, status, rejection_reason,
  removed_at, removed_reason, flagged_at, flag_reason, vendor_id, created_at,
  category:categories(name),
  images:product_images(url, position)`;

type Cursor = QueueCursor;

async function fetchPage(tab: Tab, cursor: Cursor, sort: QueueSort) {
  let q = supabase.from("products").select(COLUMNS);
  // A removal is status 'rejected' plus removed_at, so the two tabs split one status.
  if (tab === "removed") q = q.eq("status", "rejected").not("removed_at", "is", null);
  else if (tab === "rejected") q = q.eq("status", "rejected").is("removed_at", null);
  else q = q.eq("status", tab);
  if (cursor) q = q.or(afterCursor(cursor, sort));
  const { data, error } = await q
    .order("created_at", { ascending: sort === "oldest" })
    .order("id", { ascending: sort === "oldest" })
    .limit(QUEUE_PAGE);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ProductRow[];
  // A listing its seller changed after a decision carries an open edit record: shown on its card.
  const [vendors, edits, revs] = await Promise.all([
    fetchVendorsByIds(rows.map((r) => r.vendor_id)),
    fetchListingEdits("product", rows.map((r) => r.id)),
    // What the moderator sees now: a decision applies only to this content (AR-H10).
    fetchListingRevs("products", rows.map((r) => r.id)),
  ]);
  for (const r of rows) r.rev = revs.get(r.id) ?? 0;
  return { rows, vendors, edits, next: nextCursor(rows) };
}

type Dialog = { kind: "remove" | "flag" | "reinstate" | "reject"; product: ProductRow } | null;

export default function Products() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "products");
  const [tab, setTab] = useUrlState<Tab>("tab", "under_review", TABS.map((t) => t.id));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  // "Review details": everything the vendor entered (2026-10-17).
  const [viewing, setViewing] = useState<ProductRow | null>(null);

  const [sort, setSort] = useUrlState<QueueSort>("sort", defaultQueueSort(tab), QUEUE_SORTS);
  const products = useInfiniteQuery({
    queryKey: ["products", tab, sort],
    initialPageParam: null as Cursor,
    queryFn: ({ pageParam }) => fetchPage(tab, pageParam, sort),
    getNextPageParam: (last) => last.next,
  });

  const remove = useRemoveProduct();
  const flag = useFlagProduct();
  const reinstate = useReinstateProduct();

  /**
   * Approve and reject are a single `products` UPDATE of `status` (plus the reason).
   * `enforce_products_moderation` raises 42501 unless the caller is a super admin, a
   * product moderator or a manager, so support sees the database's own refusal if it ever
   * gets here. Approving or rejecting a flagged listing clears its flag (the guard trigger).
   */
  const moderate = useMutation({
    mutationFn: async ({
      id,
      from,
      status,
      rejection_reason,
      rev,
    }: {
      id: string;
      /** The status the moderator was shown; the update applies only if it still holds. */
      from: string;
      status: Status;
      rejection_reason: string | null;
      /** The content the moderator was shown (AR-H10). */
      rev?: number;
    }) => {
      await moderateFrom("products", id, from, { status, rejection_reason }, `set product to ${status}`, rev);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => {
      toast.error(e.message, { duration: 8000 });
      if (e instanceof ListingChangedError || e instanceof ListingEditedError) void qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
  // Approve on the Rejected tab overturns a rejection: confirmed first, and the seller is told (AR-H11).
  const [overturn, setOverturn] = useState<ProductRow | null>(null);

  function open(kind: NonNullable<Dialog>["kind"], product: ProductRow) {
    setText("");
    setDialog({ kind, product });
  }

  function approve(p: ProductRow, confirmed = false) {
    if (p.status === "rejected" && !confirmed) {
      setOverturn(p);
      return;
    }
    moderate.mutate(
      { id: p.id, from: p.status, status: "live", rejection_reason: null, rev: p.rev },
      { onSuccess: () => toast.success(`"${p.name}" is now live`) },
    );
  }

  const busy = moderate.isPending || remove.isPending || flag.isPending || reinstate.isPending;

  if (products.isLoading) {
    return (
      <Page>
        <PageHeader title="Products" subtitle={SUBTITLE} />
        <SkeletonList rows={3} height="h-32" />
      </Page>
    );
  }
  if (products.error) return <ErrorNote message={(products.error as Error).message} />;

  const { rows, vendors, edits } = mergeQueuePages(products.data?.pages ?? []);
  const target = dialog?.product;

  return (
    <Page>
      <PageHeader title="Products" subtitle={SUBTITLE} />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "products")} />}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <QueueSortToggle value={sort} onChange={setSort} />

      {rows.length === 0 ? (
        <Empty>
          {tab === "under_review"
            ? "Nothing waiting for review."
            : tab === "live"
              ? "No live products."
              : tab === "rejected"
                ? "No rejected products."
                : tab === "paused"
                  ? "No products are paused by a plan limit."
                  : "No removed products."}
        </Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              vendor={vendors.get(p.vendor_id)}
              edit={edits.get(p.id)}
              writable={writable}
              canReinstate={canEditReasons(role)}
              busy={busy}
              onApprove={() => approve(p)}
              onReject={() => open("reject", p)}
              onFlag={() => open("flag", p)}
              onRemove={() => open("remove", p)}
              onReinstate={() => open("reinstate", p)}
              onDetails={() => setViewing(p)}
            />
          ))}
          {products.hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button disabled={products.isFetchingNextPage} onClick={() => void products.fetchNextPage()}>
                {products.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}

      <ProductDetailsModal
        productId={viewing?.id ?? null}
        title={viewing?.name ?? ""}
        onClose={() => setViewing(null)}
        actions={
          viewing &&
          viewing.removed_at === null && (
            <>
              {viewing.status === "live" ? (
                <Button disabled={!writable || busy} onClick={() => { open("flag", viewing); setViewing(null); }}>
                  Flag
                </Button>
              ) : (
                viewing.status !== "rejected" && (
                  <Button disabled={!writable || busy} onClick={() => { open("reject", viewing); setViewing(null); }}>
                    Reject
                  </Button>
                )
              )}
              <Button variant="danger" disabled={!writable || busy} onClick={() => { open("remove", viewing); setViewing(null); }}>
                Remove
              </Button>
              {viewing.status !== "live" && viewing.status !== "paused" && (
                <Button variant="primary" disabled={!writable || busy} onClick={() => { approve(viewing); setViewing(null); }}>
                  Approve
                </Button>
              )}
            </>
          )
        }
      />

      <ProductModerationDialog
        action={dialog?.kind === "flag" ? "flag" : "remove"}
        productName={target?.name ?? ""}
        open={dialog?.kind === "remove" || dialog?.kind === "flag"}
        busy={remove.isPending || flag.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(reasonId, note) => {
          if (!target || !dialog) return;
          const run = dialog.kind === "flag" ? flag : remove;
          run.mutate(
            { productId: target.id, reasonId, note },
            {
              onSuccess: () => {
                toast.success(
                  dialog.kind === "flag"
                    ? `"${target.name}" is hidden and back in the queue. The vendor has been told why.`
                    : `"${target.name}" was removed. The vendor has been told why.`,
                );
                setDialog(null);
              },
            },
          );
        }}
      />

      <Modal open={overturn !== null} title={`Approve "${overturn?.name ?? ""}"?`} onClose={() => setOverturn(null)}>
        <p className="mb-3 text-sm text-ink-muted">
          This listing was rejected. Approving it now puts it live as it is, without the seller sending it again, and tells
          them it passed review.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setOverturn(null)}>Keep it rejected</Button>
          <Button
            variant="primary"
            disabled={moderate.isPending}
            onClick={() => {
              if (overturn) approve(overturn, true);
              setOverturn(null);
            }}
          >
            Approve and publish
          </Button>
        </div>
      </Modal>

      <Modal open={dialog?.kind === "reject"} title={`Reject "${target?.name ?? ""}"`} onClose={() => setDialog(null)}>
        <p className="mb-2 text-sm text-ink-muted">
          A reason is required. The vendor can fix the listing and submit it again. To take it down for good, use
          Remove instead.
        </p>
        <Textarea
          rows={4}
          autoFocus
          value={text}
          placeholder="Why is this being rejected?"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={!text.trim() || moderate.isPending}
            onClick={() =>
              target &&
              moderate.mutate(
                { id: target.id, from: target.status, status: "rejected", rejection_reason: text.trim(), rev: target.rev },
                {
                  onSuccess: () => {
                    toast.success(`"${target.name}" rejected`);
                    setDialog(null);
                  },
                },
              )
            }
          >
            Reject product
          </Button>
        </div>
      </Modal>

      <Modal
        open={dialog?.kind === "reinstate"}
        title={`Reinstate "${target?.name ?? ""}"`}
        onClose={() => setDialog(null)}
      >
        <p className="mb-3 text-sm leading-relaxed text-ink-muted">
          The listing goes back to the vendor's drafts, and they are told. It reaches buyers only after they submit
          it again and it is approved.
        </p>
        <Field label="Why the removal is being undone (required)" htmlFor="pm-reinstate" hint="Recorded in the Admin Log.">
          <Textarea id="pm-reinstate" rows={3} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!text.trim() || text.trim().length > 500 || reinstate.isPending}
            onClick={() =>
              target &&
              reinstate.mutate(
                { productId: target.id, note: text },
                {
                  onSuccess: () => {
                    toast.success(`"${target.name}" is back in the vendor's drafts`);
                    setDialog(null);
                  },
                },
              )
            }
          >
            {reinstate.isPending ? "Reinstating…" : "Reinstate"}
          </Button>
        </div>
      </Modal>
    </Page>
  );
}

function ProductCard({
  product: p,
  vendor,
  edit,
  writable,
  canReinstate,
  busy,
  onApprove,
  onReject,
  onFlag,
  onRemove,
  onReinstate,
  onDetails,
}: {
  product: ProductRow;
  vendor: VendorSummary | undefined;
  edit: ListingEdit | undefined;
  writable: boolean;
  canReinstate: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onFlag: () => void;
  onRemove: () => void;
  onReinstate: () => void;
  onDetails: () => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const images = [...(p.images ?? [])].sort((a, b) => a.position - b.position);
  const removed = p.removed_at !== null;

  return (
    <div data-testid={`product-${p.id}`}>
    <Card className="transition-shadow hover:shadow-card-hover">
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-wrap gap-1.5">
          {images.length === 0 ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-ink-faint sm:h-24 sm:w-24">
              No image
            </div>
          ) : (
            images.slice(0, 3).map((img) => (
              <img
                key={img.url}
                src={img.url}
                alt=""
                className="h-20 w-20 rounded-lg border border-line object-cover sm:h-24 sm:w-24"
              />
            ))
          )}
          {images.length > 3 && (
            <span className="flex h-20 w-12 items-center justify-center rounded-lg border border-line text-xs text-ink-muted sm:h-24">
              +{images.length - 3}
            </span>
          )}
        </div>

        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-section font-bold text-ink">{p.name}</h3>
            {removed ? <Badge tone="critical" dot>removed</Badge> : <StatusBadge status={p.status} />}
            {p.flagged_at && <Badge tone="caution" dot>flagged</Badge>}
            <EditedBadge edit={edit} />
          </div>

          <div className="mt-1 text-sm tabular-nums text-ink-muted">
            {p.price_value != null ? `${p.currency}${p.price_value}` : "No price set"}
          </div>

          <AttrGrid cols={3}>
            <Attr label="Category" value={p.category?.name} />
            <Attr label="Fabric" value={p.fabric} />
            <Attr label="MOQ" value={p.moq} />
            <Attr label="GSM" value={p.gsm} />
            <Attr label="Colour" value={p.colour} />
          </AttrGrid>

          {/* Vendor context: who submitted this, and are they already trusted. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5 text-xs text-ink-muted">
            <span className="font-medium text-ink">{vendor?.brand_name ?? "Unknown vendor"}</span>
            {vendor?.city && <span>{vendor.city}</span>}
            {vendor?.is_verified ? <Badge tone="info">verified</Badge> : <Badge>unverified</Badge>}
            {vendor?.account_status === "suspended" && <Badge tone="critical">suspended</Badge>}
          </div>

          <ListingEditNotice entity="product" edit={edit} />

          {p.flagged_at && p.flag_reason && (
            <Notice tone="caution" className="mt-2.5 text-xs">
              <span className="font-semibold">
                Flagged {formatDistanceToNow(new Date(p.flagged_at), { addSuffix: true })}.
              </span>{" "}
              <span className="whitespace-pre-wrap">{p.flag_reason}</span>
            </Notice>
          )}
          {removed && p.removed_reason && (
            <Notice tone="critical" className="mt-2.5 text-xs">
              <span className="font-semibold">
                Removed {formatDistanceToNow(new Date(p.removed_at as string), { addSuffix: true })}.
              </span>{" "}
              <span className="whitespace-pre-wrap">{p.removed_reason}</span>
            </Notice>
          )}
          {!removed && p.status === "rejected" && p.rejection_reason && (
            <Notice tone="critical" className="mt-2.5 text-xs">
              <span className="font-semibold">Rejection reason.</span> {p.rejection_reason}
            </Notice>
          )}
          {p.status === "paused" && (
            <Notice tone="caution" className="mt-2.5 text-xs">
              <span className="font-semibold">Paused by the vendor's plan limit.</span> Buyers can't see it. It comes
              back when their plan allows it, or when the vendor chooses it over another listing.
            </Notice>
          )}
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-36">
          {/* A paused listing is the plan's to resume, not a moderator's to approve. */}
          {!removed && p.status !== "live" && p.status !== "paused" && (
            <Button variant="primary" disabled={!writable || busy} onClick={onApprove}>
              Approve
            </Button>
          )}
          {!removed && p.status !== "rejected" && p.status !== "live" && (
            <Button disabled={!writable || busy} onClick={onReject}>
              Reject
            </Button>
          )}
          {p.status === "live" && (
            <Button disabled={!writable || busy} onClick={onFlag}>
              Flag
            </Button>
          )}
          {!removed && (
            <Button variant="danger" disabled={!writable || busy} onClick={onRemove}>
              Remove
            </Button>
          )}
          {removed && (
            <Button
              disabled={!canReinstate || busy}
              title={canReinstate ? undefined : "Only a super admin or a manager can reinstate"}
              onClick={onReinstate}
            >
              Reinstate
            </Button>
          )}
          <Button onClick={onDetails}>Review details</Button>
          <Button variant="ghost" onClick={() => setShowLog((s) => !s)}>
            {showLog ? "Hide history" : "History / notes"}
          </Button>
        </div>
      </div>

      {showLog && (
        <div className="mt-3 space-y-3">
          <ModerationHistory productId={p.id} />
          <FlagLog entityType="product" entityId={p.id} canAdd={writable} />
        </div>
      )}
    </Card>
    </div>
  );
}

const ACTION_LABEL = { remove: "Removed", flag: "Flagged", reinstate: "Reinstated" } as const;

function ModerationHistory({ productId }: { productId: string }) {
  const history = useModerationHistory(productId, true);
  if (history.isLoading) return <p className="text-xs text-ink-faint">Loading history…</p>;
  if (history.error) return <ErrorNote message={(history.error as Error).message} />;
  const rows = history.data ?? [];
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="mb-2 text-xs font-semibold text-ink">Moderation history</div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-faint">Never removed, flagged or reinstated.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((h) => (
            <div key={h.id} className="rounded-lg border border-line bg-surface p-2.5 shadow-xs">
              <p className="text-sm text-ink">
                <span className="font-medium">{ACTION_LABEL[h.action]}</span>
                {h.reason_label && <span>: {h.reason_label}</span>}
              </p>
              {h.note && <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink-muted">{h.note}</p>}
              <p className="mt-1 text-xs text-ink-faint">
                {h.actor_name || "Unknown admin"}
                {h.actor_role ? ` (${h.actor_role.replace(/_/g, " ")})` : ""} ·{" "}
                {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
