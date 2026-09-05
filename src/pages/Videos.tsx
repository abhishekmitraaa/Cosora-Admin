import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { supabase, assertWrote, describeWriteError } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { fetchVendorsByIds, type VendorSummary } from "@/lib/vendors";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Modal,
  Note,
  PageHeader,
  ReadOnlyBanner,
  Spinner,
  Tabs,
  Textarea,
} from "@/components/ui";

type Status = "under_review" | "live" | "rejected";

/** The vendor-side cap in textile-spark-net (`MAX_VIDEO_SECONDS`). */
const MAX_VIDEO_SECONDS = 60;

interface VideoRow {
  id: string;
  brand_line: string;
  category: string;
  price: string | null;
  moq: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  duration_seconds: number | null;
  video_width: number | null;
  video_height: number | null;
  status: Status;
  rejection_reason: string | null;
  vendor_id: string;
  created_at: string;
  /** The tagged product, via product_videos.product_id. Nullable — a video need not tag one. */
  product: { name: string } | null;
}

const TABS: { id: Status; label: string }[] = [
  { id: "under_review", label: "Queue (under review)" },
  { id: "live", label: "Live" },
  { id: "rejected", label: "Rejected (audit)" },
];

/**
 * Video Closeups moderation queue.
 *
 * Deliberately a copy of Products.tsx's structure, because the enforcement
 * underneath is the same: `trg_product_videos_moderation` mirrors
 * `enforce_products_moderation` clause for clause, and the `pvideos_*` policies
 * gate the row the way the product ones do. Same gate, same shape, same page.
 *
 * WHY A RAW UPDATE AND NOT approve_vendor_content()/reject_vendor_content():
 * both RPCs exist, are SECURITY DEFINER and are correctly role-gated — but every
 * other moderation screen here (Products, Ads, VendorDetail) writes the column
 * directly and lets RLS + the BEFORE trigger refuse it. Matching that keeps one
 * convention in this app instead of two. The one thing the raw path does not get
 * for free is the RPC's "you may only approve something that is under_review"
 * guard (P0002); the UI supplies it exactly as Products.tsx does — Approve is not
 * rendered for a row that is already live, and each tab holds one status.
 *
 * The vendor-wide button below IS an RPC, because bulk approval has no
 * column-level equivalent to write.
 */
