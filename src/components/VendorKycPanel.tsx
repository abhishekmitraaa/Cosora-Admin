import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  Badge, Button, Empty, Modal, Notice, Panel, SkeletonList, Textarea,
} from "@/components/ui";

/**
 * KYC review — the counterparty to the promise the vendor app makes.
 *
 * /onboarding tells a vendor their documents are "submitted for review" and
 * leaves `vendor_documents.verified = false`. Until this panel existed nothing
 * in this app could see one of those rows, so that promise had nobody on the
 * other end of it.
 *
 * TWO THINGS TO KNOW BEFORE CHANGING ANYTHING HERE:
 *
 * 1. Documents live in the PRIVATE `business-docs` bucket. There is no public
 *    URL. An admin reads one through `createSignedUrl`, which works because
 *    `business_docs_owner_select` is
 *    `foldername(name)[1] = auth.uid() OR is_admin()` — the same policy the
 *    owning vendor uses, no admin-only branch. Verified against the live
 *    project before this was built.
 *
 * 2. The verdict goes through `set_vendor_document_verified()`, a SECURITY
 *    DEFINER RPC, and NOT a client UPDATE. Two reasons. The repo's standing one:
 *    an UPDATE that RLS denies matches zero rows and returns success, so a
 *    refused write looks identical to an applied one. And the specific one: a
 *    `before insert or update` trigger now refuses the review columns to
 *    non-admins, because `vendor_documents_all` (ALL, `vendor_id = auth.uid()
 *    OR is_admin()`) previously let a VENDOR set `verified = true` on their own
 *    KYC with one line of client code.
 */

interface KycDocRow {
  id: string;
  doc_type: string;
  file_url: string | null;
  verified: boolean;
  created_at: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
}

const DOC_LABELS: Record<string, string> = {
  pan: "PAN",
  gst: "GST",
  cin: "CIN",
  aadhaar: "Aadhaar",
};

/** Matches the vendor app: never reviewed is not the same as rejected. */
function isRejected(d: KycDocRow): boolean {
  return !d.verified && d.reviewed_at !== null;
}

export function kycSummary(docs: KycDocRow[] | undefined): {
  label: string;
  tone: "neutral" | "positive" | "caution" | "critical" | "info";
} {
  if (!docs || docs.length === 0) return { label: "none submitted", tone: "neutral" };
  if (docs.some(isRejected)) return { label: "rejected", tone: "critical" };
  if (docs.every((d) => d.verified)) return { label: "all verified", tone: "positive" };
  const done = docs.filter((d) => d.verified).length;
  return { label: `${done}/${docs.length} verified`, tone: "caution" };
}

export function useVendorKycDocs(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor-kyc", vendorId],
    enabled: Boolean(vendorId),
    queryFn: async (): Promise<KycDocRow[]> => {
      const { data, error } = await supabase
        .from("vendor_documents")
        .select("id, doc_type, file_url, verified, created_at, rejection_reason, reviewed_at")
        .eq("vendor_id", vendorId!)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as KycDocRow[];
    },
  });
}

/** Signed on demand, for one document, not for the whole list on mount. */
function ViewDocButton({ doc }: { doc: KycDocRow }) {
  const [loading, setLoading] = useState(false);
  if (!doc.file_url) return <span className="text-2xs text-ink-ghost">no file</span>;

  const open = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage
      .from("business-docs")
      .createSignedUrl(doc.file_url!, 300);
    setLoading(false);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "That file is unavailable.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Button onClick={open} disabled={loading} className="gap-1 !px-2.5 !py-1 !text-2xs">
      {loading ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
      {loading ? "Opening…" : "View document"}
    </Button>
  );
}

