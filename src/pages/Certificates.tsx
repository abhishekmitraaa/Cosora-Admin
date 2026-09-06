import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { SEED_ACTIVE, useDevSeed } from "@/lib/devSeed/store";
import {
  CERT_STATUS_LABELS,
  certificateStore,
  COURIERS,
  nextStatus,
  updateCertificate,
  type CertificateOrder,
  type CertStatus,
} from "@/lib/devSeed/certificates";
import {
  Attr,
  AttrGrid,
  Badge,
  Button,
  Card,
  DevSeedBanner,
  Empty,
  Field,
  Input,
  Notice,
  Note,
  Page,
  PageHeader,
  ReadOnlyBanner,
  Select,
  StatusBadge,
  Tabs,
} from "@/components/ui";

/**
 * C3 - CERTIFICATE FULFILMENT. DEV-SEED DATA. Nothing here reads or writes
 * Supabase.
 *
 * ⚠ BUILT PENDING ANDY'S CONFIRMATION that the certificate is a physical
 * printed article that gets couriered. Everything on this screen (print step,
 * courier, tracking number, delivery address, returns) follows from that
 * assumption. See src/lib/devSeed/certificates.ts for what exists in the schema
 * today, which is the ₹199 `verifiedCertificate` ad placement and nothing else.
 *
 * ROLE GATE: super_admin only, in roles.ts, section "certificates". The
 * `delivery_team` role that should own this screen day to day does not exist in
 * the `admin_role_type` enum yet; the note in roles.ts says exactly where to
 * add it once Phase 2 creates it.
 *
 * SHAPE: card-and-action, matching Products.tsx and Ads.tsx, with tabs by
 * status the way those two use tabs by moderation state.
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
  const rows = useDevSeed(certificateStore);
  const [tab, setTab] = useState<CertStatus>("processing");

  const tabs = TABS.map((t) => ({ ...t, count: rows.filter((r) => r.status === t.id).length }));
  const visible = rows.filter((r) => r.status === tab);

  return (
    <Page>
      <PageHeader
        title="Certificates"
        subtitle="Printing and dispatch of purchased verification certificates."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "certificates")} />}
      {SEED_ACTIVE && <DevSeedBanner what="Certificate fulfilment" />}

      <Notice tone="caution" title="Built on an unconfirmed decision" className="mb-4">
        This screen assumes the verification certificate is a{" "}
        <span className="font-semibold">physical printed article that gets couriered</span>. The
        print step, the courier, the tracking number, the delivery address and the returned tab all
        follow from that. If it turns out to be a digital badge, this collapses to issued and
        revoked and most of what is below comes out. Flagged for Andy rather than assumed silently.
      </Notice>

      <Note className="mb-4">
        The address on each card is a <span className="font-medium text-ink">snapshot taken at purchase</span>,
        not a live read of the vendor profile. A vendor who moves after ordering must not have the
        address rewritten on a parcel already in transit, so Phase 2's table needs to store it rather
        than join to <span className="font-mono text-2xs">vendor_profiles</span>.
      </Note>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {visible.length === 0 ? (
        <Empty>
          {rows.length === 0
            ? "No certificate orders. In a production build this screen is empty because the certificate_orders table does not exist yet."
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
  const [courier, setCourier] = useState(c.courier ?? "");
  const [tracking, setTracking] = useState(c.trackingNumber ?? "");
  const next = nextStatus(c.status);

  /**
   * Dispatch is the one step with a precondition, and it is a real one: a
   * parcel marked dispatched with no courier and no tracking number is a parcel
   * nobody can find when the vendor calls. So the button is disabled until both
   * are present, and says why.
   */
  const dispatchBlocked = next === "dispatched" && (!courier.trim() || !tracking.trim());

  function advance() {
    if (!next) return;
    updateCertificate(c.id, {
      status: next,
      ...(next === "dispatched"
        ? { courier: courier.trim(), trackingNumber: tracking.trim() }
        : {}),
    });
    toast.success(`${c.reference} moved to ${CERT_STATUS_LABELS[next].toLowerCase()}`);
  }

  return (
    <Card className="transition-shadow hover:shadow-card-hover">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[18rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-section font-bold text-ink">{c.vendorName}</h3>
            <StatusBadge status={c.status} />
            <span className="font-mono text-2xs text-ink-faint">{c.reference}</span>
          </div>

          <address className="mt-2 not-italic text-sm leading-relaxed text-ink-muted">
            {c.address}
            <br />
            {c.city}, {c.state} {c.postalCode}
          </address>

          <AttrGrid cols={3}>
            <Attr label="Contact" value={c.contactName} />
            <Attr label="Phone" value={c.contactPhone} mono />
            <Attr label="Purchased" value={format(new Date(c.purchasedAt), "d MMM yyyy")} />
            {c.courier && <Attr label="Courier" value={c.courier} />}
            {c.trackingNumber && <Attr label="Tracking" value={c.trackingNumber} mono />}
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
                hint={dispatchBlocked ? "Both are required before dispatch." : undefined}
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
              disabled={!writable || dispatchBlocked}
              onClick={advance}
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
              disabled={!writable}
              onClick={() => {
                const why = prompt("Why has this come back? It is recorded on the order.");
                if (!why?.trim()) return;
                updateCertificate(c.id, { status: "returned", returnReason: why.trim() });
                toast.success(`${c.reference} marked returned`);
              }}
            >
              Mark returned
            </Button>
          )}

          {(c.status === "processing" || c.status === "printed") && (
            <Button
              variant="danger"
              className="w-full"
              disabled={!writable}
              onClick={() => {
                const why = prompt("Why is this being cancelled? It is recorded on the order.");
                if (!why?.trim()) return;
                updateCertificate(c.id, { status: "cancelled", returnReason: why.trim() });
                toast.success(`${c.reference} cancelled`);
              }}
            >
              Cancel order
            </Button>
          )}

          {c.status === "returned" && (
            <Button
              className="w-full"
              disabled={!writable}
              onClick={() => {
                updateCertificate(c.id, {
                  status: "printed",
                  courier: null,
                  trackingNumber: null,
                  returnReason: null,
                });
                toast.success(`${c.reference} back in the print queue`);
              }}
            >
              Send again
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
