import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { supabase, assertWrote } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { fetchVendorsByIds, type VendorSummary } from "@/lib/vendors";
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

type Status = "under_review" | "live" | "rejected";

interface CatalogueRow {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  file_url: string | null;
  page_count: number | null;
  status: Status;
  rejection_reason: string | null;
  vendor_id: string;
  created_at: string;
}

const SUBTITLE =
  "Moderate seller catalogues (PDFs). Approving shows the catalogue on the seller's store; rejecting requires a reason the seller sees.";

const TABS: { id: Status; label: string }[] = [
  { id: "under_review", label: "Queue (under review)" },
  { id: "live", label: "Live" },
  { id: "rejected", label: "Rejected (audit)" },
];

/**
 * The address when it is a web address, else null. A catalogue's file and cover addresses are the seller's to write;
 * the database accepts only http(s) (catalogues_web_urls), and this keeps a `javascript:` link out of a staff session
 * even if a row ever got past that.
 */
function webUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

const UPLOADED = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/**
 * Seller catalogues (Mitra, 2026-10-10: "Catalogues have no review screen in the admin app").
 *
 * The same shape as Products and Videos, and the same enforcement underneath: one
 * `catalogues` UPDATE of `status` (plus the reason), which RLS and
 * `catalogues_moderation_guard` refuse unless the caller is super_admin or
 * product_moderator, a rejection carries a reason, and a moderator changes nothing but
 * the status and the reason (buyer repo, 20261010133347_catalogue_review). Approving
 * clears the reason in the database. A catalogue its seller changed after a decision
 * carries an open edit record, shown on its card as for listings and videos.
 *
 * No Flag / log here: admin_flag_add() takes vendors, products, ads, conversations and
 * requirements, not catalogues.
 */
export default function Catalogues() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "catalogues");
  const [tab, setTab] = useState<Status>("under_review");
  const [rejecting, setRejecting] = useState<CatalogueRow | null>(null);
  const [reason, setReason] = useState("");

  const catalogues = useQuery({
    queryKey: ["catalogues", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogues")
        .select("id, title, description, cover_url, file_url, page_count, status, rejection_reason, vendor_id, created_at")
        .eq("status", tab)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as CatalogueRow[];
      const [vendors, edits] = await Promise.all([
        fetchVendorsByIds(rows.map((r) => r.vendor_id)),
        fetchListingEdits("catalogue", rows.map((r) => r.id)),
      ]);
      return { rows, vendors, edits };
    },
  });

  const moderate = useMutation({
    mutationFn: async ({ id, status, rejection_reason }: { id: string; status: Status; rejection_reason: string | null }) => {
      assertWrote(
        await supabase.from("catalogues").update({ status, rejection_reason }).eq("id", id).select("id"),
        `set catalogue to ${status}`,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalogues"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function approve(c: CatalogueRow) {
    moderate.mutate(
      { id: c.id, status: "live", rejection_reason: null },
      { onSuccess: () => toast.success(`"${c.title}" is now live`) },
    );
  }

  function submitRejection() {
    if (!rejecting || !reason.trim()) return;
    moderate.mutate(
      { id: rejecting.id, status: "rejected", rejection_reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`"${rejecting.title}" rejected`);
          setRejecting(null);
          setReason("");
        },
      },
    );
  }

  if (catalogues.isLoading) {
    return (
      <Page>
        <PageHeader title="Catalogues" subtitle={SUBTITLE} />
        <SkeletonList rows={3} height="h-28" />
      </Page>
    );
  }
  if (catalogues.error) return <ErrorNote message={(catalogues.error as Error).message} />;

  const { rows, vendors, edits } = catalogues.data!;

  return (
    <Page>
      <PageHeader title="Catalogues" subtitle={SUBTITLE} />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "catalogues")} />}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {rows.length === 0 ? (
        <Empty>
          {tab === "under_review" ? "No catalogues waiting for review." : tab === "live" ? "No live catalogues." : "No rejected catalogues."}
        </Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <CatalogueCard
              key={c.id}
              catalogue={c}
              vendor={vendors.get(c.vendor_id)}
              edit={edits.get(c.id)}
              writable={writable}
              busy={moderate.isPending}
              onApprove={() => approve(c)}
              onReject={() => {
                setRejecting(c);
                setReason("");
              }}
            />
          ))}
        </div>
      )}

      <Modal open={rejecting !== null} title={`Reject "${rejecting?.title ?? ""}"`} onClose={() => setRejecting(null)}>
        <p className="mb-2 text-sm text-ink-muted">
          A reason is required. The seller sees it on their catalogue, and it stays in the Rejected tab.
        </p>
        <Textarea
          rows={4}
          autoFocus
          value={reason}
          placeholder="What should the seller fix?"
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setRejecting(null)}>Cancel</Button>
          <Button variant="danger" disabled={!reason.trim() || moderate.isPending} onClick={submitRejection}>
            Reject catalogue
          </Button>
        </div>
      </Modal>
    </Page>
  );
}

function CatalogueCard({
  catalogue: c,
  vendor,
  edit,
  writable,
  busy,
  onApprove,
  onReject,
}: {
  catalogue: CatalogueRow;
  vendor: VendorSummary | undefined;
  edit: ListingEdit | undefined;
  writable: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const cover = webUrl(c.cover_url);
  const file = webUrl(c.file_url);
  return (
    <Card className="transition-shadow hover:shadow-card-hover">
      <div className="flex flex-wrap gap-4">
        {cover ? (
          <img src={cover} alt="" className="h-28 w-20 rounded-lg border border-line object-cover sm:h-32 sm:w-24" />
        ) : (
          <div className="flex h-28 w-20 items-center justify-center rounded-lg border border-dashed border-line-strong text-ink-faint sm:h-32 sm:w-24">
            <FileText className="h-7 w-7" aria-hidden />
          </div>
        )}

        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-section font-bold text-ink">{c.title}</h3>
            <StatusBadge status={c.status} />
            <EditedBadge edit={edit} />
          </div>

          {c.description && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{c.description}</p>}

          <AttrGrid cols={3}>
            <Attr label="Pages" value={c.page_count} />
            <Attr label="Uploaded" value={UPLOADED.format(new Date(c.created_at))} />
            <Attr
              label="File"
              value={
                file ? (
                  <a href={file} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline-offset-2 hover:underline">
                    Open PDF
                  </a>
                ) : null
              }
            />
          </AttrGrid>

          {/* Who submitted it, and are they already trusted. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5 text-xs text-ink-muted">
            <span className="font-medium text-ink">{vendor?.brand_name ?? "Unknown vendor"}</span>
            {vendor?.city && <span>{vendor.city}</span>}
            {vendor?.is_verified ? <Badge tone="info">verified</Badge> : <Badge>unverified</Badge>}
            {vendor?.account_status === "suspended" && <Badge tone="critical">suspended</Badge>}
          </div>

          <ListingEditNotice entity="catalogue" edit={edit} />

          {c.rejection_reason && (
            <Notice tone="critical" className="mt-2.5 text-xs">
              <span className="font-semibold">Rejection reason.</span> {c.rejection_reason}
            </Notice>
          )}
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-36">
          {c.status !== "live" && (
            <Button variant="primary" disabled={!writable || busy} onClick={onApprove}>
              Approve
            </Button>
          )}
          {c.status !== "rejected" && (
            <Button variant="danger" disabled={!writable || busy} onClick={onReject}>
              {c.status === "live" ? "Pull down" : "Reject"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
