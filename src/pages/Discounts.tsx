import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { SEED_ACTIVE, useDevSeed } from "@/lib/devSeed/store";
import {
  addDiscount,
  discountState,
  discountStore,
  editDiscount,
  formatValue,
  STATE_COPY,
  TARGET_LABELS,
  type Discount,
  type DiscountKind,
  type DiscountState,
  type DiscountTarget,
} from "@/lib/devSeed/discounts";
import {
  Badge,
  Button,
  DevSeedBanner,
  Empty,
  Field,
  Input,
  Meter,
  Modal,
  Note,
  Page,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  ROW_HOVER,
  Select,
  Stack,
  Table,
  type Tone,
} from "@/components/ui";

/**
 * C4 - DISCOUNT CODES. DEV-SEED DATA. Nothing here reads or writes Supabase.
 *
 * roles.ts, section "discounts": super_admin and finance_admin, read and write.
 * See src/lib/devSeed/discounts.ts for the two things that must be server-side
 * when this becomes real (the redemption counter and the price calculation);
 * neither is a UI concern, which is why this screen manages the list of codes
 * and stops there.
 */

const STATE_TONE: Record<DiscountState, Tone> = {
  live: "positive",
  scheduled: "info",
  exhausted: "caution",
  expired: "neutral",
  inactive: "neutral",
};

const EMPTY: Omit<Discount, "id" | "usedCount"> = {
  code: "",
  kind: "percent",
  value: 10,
  appliesTo: "vendor_plan",
  maxUses: 100,
  validFrom: new Date().toISOString(),
  validTo: null,
  active: true,
};

