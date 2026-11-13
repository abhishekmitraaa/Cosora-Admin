import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  OVERDUE_DAYS,
  QUEUE_PAGE,
  countryLabel,
  decideRegistration,
  fetchRegistrationQueue,
  useRegistrationCounts,
  type QueueKind,
  type RegistrationQueueRow,
} from "@/lib/registrations";
import {
  Badge,
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

const SUBTITLE =
  "Sellers waiting on Cosora, oldest first. Sellers outside India need their registration approved before they can publish; " +
  "documents from every seller wait for review on the seller's page. Sellers are told 3–5 days.";

const WAITING = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/**
 * Registrations (2026-11-13, audit fix #20): the queue the seller registration had no screen for.
 *
 * Approvals: an overseas seller's registration (admin_vendor_registration_decide; approving needs a signed Supplier
 * Agreement and sets onboarding_complete). Documents: sellers with documents nobody has reviewed yet; the documents
 * are reviewed one by one on the seller's page (VendorKycPanel), as before.
 */
export default function Registrations() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "registrations");
  const [tab, setTab] = useState<QueueKind>("approval");
  const [rejecting, setRejecting] = useState<RegistrationQueueRow | null>(null);
  const [reason, setReason] = useState("");
  const counts = useRegistrationCounts();

  const queue = useInfiniteQuery({
    queryKey: ["registrations", "queue", tab],
    initialPageParam: null as { at: string; id: string } | null,
    queryFn: ({ pageParam }) => fetchRegistrationQueue(tab, pageParam),
    getNextPageParam: (last) => {
      if (last.length < QUEUE_PAGE) return undefined;
      const r = last[last.length - 1];
      return { at: r.waiting_since, id: tab === "approval" ? (r.submission_id ?? r.vendor_id) : r.vendor_id };
    },
  });

  const decide = useMutation({
    mutationFn: ({ row, approve, why }: { row: RegistrationQueueRow; approve: boolean; why: string | null }) =>
      decideRegistration(row.vendor_id, row.submission_id ?? "", approve, why),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["registrations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function approve(row: RegistrationQueueRow) {
    decide.mutate(
      { row, approve: true, why: null },
      { onSuccess: () => toast.success(`${row.brand_name ?? "The seller"} is registered and can publish`) },
    );
  }

  function submitRejection() {
    if (!rejecting || !reason.trim()) return;
    const row = rejecting;
    decide.mutate(
      { row, approve: false, why: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`${row.brand_name ?? "The seller"} was asked for changes`);
          setRejecting(null);
          setReason("");
        },
      },
    );
  }

  const rows = queue.data?.pages.flat() ?? [];
  const c = counts.data;

  return (
    <Page>
      <PageHeader title="Registrations" subtitle={SUBTITLE} />
      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "registrations")} />}

      <Tabs
        tabs={[
          { id: "approval" as const, label: "Approvals (outside India)", count: c?.approval },
          { id: "documents" as const, label: "Documents to review", count: c?.documents },
        ]}
        active={tab}
        onChange={setTab}
      />

      {queue.isLoading ? (
        <SkeletonList rows={3} height="h-20" />
      ) : queue.error ? (
        <ErrorNote message={(queue.error as Error).message} />
      ) : rows.length === 0 ? (
        <Empty>{tab === "approval" ? "No registrations waiting for approval." : "No documents waiting for review."}</Empty>
      ) : (
        <div className="space-y-2.5" data-testid="registration-queue">
          {rows.map((r) => (
            <Card key={`${r.kind}-${r.submission_id ?? r.vendor_id}`} className="py-3">
              <div className="flex flex-wrap items-center gap-3" data-testid="registration-row">
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/vendors/${r.vendor_id}`} className="font-semibold text-ink hover:underline">
                      {r.brand_name ?? "Unnamed seller"}
                    </Link>
                    <Badge tone={r.days_waiting > OVERDUE_DAYS ? "critical" : r.days_waiting >= 3 ? "caution" : "neutral"}>
                      {r.days_waiting === 0 ? "today" : r.days_waiting === 1 ? "1 day waiting" : `${r.days_waiting} days waiting`}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {countryLabel(r.country_code)} · since {WAITING.format(new Date(r.waiting_since))}
                    {r.pending_docs > 0 && ` · ${r.pending_docs} document${r.pending_docs === 1 ? "" : "s"} not reviewed`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {/* A link styled as the outline button: a <button> inside an <a> is not valid. */}
                  <Link
                    to={`/vendors/${r.vendor_id}`}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-line-control bg-surface px-3 py-1.5 text-sm font-medium text-ink shadow-xs hover:bg-surface-2"
                  >
                    Open documents
                  </Link>
                  {r.kind === "approval" && (
                    <>
                      <Button variant="primary" disabled={!writable || decide.isPending} onClick={() => approve(r)}>
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        disabled={!writable || decide.isPending}
                        onClick={() => {
                          setRejecting(r);
                          setReason("");
                        }}
                      >
                        Ask for changes
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {queue.hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button disabled={queue.isFetchingNextPage} onClick={() => void queue.fetchNextPage()}>
                {queue.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal
        open={rejecting !== null}
        title={`Ask ${rejecting?.brand_name ?? "the seller"} for changes`}
        onClose={() => setRejecting(null)}
      >
        <p className="mb-2 text-sm text-ink-muted">
          The seller sees this reason on their registration form, with everything they entered, and can resubmit.
        </p>
        <Textarea
          rows={4}
          autoFocus
          value={reason}
          placeholder="e.g. The registration certificate has expired. Upload the current one."
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setRejecting(null)}>Cancel</Button>
          <Button variant="danger" disabled={!reason.trim() || decide.isPending} onClick={submitRejection}>
            Send back to the seller
          </Button>
        </div>
      </Modal>
    </Page>
  );
}
