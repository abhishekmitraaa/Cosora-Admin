import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { QUEUE_PAGE, fetchApprovedPhotos, fetchPhotoQueue, reviewPhoto, type PhotoQueueRow } from "@/lib/registrations";
import {
  Button,
  Card,
  Empty,
  ErrorNote,
  Modal,
  Page,
  PageHeader,
  ReadOnlyBanner,
  SkeletonList,
  Tabs,
  Textarea,
} from "@/components/ui";

type Tab = "queue" | "live";

const SUBTITLE =
  "Photos sellers added of their premises, oldest first. Approving shows the photo on the seller's store; " +
  "rejecting needs a reason the seller sees on Business Profile.";

const ADDED = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The address when it is this project's public Storage, else null: the URL is the seller's to write. */
function storageUrl(u: string): string | null {
  try {
    const parsed = new URL(u);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.pathname.includes("/storage/v1/object/public/product-images/")
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Premises photos (2026-11-13, audit fix #15; Mitra D3: photos are reviewed before buyers see them).
 *
 * The queue is admin_premises_photo_queue (under review, oldest first, keyset pages); a decision is
 * admin_premises_photo_review, which checks the role, needs a reason to reject, notifies the seller and keeps the
 * store's approved list (vendor_profiles.office_photos) in step.
 */
export default function PremisesPhotos() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "premises-photos");
  const [tab, setTab] = useState<Tab>("queue");
  const [rejecting, setRejecting] = useState<PhotoQueueRow | null>(null);
  const [reason, setReason] = useState("");

  const queue = useInfiniteQuery({
    queryKey: ["premises-photos", tab],
    initialPageParam: null as { at: string; id: string } | null,
    queryFn: ({ pageParam }) => (tab === "queue" ? fetchPhotoQueue(pageParam) : fetchApprovedPhotos(pageParam)),
    getNextPageParam: (last) => {
      if (last.length < QUEUE_PAGE) return undefined;
      const r = last[last.length - 1];
      return { at: r.created_at, id: r.id };
    },
  });

  const decide = useMutation({
    mutationFn: ({ row, approve, why }: { row: PhotoQueueRow; approve: boolean; why: string | null }) =>
      reviewPhoto(row.id, approve, why),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["premises-photos"] });
      void qc.invalidateQueries({ queryKey: ["registrations", "counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submitRejection() {
    if (!rejecting || !reason.trim()) return;
    decide.mutate(
      { row: rejecting, approve: false, why: reason.trim() },
      {
        onSuccess: () => {
          toast.success(tab === "queue" ? "Photo rejected; the seller has been told why" : "Photo pulled down; the seller has been told why");
          setRejecting(null);
          setReason("");
        },
      },
    );
  }

  const rows = queue.data?.pages.flat() ?? [];

  return (
    <Page>
      <PageHeader title="Premises photos" subtitle={SUBTITLE} />
      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "premises-photos")} />}

      <Tabs
        tabs={[
          { id: "queue" as const, label: "Queue (under review)" },
          { id: "live" as const, label: "Approved" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {queue.isLoading ? (
        <SkeletonList rows={2} height="h-40" />
      ) : queue.error ? (
        <ErrorNote message={(queue.error as Error).message} />
      ) : rows.length === 0 ? (
        <Empty>{tab === "queue" ? "No premises photos waiting for review." : "No approved premises photos."}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="photo-queue">
            {rows.map((p) => {
              const src = storageUrl(p.url);
              return (
                <Card key={p.id} className="p-3">
                  <div className="flex flex-col gap-2.5" data-testid="photo-card">
                  {src ? (
                    <a href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-line">
                      <img src={src} alt={`Premises photo from ${p.brand_name ?? "a seller"}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    </a>
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-ink-faint">
                      Not a Cosora upload: reject it
                    </div>
                  )}
                  <div className="text-xs text-ink-muted">
                    <Link to={`/vendors/${p.vendor_id}`} className="font-semibold text-ink hover:underline">
                      {p.brand_name ?? "Unnamed seller"}
                    </Link>{" "}
                    · {tab === "queue" ? "added" : "approved"} {ADDED.format(new Date(p.created_at))}
                  </div>
                  <div className="flex gap-1.5">
                    {tab === "queue" && (
                    <Button
                      variant="primary"
                      className="flex-1"
                      disabled={!writable || decide.isPending || !src}
                      onClick={() =>
                        decide.mutate({ row: p, approve: true, why: null }, { onSuccess: () => toast.success("Photo approved: it's on the store") })
                      }
                    >
                      Approve
                    </Button>
                    )}
                    <Button
                      variant="danger"
                      className="flex-1"
                      disabled={!writable || decide.isPending}
                      onClick={() => {
                        setRejecting(p);
                        setReason("");
                      }}
                    >
                      {tab === "queue" ? "Reject" : "Pull down"}
                    </Button>
                  </div>
                  </div>
                </Card>
              );
            })}
          </div>
          {queue.hasNextPage && (
            <div className="mt-3 flex justify-center">
              <Button disabled={queue.isFetchingNextPage} onClick={() => void queue.fetchNextPage()}>
                {queue.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        open={rejecting !== null}
        title={`${tab === "queue" ? "Reject" : "Pull down"} a photo from ${rejecting?.brand_name ?? "this seller"}`}
        onClose={() => setRejecting(null)}
      >
        <p className="mb-2 text-sm text-ink-muted">A reason is required. The seller sees it beside the photo on Business Profile.</p>
        <Textarea
          rows={3}
          autoFocus
          value={reason}
          placeholder="e.g. The photo is blurred. Take it again in daylight."
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setRejecting(null)}>Cancel</Button>
          <Button variant="danger" disabled={!reason.trim() || decide.isPending} onClick={submitRejection}>
            {tab === "queue" ? "Reject photo" : "Pull down photo"}
          </Button>
        </div>
      </Modal>
    </Page>
  );
}