export default function Discounts() {
  const role = useRole();
  const writable = canWrite(role, "discounts");
  const rows = useDevSeed(discountStore);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [draft, setDraft] = useState(EMPTY);

  function submitCreate() {
    const code = draft.code.trim().toUpperCase();
    if (!code) return;
    if (rows.some((d) => d.code.toUpperCase() === code)) {
      toast.error(`${code} already exists. Codes have to be unique.`);
      return;
    }
    addDiscount({ ...draft, code });
    setCreating(false);
    toast.success(`${code} added to the local fixture`);
  }

  function submitEdit() {
    if (!editing) return;
    editDiscount(editing.id, editing);
    setEditing(null);
    toast.success("Code updated in the local fixture");
  }

  return (
    <Page width="wide">
      <PageHeader
        title="Discounts"
        subtitle="Promotional codes for subscriptions, ad purchases and certificates."
        actions={
          writable && (
            <Button
              variant="primary"
              onClick={() => {
                setDraft(EMPTY);
                setCreating(true);
              }}
            >
              <Plus size={14} /> New code
            </Button>
          )
        }
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "discounts")} />}
      {SEED_ACTIVE && <DevSeedBanner what="Discount codes" />}

      <Stack>
        <Note>
          A code is redeemable only when all four conditions hold: it is active, it is inside its
          date window, and it has uses left. The state column reports which one is failing, because
          &ldquo;switched off&rdquo;, &ldquo;ran out&rdquo; and &ldquo;expired&rdquo; each call for a
          different fix.
        </Note>

        <Panel title="Codes" description={`${rows.length} configured.`}>
          {rows.length === 0 ? (
            <Empty
              action={
                writable && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setDraft(EMPTY);
                      setCreating(true);
                    }}
                  >
                    <Plus size={14} /> New code
                  </Button>
                )
              }
            >
              No discount codes. In a production build this list is empty because the{" "}
              <span className="font-mono text-2xs">discount_codes</span> table does not exist yet.
            </Empty>
          ) : (
            <Table head={["Code", "Discount", "Applies to", "Usage", "Valid", "State", ""]}>
              {rows.map((d) => {
                const state = discountState(d);
                return (
                  <tr key={d.id} className={ROW_HOVER}>
                    <td className="px-3 py-2 font-mono text-sm font-medium text-ink">{d.code}</td>
                    <td className="px-3 py-2 tabular-nums text-ink">{formatValue(d)}</td>
                    <td className="px-3 py-2 text-ink-muted">{TARGET_LABELS[d.appliesTo]}</td>
                    <td className="w-44 px-3 py-2">
                      {d.maxUses === null ? (
                        <span className="text-xs tabular-nums text-ink-muted">
                          {d.usedCount} used, no cap
                        </span>
                      ) : (
                        <Meter
                          value={d.usedCount}
                          max={d.maxUses}
                          tone={d.usedCount >= d.maxUses ? "caution" : "neutral"}
                          title={`${d.usedCount} of ${d.maxUses} uses claimed`}
                          caption={`${d.usedCount} of ${d.maxUses}`}
                        />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-2xs tabular-nums text-ink-muted">
                      {format(new Date(d.validFrom), "d MMM yy")}
                      {" to "}
                      {d.validTo ? format(new Date(d.validTo), "d MMM yy") : "no end"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATE_TONE[state]} dot>
                        {state}
                      </Badge>
                      <span className="mt-0.5 block text-2xs text-ink-faint">{STATE_COPY[state]}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" disabled={!writable} onClick={() => setEditing(d)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant={d.active ? "danger" : "primary"}
                          disabled={!writable}
                          onClick={() => {
                            editDiscount(d.id, { active: !d.active });
                            toast.success(d.active ? `${d.code} switched off` : `${d.code} switched on`);
                          }}
                        >
                          {d.active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>
      </Stack>

      <Modal open={creating} title="New discount code" onClose={() => setCreating(false)} width="lg">
        <DiscountForm value={draft} onChange={setDraft} />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="primary" disabled={!draft.code.trim()} onClick={submitCreate}>
            Create code
          </Button>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        title={`Edit ${editing?.code ?? ""}`}
        onClose={() => setEditing(null)}
        width="lg"
      >
        {editing && (
          <>
            <DiscountForm
              value={editing}
              onChange={(patch) => setEditing({ ...editing, ...patch })}
            />
            <Note className="mt-3">
              {editing.usedCount} redemption{editing.usedCount === 1 ? " has" : "s have"} already
              been recorded against this code. Changing its value does not retroactively change what
              those vendors paid.
            </Note>
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" disabled={!editing?.code.trim()} onClick={submitEdit}>
            Save changes
          </Button>
        </div>
      </Modal>
    </Page>
  );
}

function DiscountForm({
  value,
  onChange,
}: {
  value: Omit<Discount, "id" | "usedCount">;
  onChange: (next: Omit<Discount, "id" | "usedCount">) => void;
}) {
  const set = (patch: Partial<Discount>) => onChange({ ...value, ...patch });
  const toDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const fromDate = (v: string) => (v ? new Date(`${v}T00:00:00`).toISOString() : null);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code" htmlFor="disc-code" hint="Stored and matched in upper case.">
          <Input
            id="disc-code"
            autoFocus
            value={value.code}
            placeholder="MONSOON25"
            onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            className="font-mono uppercase"
          />
        </Field>
        <Field label="Applies to" htmlFor="disc-target">
          <Select
            id="disc-target"
            value={value.appliesTo}
            onChange={(e) => set({ appliesTo: e.target.value as DiscountTarget })}
          >
            {(Object.keys(TARGET_LABELS) as DiscountTarget[]).map((t) => (
              <option key={t} value={t}>
                {TARGET_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Discount type" htmlFor="disc-kind">
          <Select
            id="disc-kind"
            value={value.kind}
            onChange={(e) => set({ kind: e.target.value as DiscountKind })}
          >
            <option value="percent">Percentage off</option>
            <option value="flat">Flat rupee amount off</option>
          </Select>
        </Field>
        <Field
          label={value.kind === "percent" ? "Percentage" : "Rupees off"}
          htmlFor="disc-value"
          hint={value.kind === "percent" ? "1 to 100." : "Whole rupees."}
        >
          <Input
            id="disc-value"
            type="number"
            min={1}
            max={value.kind === "percent" ? 100 : undefined}
            value={value.value}
            onChange={(e) => set({ value: Number(e.target.value) })}
            className="tabular-nums"
          />
        </Field>
      </div>

      <Field
        label="Maximum uses"
        htmlFor="disc-max"
        hint="Leave blank for no cap. Zero would make the code unusable, which is what Deactivate is for."
      >
        <Input
          id="disc-max"
          type="number"
          min={1}
          value={value.maxUses ?? ""}
          placeholder="no cap"
          onChange={(e) => set({ maxUses: e.target.value === "" ? null : Number(e.target.value) })}
          className="tabular-nums"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valid from" htmlFor="disc-from">
          <Input
            id="disc-from"
            type="date"
            value={toDate(value.validFrom)}
            onChange={(e) => set({ validFrom: fromDate(e.target.value) ?? new Date().toISOString() })}
          />
        </Field>
        <Field label="Valid to" htmlFor="disc-to" hint="Leave blank to run until deactivated.">
          <Input
            id="disc-to"
            type="date"
            value={toDate(value.validTo)}
            onChange={(e) => set({ validTo: fromDate(e.target.value) })}
          />
        </Field>
      </div>
    </div>
  );
}
