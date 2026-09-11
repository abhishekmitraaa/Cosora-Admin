import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge, Button, Empty, Notice, Panel, SkeletonList } from "@/components/ui";

/**
 * The signed supplier agreement — READ ONLY, and deliberately so.
 *
 * `vendor_contracts` has SELECT and INSERT policies and **no UPDATE or DELETE
 * for anyone, admins included**: an editable contract is not evidence. A UI with
 * an edit or delete control would imply a capability the database does not
 * grant, so this panel has none. (Two further guards sit behind that: the
 * vendor_id FK is ON DELETE RESTRICT, and DELETE on vendor_profiles is
 * admin-only — together they stopped a vendor from destroying their own
 * agreement by deleting their profile and letting the old cascade do the rest.)
 *
 * ON `signature_url` BEING NULL — this is the point of the panel, not an
 * oversight. Onboarding offers two ways to sign: draw on a canvas, or accept the
 * auto-generated cursive rendering of the typed name. Only a DRAWN signature
 * produces an image, so a typed one legitimately has no file. That is a valid,
 * complete signature — `signed_name` + `agreement_version` + timestamp + the
 * vendor's affirmative act — and this panel says so in words rather than
 * rendering a broken image or an unexplained blank. Generating a picture of the
 * typed name to fill the gap was considered and rejected: it would look like a
 * signature the vendor never made.
 */

interface ContractRow {
  id: string;
  signed_name: string;
  signature_url: string | null;
  agreement_version: string;
  created_at: string;
}

export function useVendorContracts(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor-contracts", vendorId],
    enabled: Boolean(vendorId),
    queryFn: async (): Promise<ContractRow[]> => {
      const { data, error } = await supabase
        .from("vendor_contracts")
        .select("id, signed_name, signature_url, agreement_version, created_at")
        .eq("vendor_id", vendorId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ContractRow[];
    },
  });
}

/** Signed on demand for the one signature being opened — same rule as KYC. */
function ViewSignatureButton({ path }: { path: string }) {
  const [loading, setLoading] = useState(false);

  const open = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from("business-docs").createSignedUrl(path, 300);
    setLoading(false);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "That signature is unavailable.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Button onClick={open} disabled={loading} className="gap-1 !px-2.5 !py-1 !text-2xs">
      {loading ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
      {loading ? "Opening…" : "View signature"}
    </Button>
  );
}

export default function VendorContractPanel({ vendorId }: { vendorId: string }) {
  const contracts = useVendorContracts(vendorId);
  const rows = contracts.data ?? [];

  return (
    <Panel
      title="Supplier agreement"
      description="Signed at the end of registration, in the same call that marks the vendor onboarded. Append-only: there is no update or delete policy for anyone, including admins, so this view is read-only by design."
    >
      {contracts.isLoading ? (
        <SkeletonList rows={1} height="h-16" />
      ) : contracts.error ? (
        <Notice tone="critical" className="text-xs">{(contracts.error as Error).message}</Notice>
      ) : rows.length === 0 ? (
        <Empty>
          This vendor has no signed agreement on file. That should be unreachable for an
          onboarded vendor — the signature is written by the same call that sets
          onboarding_complete.
        </Empty>
      ) : (
        <div className="divide-y divide-line rounded-xl border border-line bg-surface-2">
          {rows.map((c) => (
            <div key={c.id} className="px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{c.signed_name}</p>
                  <p className="text-2xs text-ink-faint">
                    Signed {format(new Date(c.created_at), "d MMM yyyy, HH:mm")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="info">{c.agreement_version}</Badge>
                  {c.signature_url ? (
                    <ViewSignatureButton path={c.signature_url} />
                  ) : (
                    // Not a missing file — a typed signature never had one.
                    <Badge tone="neutral">typed — no image on file</Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 1 && (
        <Notice tone="caution" className="mt-3 text-xs">
          More than one agreement on file. Multiple rows are legitimate when the vendor
          re-signed after the agreement text changed — check that the versions differ. Two rows
          at the SAME version are a duplicate from a retried submit before
          trg_vendor_contracts_one_per_version existed; they cannot be deleted by anyone and
          the newest is the one to read.
        </Notice>
      )}
    </Panel>
  );
}
