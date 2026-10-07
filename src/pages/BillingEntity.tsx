import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  Button, ErrorNote, Field, Input, Notice, Page, PageHeader, Panel, ReadOnlyBanner, Select, SkeletonList, Stack, Textarea,
} from "@/components/ui";
import {
  billingEntityProblems, EMPTY_BILLING_ENTITY, saveBillingEntity, useBillingEntity, useIndiaStates, type BillingEntity as Entity,
} from "@/lib/subscriptionSettings";

/**
 * BILLING DETAILS (subscriptions P0, 2026-10-08).
 *
 * Cosora's own legal and tax identity: the supplier block on every tax invoice. An
 * invoice freezes these details when it is issued (subscriptions P1), so a change here
 * affects only invoices issued afterwards. The database checks the GSTIN's checksum, that
 * it was registered in the state given, and that its PAN matches. Super admins and finance
 * admins edit it, with a reason recorded in the Admin Log.
 */

const FIELDS: { key: keyof Entity; label: string; hint?: string; upper?: boolean; wide?: boolean }[] = [
  { key: "legal_name", label: "Legal name", hint: "Exactly as on the GST registration.", wide: true },
  { key: "trade_name", label: "Trade name", hint: "Optional. Printed under the legal name.", wide: true },
  { key: "address_line1", label: "Registered address", wide: true },
  { key: "address_line2", label: "Address, second line", hint: "Optional.", wide: true },
  { key: "city", label: "City" },
  { key: "postal_code", label: "PIN code" },
  { key: "gstin", label: "GSTIN", upper: true },
  { key: "pan", label: "PAN", upper: true },
  { key: "sac_code", label: "SAC code", hint: "6 digits, for the service on the invoice. Confirm with your CA." },
  { key: "invoice_prefix", label: "Invoice number prefix", hint: "2 to 6 letters, e.g. INV.", upper: true },
  { key: "email", label: "Billing email", hint: "Optional. Printed on invoices." },
  { key: "phone", label: "Billing phone", hint: "Optional. Printed on invoices." },
];

export default function BillingEntity() {
  const role = useRole();
  const writable = canWrite(role, "billing-entity");
  const qc = useQueryClient();
  const stored = useBillingEntity();
  const states = useIndiaStates();
  const [form, setForm] = useState<Entity>(EMPTY_BILLING_ENTITY);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (stored.data) setForm(pick(stored.data));
  }, [stored.data]);

  const problems = useMemo(() => billingEntityProblems(form, states.data ?? []), [form, states.data]);
  const valid = Object.keys(problems).length === 0;
  const changed = JSON.stringify(form) !== JSON.stringify(stored.data ? pick(stored.data) : EMPTY_BILLING_ENTITY);

  async function save() {
    setTried(true);
    if (!valid || !reason.trim()) return;
    setBusy(true);
    try {
      await saveBillingEntity(normalise(form), reason.trim());
      toast.success("Billing details saved.");
      setReason("");
      setTried(false);
      void qc.invalidateQueries({ queryKey: ["billing-entity"] });
    } catch (e) {
      toast.error((e as Error).message, { duration: 8000 });
    } finally {
      setBusy(false);
    }
  }

  if (stored.isPending || states.isPending) {
    return (
      <Page>
        <PageHeader title="Billing details" />
        <SkeletonList rows={1} height="h-96" />
      </Page>
    );
  }
  if (stored.error) return <ErrorNote message={(stored.error as Error).message} />;
  if (states.error) return <ErrorNote message={(states.error as Error).message} />;

  return (
    <Page>
      <PageHeader
        title="Billing details"
        subtitle="Cosora's legal and tax identity, printed on every tax invoice. An invoice keeps the details it was issued with."
      />
      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "billing-entity")} />}
      <Stack>
        {!stored.data && (
          <Notice tone="caution" title="Not set yet">
            Tax invoices can't name Cosora as the supplier until these details are saved.
          </Notice>
        )}
        <Panel title="Supplier on the invoice">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.slice(0, 6).map((f) => <TextField key={f.key} f={f} form={form} setForm={setForm} writable={writable} error={tried ? problems[f.key] : undefined} />)}
            <Field label="State" htmlFor="billing-state_code" error={tried ? problems.state_code : undefined} hint="The state the GSTIN is registered in.">
              <Select
                id="billing-state_code"
                value={form.state_code}
                disabled={!writable}
                onChange={(e) => setForm({ ...form, state_code: e.target.value })}
              >
                <option value="">Choose a state</option>
                {(states.data ?? []).map((s) => (
                  <option key={s.code} value={s.code}>{`${s.name} (${s.gst_code})`}</option>
                ))}
              </Select>
            </Field>
            {FIELDS.slice(6).map((f) => <TextField key={f.key} f={f} form={form} setForm={setForm} writable={writable} error={tried ? problems[f.key] : undefined} />)}
          </div>

          {writable && (
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <Field label="Reason" htmlFor="billing-reason" hint="Required. Recorded in the Admin Log." error={tried && !reason.trim() ? "Say why these details are changing." : undefined} className="min-w-[16rem] flex-1">
                <Textarea id="billing-reason" rows={2} value={reason} placeholder="Why are these details changing?" onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button variant="primary" disabled={!changed || busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save billing details"}
              </Button>
            </div>
          )}
          {stored.data?.updated_at && (
            <p className="mt-3 text-2xs text-ink-faint">
              {`Last changed ${format(new Date(stored.data.updated_at), "d MMM yyyy, HH:mm")}${stored.data.updated_by_name ? ` by ${stored.data.updated_by_name}` : ""}.`}
            </p>
          )}
        </Panel>
      </Stack>
    </Page>
  );
}

function TextField({
  f, form, setForm, writable, error,
}: {
  f: (typeof FIELDS)[number];
  form: Entity;
  setForm: (e: Entity) => void;
  writable: boolean;
  error?: string;
}) {
  const id = `billing-${f.key}`;
  return (
    <Field label={f.label} htmlFor={id} hint={f.hint} error={error} className={f.wide ? "sm:col-span-2" : undefined}>
      <Input
        id={id}
        value={form[f.key]}
        disabled={!writable}
        aria-invalid={Boolean(error)}
        onChange={(e) => setForm({ ...form, [f.key]: f.upper ? e.target.value.toUpperCase() : e.target.value })}
      />
    </Field>
  );
}

function pick(e: Entity): Entity {
  const out = { ...EMPTY_BILLING_ENTITY };
  for (const k of Object.keys(out) as (keyof Entity)[]) out[k] = e[k] ?? "";
  return out;
}

function normalise(e: Entity): Entity {
  const t = (s: string) => s.trim();
  return {
    ...e,
    legal_name: t(e.legal_name), trade_name: t(e.trade_name), address_line1: t(e.address_line1),
    address_line2: t(e.address_line2), city: t(e.city), postal_code: t(e.postal_code),
    gstin: t(e.gstin).toUpperCase(), pan: t(e.pan).toUpperCase(), sac_code: t(e.sac_code),
    invoice_prefix: t(e.invoice_prefix).toUpperCase(), email: t(e.email), phone: t(e.phone),
  };
}