export default function VendorKycPanel({ vendorId }: { vendorId: string }) {
  const role = useRole();
  const qc = useQueryClient();
  // The DB gate on set_vendor_document_verified() is support/super_admin — the
  // same predicate set_account_status() uses — so the UI gate is "accounts",
  // NOT "vendors" (which is vendor_ops/super_admin). Matching the button to the
  // function keeps a disabled control from being the only thing standing
  // between a wrong role and a 42501.
  const writable = canWrite(role, "accounts");

  const docs = useVendorKycDocs(vendorId);
  const [rejecting, setRejecting] = useState<KycDocRow | null>(null);
  const [reason, setReason] = useState("");

  const review = useMutation({
    mutationFn: async ({ id, verified, reason }: { id: string; verified: boolean; reason?: string }) => {
      const { error } = await supabase.rpc("set_vendor_document_verified", {
        p_doc_id: id,
        p_verified: verified,
        // `undefined`, not `null`: p_reason is `text DEFAULT NULL`, so omitting
        // it and passing null land on the same value, and the generated types
        // type an optional RPC argument as `string | undefined`. (Surfaced when
        // database.types.ts was regenerated for certificate_orders — the older
        // file typed it loosely enough to accept null.)
        p_reason: reason ?? undefined,
      });
      // The function raises on every failure path, so an error here is a real
      // refusal — never a silent no-op.
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-kyc", vendorId] });
      void qc.invalidateQueries({ queryKey: ["vendor", vendorId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitRejection = () => {
    if (!rejecting || !reason.trim()) return;
    review.mutate(
      { id: rejecting.id, verified: false, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`${DOC_LABELS[rejecting.doc_type] ?? rejecting.doc_type} rejected`);
          setRejecting(null);
          setReason("");
        },
      },
    );
  };

  return (
    <Panel
      title="KYC documents"
      description="Scans the vendor uploaded during registration. Stored in the private business-docs bucket and opened through a 5-minute signed URL — nothing here is publicly fetchable."
    >
      {!writable && (
        <Notice tone="caution" className="mb-3 text-xs">
          {readOnlyReason(role, "accounts")}
        </Notice>
      )}

      {docs.isLoading ? (
        <SkeletonList rows={2} height="h-16" />
      ) : docs.error ? (
        <Notice tone="critical" className="text-xs">{(docs.error as Error).message}</Notice>
      ) : (docs.data ?? []).length === 0 ? (
        <Empty>This vendor has not submitted any KYC documents.</Empty>
      ) : (
        <div className="divide-y divide-line rounded-xl border border-line bg-surface-2">
          {(docs.data ?? []).map((d) => (
            <div key={d.id} className="px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{DOC_LABELS[d.doc_type] ?? d.doc_type}</p>
                  <p className="text-2xs text-ink-faint">
                    Submitted {format(new Date(d.created_at), "d MMM yyyy")}
                    {d.reviewed_at && ` · reviewed ${format(new Date(d.reviewed_at), "d MMM yyyy")}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {d.verified ? (
                    <Badge tone="positive">verified</Badge>
                  ) : isRejected(d) ? (
                    <Badge tone="critical">rejected</Badge>
                  ) : (
                    <Badge tone="caution">awaiting review</Badge>
                  )}
                  <ViewDocButton doc={d} />
                </div>
              </div>

              {isRejected(d) && d.rejection_reason && (
                <p className="mt-2 rounded-lg bg-surface px-2.5 py-1.5 text-2xs text-ink-muted">
                  <span className="font-semibold text-ink">Rejection reason.</span> {d.rejection_reason}
                </p>
              )}

              {writable && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {!d.verified && (
                    <Button
                      variant="primary"
                      className="!px-2.5 !py-1 !text-2xs"
                      disabled={review.isPending}
                      onClick={() =>
                        review.mutate(
                          { id: d.id, verified: true },
                          { onSuccess: () => toast.success(`${DOC_LABELS[d.doc_type] ?? d.doc_type} verified`) },
                        )
                      }
                    >
                      Approve
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    className="!px-2.5 !py-1 !text-2xs"
                    disabled={review.isPending}
                    onClick={() => { setRejecting(d); setReason(d.rejection_reason ?? ""); }}
                  >
                    {d.verified ? "Revoke and reject" : "Reject"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Notice tone="info" className="mt-3 text-2xs">
        Approving a document does <span className="font-medium">not</span> grant the trust seal. The seal has three
        sources and this is not one of them — use Manual verification above, with this as context.
      </Notice>

      <Modal
        open={rejecting !== null}
        title={`Reject ${DOC_LABELS[rejecting?.doc_type ?? ""] ?? rejecting?.doc_type ?? ""}`}
        onClose={() => { setRejecting(null); setReason(""); }}
      >
        <p className="mb-2 text-sm text-ink-muted">
          A reason is required — the database refuses a rejection without one. The vendor sees this text on their
          KYC page and is notified, so write what they need to re-submit.
        </p>
        <Textarea
          rows={4}
          autoFocus
          value={reason}
          placeholder="e.g. The scan is cut off at the bottom — re-upload the full card."
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
          <Button variant="danger" disabled={!reason.trim() || review.isPending} onClick={submitRejection}>
            Reject document
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}
