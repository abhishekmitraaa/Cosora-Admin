import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { canWrite } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { countryLabel, decideRegistration, useVendorRegistration } from "@/lib/registrations";
import { Badge, Button, DataField, Modal, Notice, Panel, Textarea } from "@/components/ui";

const STATUS: Record<string, { label: string; tone: "caution" | "positive" | "critical" }> = {
  pending_review: { label: "waiting for approval", tone: "caution" },
  registered: { label: "registered", tone: "positive" },
  rejected: { label: "sent back for changes", tone: "critical" },
};

/**
 * A seller's registration (2026-11-13): where it stands, and for a seller outside India waiting on Cosora, the
 * decision (admin_vendor_registration_decide, which checks the role and the signed agreement itself). Sellers in
 * India are registered by their own submit; their documents are reviewed in the panel below.
 * Hidden for roles the registrations read policy doesn't admit, and for a seller with no registration row
 * (registered before 2026-11-13, or never submitted).
 */
export default function VendorRegistrationPanel({ vendorId }: { vendorId: string }) {
  const role = useRole();
  const qc = useQueryClient();
  const visible = role === "super_admin" || role === "vendor_ops" || role === "support";
  const writable = canWrite(role, "registrations");
  const reg = useVendorRegistration(vendorId, visible);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  const decide = useMutation({
    mutationFn: ({ approve, why }: { approve: boolean; why: string | null }) => decideRegistration(vendorId, approve, why),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["registrations"] });
      void qc.invalidateQueries({ queryKey: ["vendor", vendorId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!visible || reg.isLoading || !reg.data) return null;
  const r = reg.data;
  const s = STATUS[r.status] ?? { label: r.status, tone: "caution" as const };

  return (
    <Panel
      title="Seller registration"
      description="Sellers outside India publish only once Cosora approves their registration. Check their documents below first."
      actions={<Badge tone={s.tone}>{s.label}</Badge>}
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3" data-testid="registration-panel">
        <DataField label="Registered country" value={countryLabel(r.country_code)} />
        <DataField label="Submitted" value={format(new Date(r.created_at), "d MMM yyyy, HH:mm")} />
        <DataField label="Decided" value={r.decided_at ? format(new Date(r.decided_at), "d MMM yyyy, HH:mm") : null} />
      </dl>
      {r.status === "rejected" && r.reason && (
        <Notice tone="critical" className="mt-3 text-xs">
          <span className="font-semibold">Reason sent to the seller.</span> {r.reason}
        </Notice>
      )}
      {r.status === "pending_review" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={!writable || decide.isPending}
            onClick={() => decide.mutate({ approve: true, why: null }, { onSuccess: () => toast.success("Registration approved: the seller can publish") })}
          >
            Approve registration
          </Button>
          <Button variant="danger" disabled={!writable || decide.isPending} onClick={() => { setAsking(true); setReason(""); }}>
            Ask for changes
          </Button>
        </div>
      )}

      <Modal open={asking} title="Ask the seller for changes" onClose={() => setAsking(false)}>
        <p className="mb-2 text-sm text-ink-muted">The seller sees this reason on their registration form and can resubmit.</p>
        <Textarea rows={4} autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. The passport copy is unreadable. Upload a clear scan of the photo page." />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={() => setAsking(false)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={!reason.trim() || decide.isPending}
            onClick={() => decide.mutate({ approve: false, why: reason.trim() }, {
              onSuccess: () => { toast.success("Sent back to the seller"); setAsking(false); },
            })}
          >
            Send back to the seller
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}
