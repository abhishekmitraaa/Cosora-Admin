import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  CERT_STATUS_LABELS,
  COURIERS,
  cancelCertificate,
  dispatchCertificate,
  fetchCertificateOrders,
  markDelivered,
  markPrinted,
  markReturned,
  missingAddress,
  nextStatus,
  type CertificateOrder,
  type CertStatus,
} from "@/lib/certificates";
import {
  Attr,
  AttrGrid,
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Input,
  Notice,
  Note,
  Page,
  PageHeader,
  ReadOnlyBanner,
  Select,
  SkeletonList,
  StatusBadge,
  Tabs,
} from "@/components/ui";

/**
 * C3 - CERTIFICATE FULFILMENT. REAL DATA.
 *
 * WHAT CHANGED, 2026-09-13. This screen used to read and write
 * src/lib/devSeed/certificates.ts — nine invented orders in a local store,
 * under a banner saying it was "built on an unconfirmed decision" that the
 * certificate is a physical printed article that gets couriered.
 *
 * Mitra confirmed that decision. So the assumption is now a requirement, the
 * table exists (certificate_orders), and this screen reads it. The caution
 * banner is gone because the thing it cautioned about was answered — not
 * because it was quietly dropped.
 *
 * The tabs, the forward-only pipeline and the courier list are unchanged: they
 * were right, and only the data source moved.
 *
 * Every action is a SECURITY DEFINER RPC that raises on refusal. There is no
 * UPDATE policy on the table for any role, so a bare client UPDATE would match
 * zero rows and PostgREST would report SUCCESS — the clerk would be told a
 * parcel was dispatched when nothing had been written.
 */

const TABS: { id: CertStatus; label: string }[] = [
  { id: "processing", label: "Processing" },
  { id: "printed", label: "Printed" },
  { id: "dispatched", label: "Dispatched" },
  { id: "delivered", label: "Delivered" },
  { id: "returned", label: "Returned" },
  { id: "cancelled", label: "Cancelled" },
];

export default function Certificates() {
  const role = useRole();
  const writable = canWrite(role, "certificates");
  const [tab, setTab] = useState<CertStatus>("processing");

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["certificate_orders"],
    queryFn: fetchCertificateOrders,
  });

  const all = rows ?? [];
  const tabs = TABS.map((t) => ({ ...t, count: all.filter((r) => r.status === t.id).length }));
  const visible = all.filter((r) => r.status === tab);

  // A vendor with several open orders is almost always the per-product pricing
  // artefact, not a genuine request for several parcels: buying
  // `verifiedCertificate` alongside N products charges N x Rs199 and creates N
  // campaign rows, and the trigger makes one fulfilment order per row. The
  // certificate is about the VENDOR, so printing three identical ones is
  // nearly always wrong. Surfaced rather than auto-merged, because the fix is a
  // refund decision and that belongs to a person.
  const openByVendor = new Map<string, number>();
  for (const c of all) {
    if (c.status === "processing" || c.status === "printed") {
      openByVendor.set(c.vendorId, (openByVendor.get(c.vendorId) ?? 0) + 1);
    }
  }
  const duplicated = [...openByVendor.values()].filter((n) => n > 1).length;

  return (
    <Page>
      <PageHeader
        title="Certificates"
        subtitle="Printing and dispatch of purchased verification certificates."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "certificates")} />}

      <Note className="mb-4">
        The address on each card is a <span className="font-medium text-ink">snapshot taken at purchase</span>,
        not a live read of the vendor profile. A vendor who moves after ordering must not have the
        address rewritten on a parcel already in transit — so a vendor who fills their profile in
        later does <span className="font-medium text-ink">not</span> fix an order placed before they did.
      </Note>

      {duplicated > 0 && (
        <Notice tone="caution" title="Several open orders for one vendor" className="mb-4">
          {duplicated === 1 ? "One vendor has" : `${duplicated} vendors have`} more than one
          certificate open at once. Buying the certificate alongside several products charges once
          per product and creates one order per product, but the certificate is about the vendor —
          so this is usually a pricing artefact, not a request for several parcels. Confirm before
          printing, and cancel the extras with a reason so the refund is traceable.
        </Notice>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {error ? (
        <ErrorNote message={error instanceof Error ? error.message : "Couldn't load certificate orders"} />
      ) : isLoading ? (
        <SkeletonList rows={3} />
      ) : visible.length === 0 ? (
        <Empty>
          {all.length === 0
            ? "No certificate orders yet. One is created automatically when a vendor buys the verification certificate."
            : `Nothing is ${CERT_STATUS_LABELS[tab].toLowerCase()} right now.`}
        </Empty>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => (
            <CertificateCard key={c.id} order={c} writable={writable} />
          ))}
        </div>
      )}
    </Page>
  );
}

