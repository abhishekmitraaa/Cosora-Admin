import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase, assertWrote } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { fetchVendorsByIds, type VendorSummary } from "@/lib/vendors";
import FlagLog from "@/components/FlagLog";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Modal,
  PageHeader,
  ReadOnlyBanner,
  Spinner,
  Tabs,
  Textarea,
} from "@/components/ui";

type Status = "under_review" | "live" | "rejected";

interface ProductRow {
  id: string;
  name: string;
  price_value: number | null;
  currency: string;
  moq: string | null;
  fabric: string | null;
  gsm: string | null;
  colour: string | null;
  status: Status;
  rejection_reason: string | null;
  vendor_id: string;
  created_at: string;
  category: { name: string } | null;
  images: { url: string; position: number }[];
}

const TABS: { id: Status; label: string }[] = [
  { id: "under_review", label: "Queue (under review)" },
  { id: "live", label: "Live" },
  { id: "rejected", label: "Rejected (audit)" },
];

export default function Products() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "products");
  const [tab, setTab] = useState<Status>("under_review");
  const [rejecting, setRejecting] = useState<ProductRow | null>(null);
  const [reason, setReason] = useState("");

  const products = useQuery({
    queryKey: ["products", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          `id, name, price_value, currency, moq, fabric, gsm, colour, status, rejection_reason,
           vendor_id, created_at,
           category:categories(name),
           images:product_images(url, position)`,
        )
        .eq("status", tab)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as ProductRow[];
      const vendors = await fetchVendorsByIds(rows.map((r) => r.vendor_id));
      return { rows, vendors };
    },
  });

  /**
   * Both approve and reject are a single `products` UPDATE of `status` (plus the
   * reason). The `enforce_products_moderation` trigger raises 42501 unless the
   * caller holds super_admin/product_moderator, so support sees the DB's own
   * refusal if it ever gets here.
   */
  const moderate = useMutation({
    mutationFn: async ({
      id,
      status,
      rejection_reason,
    }: {
      id: string;
      status: Status;
      rejection_reason: string | null;
    }) => {
      assertWrote(
        await supabase.from("products").update({ status, rejection_reason }).eq("id", id).select("id"),
        `set product to ${status}`,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function approve(p: ProductRow) {
    moderate.mutate(
      { id: p.id, status: "live", rejection_reason: null },
      { onSuccess: () => toast.success(`"${p.name}" is now live`) },
    );
  }

  function submitRejection() {
    if (!rejecting || !reason.trim()) return;
    moderate.mutate(
      { id: rejecting.id, status: "rejected", rejection_reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`"${rejecting.name}" rejected`);
          setRejecting(null);
          setReason("");
        },
      },
    );
  }

  if (products.isLoading) return <Spinner />;
  if (products.error) return <ErrorNote message={(products.error as Error).message} />;

  const { rows, vendors } = products.data!;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Products"
        subtitle="Moderate vendor-submitted products. Approving publishes to buyers; rejecting requires a reason."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "products")} />}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {rows.length === 0 ? (
        <Empty>
          {tab === "under_review"
            ? "Nothing waiting for review."
            : tab === "live"
              ? "No live products."
              : "No rejected products."}
        </Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              vendor={vendors.get(p.vendor_id)}
              writable={writable}
              busy={moderate.isPending}
              onApprove={() => approve(p)}
              onReject={() => {
                setRejecting(p);
                setReason("");
              }}
            />
          ))}
        </div>
      )}

      <Modal
        open={rejecting !== null}
        title={`Reject "${rejecting?.name ?? ""}"`}
        onClose={() => setRejecting(null)}
      >
        <p className="mb-2 text-sm text-slate-600">
          A reason is required. It's stored on the product and visible in the Rejected tab.
        </p>
        <Textarea
          rows={4}
          autoFocus
          value={reason}
          placeholder="Why is this being rejected?"
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setRejecting(null)}>Cancel</Button>
          <Button variant="danger" disabled={!reason.trim() || moderate.isPending} onClick={submitRejection}>
            Reject product
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function ProductCard({
  product: p,
  vendor,
  writable,
  busy,
  onApprove,
  onReject,
}: {
  product: ProductRow;
  vendor: VendorSummary | undefined;
  writable: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const images = [...(p.images ?? [])].sort((a, b) => a.position - b.position);

  return (
    <Card>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-wrap gap-1.5">
          {images.length === 0 ? (
            <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400 sm:h-24 sm:w-24">
              No image
            </div>
          ) : (
            images.slice(0, 3).map((img) => (
              <img
                key={img.url}
                src={img.url}
                alt=""
                className="h-20 w-20 rounded border border-slate-200 object-cover sm:h-24 sm:w-24"
              />
            ))
          )}
        </div>

        <div className="min-w-[240px] flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-900">{p.name}</h3>
            {p.status === "live" && <Badge tone="green" dot>live</Badge>}
            {p.status === "rejected" && <Badge tone="red" dot>rejected</Badge>}
            {p.status === "under_review" && <Badge tone="amber" dot>under review</Badge>}
          </div>

          <div className="mt-1 text-sm text-slate-700">
            {p.price_value != null ? `${p.currency}${p.price_value}` : "No price set"}
          </div>

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-3">
            <Attr label="Category" value={p.category?.name} />
            <Attr label="Fabric" value={p.fabric} />
            <Attr label="MOQ" value={p.moq} />
            <Attr label="GSM" value={p.gsm} />
            <Attr label="Colour" value={p.colour} />
          </dl>

          {/* Vendor context: who submitted this, and are they already trusted. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-xs text-slate-600">
            <span className="font-medium text-slate-800">{vendor?.brand_name ?? "Unknown vendor"}</span>
            {vendor?.city && <span>· {vendor.city}</span>}
            {vendor?.is_verified ? <Badge tone="blue">verified</Badge> : <Badge>unverified</Badge>}
            {vendor?.account_status === "suspended" && <Badge tone="red">suspended</Badge>}
          </div>

          {p.rejection_reason && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              <span className="font-medium">Rejection reason:</span> {p.rejection_reason}
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          {p.status !== "live" && (
            <Button variant="primary" disabled={!writable || busy} onClick={onApprove}>
              Approve
            </Button>
          )}
          {p.status !== "rejected" && (
            <Button variant="danger" disabled={!writable || busy} onClick={onReject}>
              {p.status === "live" ? "Pull down" : "Reject"}
            </Button>
          )}
          <Button onClick={() => setShowLog((s) => !s)}>{showLog ? "Hide log" : "Flag / log"}</Button>
        </div>
      </div>

      {showLog && (
        <div className="mt-3">
          <FlagLog entityType="product" entityId={p.id} />
        </div>
      )}
    </Card>
  );
}

function Attr({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="inline text-slate-400">{label}: </dt>
      <dd className="inline text-slate-700">{value || "—"}</dd>
    </div>
  );
}