export default function Videos() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "videos");
  const [tab, setTab] = useState<Status>("under_review");
  const [rejecting, setRejecting] = useState<VideoRow | null>(null);
  const [reason, setReason] = useState("");
  const [playing, setPlaying] = useState<VideoRow | null>(null);
  // Reset per open: a failure on one row must not caption the next one.
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [bulkFor, setBulkFor] = useState<{ vendorId: string; label: string } | null>(null);

  const videos = useQuery({
    queryKey: ["videos", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_videos")
        .select(
          `id, brand_line, category, price, moq, thumbnail_url, video_url,
           duration_seconds, video_width, video_height, status, rejection_reason,
           vendor_id, created_at,
           product:products(name)`,
        )
        .eq("status", tab)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as VideoRow[];
      const vendors = await fetchVendorsByIds(rows.map((r) => r.vendor_id));
      return { rows, vendors };
    },
  });

  /**
   * Approve and reject are one `product_videos` UPDATE of `status` (plus the
   * reason). The trigger raises 42501 unless the caller holds
   * super_admin/product_moderator — for `rejection_reason` as much as for
   * `status` — so a support session sees the database's own refusal rather than a
   * button that quietly did nothing.
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
        await supabase
          .from("product_videos")
          .update({ status, rejection_reason })
          .eq("id", id)
          .select("id"),
        `set video to ${status}`,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["videos"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * `approve_vendor_content_bulk(vendor_id)` — the original vendor-wide function,
   * renamed in 20260801102505 when per-item approve took its old name. It flips
   * EVERY under_review row that vendor owns across products, product_videos AND
   * catalogues, and returns void: nothing to assertWrote, no count to report. So
   * we re-count this vendor's still-pending videos either side of the call and
   * report what actually moved, instead of claiming success on a no-op.
   */
  const bulkApprove = useMutation({
    mutationFn: async (vendorId: string) => {
      const pending = () =>
        supabase
          .from("product_videos")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", vendorId)
          .eq("status", "under_review");

      const before = await pending();
      if (before.error) throw new Error(before.error.message);

      const { error } = await supabase.rpc("approve_vendor_content_bulk", { target: vendorId });
      if (error) throw new Error(describeWriteError(error));

      const after = await pending();
      if (after.error) throw new Error(after.error.message);

      return (before.count ?? 0) - (after.count ?? 0);
    },
    onSuccess: (moved) => {
      toast.success(
        moved === 0
          ? "Nothing was pending for this vendor — no videos changed."
          : `${moved} video${moved === 1 ? "" : "s"} approved. Any pending products and ` +
              "catalogues from this vendor went live in the same call.",
      );
      setBulkFor(null);
      void qc.invalidateQueries({ queryKey: ["videos"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function approve(v: VideoRow) {
    moderate.mutate(
      { id: v.id, status: "live", rejection_reason: null },
      { onSuccess: () => toast.success(`"${v.brand_line}" is now live`) },
    );
  }

  function submitRejection() {
    if (!rejecting || !reason.trim()) return;
    moderate.mutate(
      { id: rejecting.id, status: "rejected", rejection_reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`"${rejecting.brand_line}" rejected`);
          setRejecting(null);
          setReason("");
        },
      },
    );
  }

  if (videos.isLoading) return <Spinner />;
  if (videos.error) return <ErrorNote message={(videos.error as Error).message} />;

  const { rows, vendors } = videos.data!;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Video Closeups"
        subtitle="Moderate vendor-submitted product videos. Approving publishes to the buyer feed; rejecting requires a reason the vendor will read."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "videos")} />}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {rows.length === 0 ? (
        <Empty>
          {tab === "under_review"
            ? "Nothing waiting for review."
            : tab === "live"
              ? "No live videos."
              : "No rejected videos."}
        </Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              vendor={vendors.get(v.vendor_id)}
              writable={writable}
              busy={moderate.isPending || bulkApprove.isPending}
              onPlay={() => setPlaying(v)}
              onApprove={() => approve(v)}
              onReject={() => {
                setRejecting(v);
                setReason("");
              }}
              onBulk={
                tab === "under_review"
                  ? () =>
                      setBulkFor({
                        vendorId: v.vendor_id,
                        label: vendors.get(v.vendor_id)?.brand_name ?? "this vendor",
                      })
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Playback. The mp4 is fetched only once this opens — the list itself
          costs one poster JPEG per row, which matters on a 5 GB/month egress
          budget shared with the buyer app. */}
      <Modal
        open={playing !== null}
        title={playing ? `${playing.brand_line} — ${playing.category}` : ""}
        onClose={() => { setPlaying(null); setPlaybackFailed(false); }}
      >
        {playing?.video_url ? (
          <>
            <video
              key={playing.id}
              src={playing.video_url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              // A bare <video> whose src 404s renders as a silent black
              // rectangle, which reads exactly like a bad upload. That is the
              // wrong conclusion for a provider='bunny' row: Bunny's playback
              // URL is recorded at insert time but the file only exists once
              // encoding finishes. Without this, the most likely first incident
              // of the Bunny migration is a moderator REJECTING a good video
              // for being blank.
              onError={() => setPlaybackFailed(true)}
              onLoadedData={() => setPlaybackFailed(false)}
              className="max-h-[65vh] w-full rounded-lg bg-black"
            />
            {playbackFailed && (
              <Note>
                This file did not load. If it was just uploaded to Bunny it is probably still
                encoding — wait a minute and reopen before judging it. If it stays blank, the
                asset is missing at the provider and the row should be rejected.
              </Note>
            )}
          </>
        ) : (
          <Note>No video file is recorded on this row, so there is nothing to play.</Note>
        )}
      </Modal>

      <Modal
        open={rejecting !== null}
        title={`Reject "${rejecting?.brand_line ?? ""}"`}
        onClose={() => setRejecting(null)}
      >
        <p className="mb-2 text-sm text-ink-muted">
          A reason is required. It is stored on the video, shown in the Rejected tab, and the
          vendor can read it — write it for them, not for us.
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
          <Button
            variant="danger"
            disabled={!reason.trim() || moderate.isPending}
            onClick={submitRejection}
          >
            Reject video
          </Button>
        </div>
      </Modal>

      <Modal
        open={bulkFor !== null}
        title={`Approve everything pending for ${bulkFor?.label ?? ""}`}
        onClose={() => setBulkFor(null)}
      >
        <p className="text-sm text-ink">
          This does not stop at videos. <strong>Every</strong> item this vendor has waiting —
          products, video closeups <em>and</em> catalogues — goes live in one call, including
          items nobody has looked at on this screen.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          There is no bulk undo. Reversing it means rejecting each item individually.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setBulkFor(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={bulkApprove.isPending}
            onClick={() => bulkFor && bulkApprove.mutate(bulkFor.vendorId)}
          >
            Approve all pending
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/*
 * No <FlagLog /> here, unlike Products.tsx — not an oversight. `admin_flags`
 * carries `admin_flags_entity_type_check`, which allows only
 * ('vendor','product','ad','conversation'). Rendering the log with
 * entityType="video" would look right and 23514 on the first note saved. Adding
 * it is a one-line constraint migration in this repo (20260802140000 did exactly
 * that for 'conversation'), deliberately out of scope here.
 */
function VideoCard({
  video: v,
  vendor,
  writable,
  busy,
  onPlay,
  onApprove,
  onReject,
  onBulk,
}: {
  video: VideoRow;
  vendor: VendorSummary | undefined;
  writable: boolean;
  busy: boolean;
  onPlay: () => void;
  onApprove: () => void;
  onReject: () => void;
  onBulk?: () => void;
}) {
  const overCap = v.duration_seconds != null && v.duration_seconds > MAX_VIDEO_SECONDS;

  return (
    <Card>
      <div className="flex flex-wrap gap-4">
        {/* Poster + play affordance. Portrait, because these are shot for a
            full-bleed vertical feed. */}
        <button
          type="button"
          onClick={onPlay}
          aria-label={`Play "${v.brand_line}"`}
          className="group relative h-28 w-20 shrink-0 overflow-hidden rounded border border-line bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35"
        >
          {v.thumbnail_url ? (
            // Same encoding window as the player above: hide a failed poster
            // rather than showing a broken-image glyph, so the card falls
            // through to the "No poster" state it already renders.
            <img
              src={v.thumbnail_url}
              alt=""
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-1 text-center text-xs text-ink-faint">
              No poster
            </span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-ink/30 opacity-80 transition-opacity group-hover:opacity-100">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink shadow-xs">
              <Play size={14} className="ml-0.5 fill-current" />
            </span>
          </span>
          {v.duration_seconds != null && (
            <span className="absolute bottom-1 right-1 rounded bg-ink/75 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white">
              {v.duration_seconds}s
            </span>
          )}
        </button>

        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-ink">{v.brand_line}</h3>
            {v.status === "live" && <Badge tone="green" dot>live</Badge>}
            {v.status === "rejected" && <Badge tone="red" dot>rejected</Badge>}
            {v.status === "under_review" && <Badge tone="amber" dot>under review</Badge>}
            {overCap && <Badge tone="red">over the {MAX_VIDEO_SECONDS}s cap</Badge>}
          </div>

          <div className="mt-1 text-sm text-ink-muted">
            Submitted {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
          </div>

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-ink-muted sm:grid-cols-3">
            <Attr label="Category" value={v.category} />
            <Attr label="Product" value={v.product?.name} />
            <Attr
              label="Length"
              value={v.duration_seconds != null ? `${v.duration_seconds}s` : null}
            />
            <Attr
              label="Size"
              value={v.video_width && v.video_height ? `${v.video_width}×${v.video_height}` : null}
            />
            <Attr label="Price" value={v.price} />
            <Attr label="MOQ" value={v.moq} />
          </dl>

          {/* Vendor context: who submitted this, and are they already trusted. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-2 text-xs text-ink-muted">
            <span className="font-medium text-ink">{vendor?.brand_name ?? "Unknown vendor"}</span>
            {vendor?.city && <span>· {vendor.city}</span>}
            {vendor?.is_verified ? <Badge tone="blue">verified</Badge> : <Badge>unverified</Badge>}
            {vendor?.account_status === "suspended" && <Badge tone="red">suspended</Badge>}
          </div>

          {!v.video_url && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              <span className="font-medium">No video file on this row.</span> There is nothing to
              review — the upload never finished, or its object path was lost.
              {v.status !== "rejected" &&
                " Reject it rather than approving a row buyers would meet as a broken player."}
            </div>
          )}

          {v.status === "rejected" && v.rejection_reason && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              <span className="font-medium">Rejection reason:</span> {v.rejection_reason}
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          {v.status !== "live" && (
            <Button variant="primary" disabled={!writable || busy} onClick={onApprove}>
              Approve
            </Button>
          )}
          {v.status !== "rejected" && (
            <Button variant="danger" disabled={!writable || busy} onClick={onReject}>
              {v.status === "live" ? "Pull down" : "Reject"}
            </Button>
          )}
          <Button onClick={onPlay}>Watch</Button>
          {onBulk && (
            <Button
              disabled={!writable || busy}
              onClick={onBulk}
              title="Approves this vendor's pending products, videos and catalogues"
            >
              Approve all for vendor…
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Attr({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="inline text-ink-faint">{label}: </dt>
      <dd className="inline text-ink-muted">{value || "—"}</dd>
    </div>
  );
}