function CertificateCard({ order: c, writable }: { order: CertificateOrder; writable: boolean }) {
  const qc = useQueryClient();
  const [courier, setCourier] = useState(c.courier ?? "");
  const [tracking, setTracking] = useState(c.trackingNumber ?? "");
  const next = nextStatus(c.status);
  const noAddress = missingAddress(c);

  const act = useMutation({
    mutationFn: async (fn: () => Promise<void>) => fn(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["certificate_orders"] }),
    // The RPC raises on refusal, so the message the clerk sees is the database's
    // own reason ("this vendor had no delivery address on file when they
    // ordered"), not a generic failure.
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "That didn't go through"),
  });

  const run = (fn: () => Promise<void>, ok: string) =>
    act.mutate(fn, { onSuccess: () => { void qc.invalidateQueries({ queryKey: ["certificate_orders"] }); toast.success(ok); } });

  /**
   * Dispatch is the one step with real preconditions: a parcel marked
   * dispatched with no courier and no tracking number is a parcel nobody can
   * find when the vendor calls, and one with no address was never postable at
   * all. The database refuses both; the button says so first.
   */
  const dispatchBlocked = next === "dispatched" && (!courier.trim() || !tracking.trim() || noAddress);

  return (
    <Card className="transition-shadow hover:shadow-card-hover">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[18rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-section font-bold text-ink">
              {c.vendorName ?? c.contactName ?? "Unnamed vendor"}
            </h3>
            <StatusBadge status={c.status} />
            <span className="font-mono text-2xs text-ink-faint">{c.reference}</span>
          </div>

          {noAddress ? (
            <Notice tone="critical" className="mt-2 text-xs">
              <span className="font-semibold">No delivery address.</span> This vendor had no address
              on their profile when they ordered, so there is nothing to put on a label. Collect one
              and record it against the order before dispatch — the database refuses dispatch
              without it.
            </Notice>
          ) : (
            <address className="mt-2 not-italic text-sm leading-relaxed text-ink-muted">
              {c.addressLine}
              {c.area ? <>, {c.area}</> : null}
              <br />
              {[c.city, c.state].filter(Boolean).join(", ")} {c.postalCode}
            </address>
          )}

          <AttrGrid cols={3}>
            <Attr label="Contact" value={c.contactName ?? "—"} />
            <Attr label="Phone" value={c.contactPhone ?? "—"} mono />
            <Attr label="Purchased" value={format(new Date(c.purchasedAt), "d MMM yyyy")} />
            {c.courier && <Attr label="Courier" value={c.courier} />}
            {c.trackingNumber && <Attr label="Tracking" value={c.trackingNumber} mono />}
            {c.dispatchedAt && <Attr label="Dispatched" value={format(new Date(c.dispatchedAt), "d MMM yyyy")} />}
          </AttrGrid>

          {c.returnReason && (
            <Notice
              tone={c.status === "cancelled" ? "neutral" : "critical"}
              className="mt-2.5 text-xs"
            >
              <span className="font-semibold">
                {c.status === "cancelled" ? "Cancelled." : "Returned."}
              </span>{" "}
              {c.returnReason}
            </Notice>
          )}
        </div>

        <div className="w-full space-y-2 sm:w-64">
          {/* The courier fields only appear on the step that needs them, so a
              delivered card is not carrying an editable form it cannot use. */}
          {c.status === "printed" && (
            <>
              <Field label="Courier" htmlFor={`courier-${c.id}`}>
                <Select
                  id={`courier-${c.id}`}
                  disabled={!writable}
                  value={courier}
                  onChange={(e) => setCourier(e.target.value)}
                >
                  <option value="">Select a courier…</option>
                  {COURIERS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Tracking number"
                htmlFor={`tracking-${c.id}`}
                hint={
                  noAddress
                    ? "No address on file — dispatch is blocked."
                    : dispatchBlocked
                      ? "Both are required before dispatch."
                      : undefined
                }
              >
                <Input
                  id={`tracking-${c.id}`}
                  disabled={!writable}
                  value={tracking}
                  placeholder="77219048362"
                  onChange={(e) => setTracking(e.target.value)}
                  className="font-mono text-xs"
                />
              </Field>
            </>
          )}

          {next ? (
            <Button
              variant="primary"
              className="w-full"
              disabled={!writable || dispatchBlocked || act.isPending}
              onClick={() => {
                if (next === "printed") run(() => markPrinted(c.id), `${c.reference} marked printed`);
                else if (next === "dispatched")
                  run(() => dispatchCertificate(c.id, courier.trim(), tracking.trim()), `${c.reference} dispatched`);
                else run(() => markDelivered(c.id), `${c.reference} marked delivered`);
              }}
            >
              Mark {CERT_STATUS_LABELS[next].toLowerCase()}
            </Button>
          ) : c.status === "delivered" ? (
            <Badge tone="positive" dot>
              fulfilment complete
            </Badge>
          ) : null}

          {(c.status === "dispatched" || c.status === "delivered") && (
            <Button
              variant="danger"
              className="w-full"
              disabled={!writable || act.isPending}
              onClick={() => {
                const why = prompt("Why has this come back? It is recorded on the order and shown to the vendor.");
                if (!why?.trim()) return;
                run(() => markReturned(c.id, why.trim()), `${c.reference} marked returned`);
              }}
            >
              Mark returned
            </Button>
          )}

          {(c.status === "processing" || c.status === "printed") && (
            <Button
              variant="danger"
              className="w-full"
              disabled={!writable || act.isPending}
              onClick={() => {
                const why = prompt("Why is this being cancelled? It is recorded on the order and shown to the vendor.");
                if (!why?.trim()) return;
                run(() => cancelCertificate(c.id, why.trim()), `${c.reference} cancelled`);
              }}
            >
              Cancel order
            </Button>
          )}

          {c.status === "returned" && (
            <Button
              className="w-full"
              disabled={!writable || act.isPending}
              onClick={() => run(() => markPrinted(c.id), `${c.reference} back in the print queue`)}
            >
              Send again
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
