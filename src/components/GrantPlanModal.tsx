import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button, Field, Input, Modal, Note, Select, Textarea } from "@/components/ui";
import { grantPlan, searchVendors, todayIST, type PlanWithPrice, type VendorHit } from "@/lib/subscriptionAdmin";

/**
 * Give a vendor a paid plan at no charge until a date (subscriptions P12): a promotion or a
 * goodwill extension. No invoice is made, because no money moves. The database refuses it
 * while the vendor has a paid period running (change their plan instead) or autopay set up,
 * so it never replaces what someone paid for. The vendor is told; the reason goes into the
 * Admin Log. A plan paid outside Razorpay (a bank transfer) is not this: it needs a tax invoice.
 */
export function GrantPlanModal({ plans, onClose, onDone }: {
  plans: PlanWithPrice[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<VendorHit[]>([]);
  const [vendor, setVendor] = useState<VendorHit | null>(null);
  const [plan, setPlan] = useState(plans.find((p) => p.id === "silver")?.id ?? plans[0]?.id ?? "");
  const [until, setUntil] = useState(todayIST(30));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Search as the admin types, a moment after they stop.
  useEffect(() => {
    if (vendor) return;
    let live = true;
    const t = setTimeout(() => {
      searchVendors(query).then((r) => { if (live) setHits(r); }).catch(() => { if (live) setHits([]); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query, vendor]);

  const save = async () => {
    if (!vendor) return;
    setBusy(true);
    try {
      const r = await grantPlan({ vendorId: vendor.id, plan, until, reason: reason.trim() });
      toast.success(`${r.vendor ?? "The vendor"} has ${r.plan} until ${format(new Date(`${until}T00:00:00`), "d MMM yyyy")}`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message, { duration: 10000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="Give a complimentary plan" onClose={onClose}>
      <Note className="mb-3">
        No charge and no invoice. Not for a vendor with a paid period running (change their plan instead) or with autopay set up.
        The vendor is told, and the reason goes into the Admin Log.
      </Note>
      <Field label="Vendor" htmlFor="grant-vendor">
        {vendor ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-ink">
              {vendor.brand_name ?? "Unnamed vendor"}
              {vendor.city && <span className="text-ink-faint">{` · ${vendor.city}`}</span>}
            </span>
            <Button size="sm" variant="ghost" onClick={() => { setVendor(null); setQuery(""); }}>Change</Button>
          </div>
        ) : (
          <>
            <Input id="grant-vendor" autoFocus placeholder="Type part of the brand name" value={query} onChange={(e) => setQuery(e.target.value)} />
            {hits.length > 0 && (
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-line text-sm" data-testid="grant-vendor-hits">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-surface-2" onClick={() => setVendor(h)}>
                      {h.brand_name ?? "Unnamed vendor"}
                      {h.city && <span className="text-ink-faint">{` · ${h.city}`}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length >= 2 && hits.length === 0 && <p className="mt-1 text-xs text-ink-faint">No vendor by that name.</p>}
          </>
        )}
      </Field>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Plan" htmlFor="grant-plan">
          <Select id="grant-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            {plans.filter((p) => p.id !== "free").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Last day" htmlFor="grant-until" hint="It ends at midnight after this day (IST).">
          <Input id="grant-until" type="date" min={todayIST(1)} max={todayIST(730)} value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
      </div>
      <Field label="Reason" htmlFor="grant-reason" hint="Required. Recorded in the Admin Log, not shown to the vendor." className="mt-3">
        <Textarea id="grant-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this plan complimentary?" />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Not now</Button>
        <Button variant="primary" disabled={busy || !vendor || !plan || !until || reason.trim().length < 3} onClick={() => void save()}>
          {busy ? "Giving…" : "Give the plan"}
        </Button>
      </div>
    </Modal>
  );
}
