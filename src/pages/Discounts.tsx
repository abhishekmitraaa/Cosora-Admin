import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Receipt, Tag, TicketPercent, Wallet } from "lucide-react";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { inrFromPaise } from "@/lib/money";
import {
  formatValue,
  REDEMPTION_COPY,
  STATE_COPY,
  TARGET_HELP,
  TARGET_LABELS,
  useDiscountCodes,
  useDiscountRedemptions,
  useSaveDiscount,
  useSelfServePlans,
  useSetDiscountActive,
  type DiscountCode,
  type DiscountDraft,
  type DiscountKind,
  type DiscountState,
  type DiscountTarget,
  type RedemptionStatus,
} from "@/lib/discounts";
import {
  Badge,
  Button,
  Checkbox,
  Empty,
  ErrorNote,
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
  SkeletonList,
  Stack,
  Stat,
  Table,
  Textarea,
  type Tone,
} from "@/components/ui";

/**
 * C4 - DISCOUNT CODES (admin completion Phase 10). Real data: admin.discount_codes
 * and admin.discount_redemptions, through the admin_discount_* RPCs (src/lib/discounts.ts).
 *
 * roles.ts, section "discounts": super_admin and finance_admin, read and write, and
 * the RPCs refuse everyone else. The page manages codes. It never prices an order:
 * the payment functions and the database do that when a vendor checks out.
 */

const STATE_TONE: Record<DiscountState, Tone> = {
  live: "positive",
  scheduled: "info",
  exhausted: "caution",
  expired: "neutral",
  inactive: "neutral",
};

const REDEMPTION_TONE: Record<RedemptionStatus, Tone> = {
  confirmed: "positive",
  reserved: "info",
  released: "neutral",
  lapsed: "neutral",
};

// Dates are whole days in India time: a code starts at 00:00 IST on its first day
// and runs to the end of its last day.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDay = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10) : "");
const dayStart = (day: string) => new Date(`${day}T00:00:00+05:30`).toISOString();
const dayEnd = (day: string) => new Date(`${day}T23:59:59.999+05:30`).toISOString();
const showDay = (iso: string) => format(new Date(iso), "d MMM yy");

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

function emptyDraft(): DiscountDraft {
  return {
    code: "",
    kind: "percent",
    value: 10,
    applies_to: "vendor_plan",
    plan_ids: [],
    max_uses: 100,
    per_vendor_limit: 1,
    valid_from: new Date().toISOString(),
    valid_to: null,
    active: true,
    note: "",
  };
}

function draftOf(d: DiscountCode): DiscountDraft {
  return {
    code: d.code,
    kind: d.kind,
    value: d.value,
    applies_to: d.applies_to,
    plan_ids: d.plan_ids ?? [],
    max_uses: d.max_uses,
    per_vendor_limit: d.per_vendor_limit,
    valid_from: d.valid_from,
    valid_to: d.valid_to,
    active: d.active,
    note: d.note ?? "",
  };
}

/** The checks the database makes, run first so the form can say which field is wrong. */
function problems(d: DiscountDraft): Partial<Record<keyof DiscountDraft, string>> {
  const out: Partial<Record<keyof DiscountDraft, string>> = {};
  if (!CODE_RE.test(d.code.trim().toUpperCase())) {
    out.code = "3 to 32 letters, digits, dashes or underscores, starting with a letter or digit.";
  }
  if (!Number.isInteger(d.value) || d.value < 1 || (d.kind === "percent" ? d.value > 100 : d.value > 1_000_000)) {
    out.value = d.kind === "percent" ? "A whole number from 1 to 100." : "Whole rupees, ₹1 to ₹10,00,000.";
  }
  if (d.max_uses !== null && (!Number.isInteger(d.max_uses) || d.max_uses < 1)) {
    out.max_uses = "At least 1, or blank for no cap.";
  }
  if (!Number.isInteger(d.per_vendor_limit) || d.per_vendor_limit < 1 || d.per_vendor_limit > 1000) {
    out.per_vendor_limit = "1 to 1,000.";
  }
  if (d.valid_to && new Date(d.valid_to) <= new Date(d.valid_from)) {
    out.valid_to = "The end date has to be after the start date.";
  }
  if (d.note.trim().length > 200) out.note = "At most 200 characters.";
  return out;
}

export default function Discounts() {
  const role = useRole();
  const writable = canWrite(role, "discounts");
  const codes = useDiscountCodes();
  const setActive = useSetDiscountActive();
  const [editing, setEditing] = useState<DiscountCode | "new" | null>(null);
  const [viewing, setViewing] = useState<DiscountCode | null>(null);

  const rows = codes.data ?? [];
  const totals = useMemo(
    () => ({
      live: rows.filter((d) => d.state === "live").length,
      uses: rows.reduce((n, d) => n + d.uses, 0),
      inCheckout: rows.reduce((n, d) => n + d.in_checkout, 0),
      given: rows.reduce((n, d) => n + d.discount_paise, 0),
    }),
    [rows],
  );

  return (
    <Page width="wide">
      <PageHeader
        title="Discounts"
        subtitle="Codes vendors enter at checkout, for subscription plans, ad campaigns and the Verified Certificate."
        actions={
          writable && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus size={14} /> New code
            </Button>
          )
        }
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "discounts")} />}

      <Stack>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Live codes" value={String(totals.live)} icon={<Tag size={18} />} tone="positive" />
          <Stat label="Paid uses" value={totals.uses.toLocaleString("en-IN")} icon={<Receipt size={18} />} />
          <Stat
            label="In checkout now"
            value={totals.inCheckout.toLocaleString("en-IN")}
            sub="Held 30 minutes each"
            icon={<TicketPercent size={18} />}
          />
          <Stat label="Discount given" value={inrFromPaise(totals.given)} sub="On paid orders" icon={<Wallet size={18} />} />
        </div>

        <Note>
          The server decides every discount when a vendor checks out: it prices the order, checks the
          code and holds one use for that order until it is paid. A code works only while it is on,
          inside its dates and has uses left, and the state column says which of those is failing.
          Once a code has been used, its text, discount and what it applies to can&rsquo;t change;
          create a new code instead.
        </Note>

        <Panel title="Codes" description={codes.isLoading ? "Loading…" : `${rows.length} configured.`}>
          {codes.isLoading ? (
            <SkeletonList rows={3} height="h-12" />
          ) : codes.error ? (
            <ErrorNote message={(codes.error as Error).message} />
          ) : rows.length === 0 ? (
            <Empty
              action={
                writable && (
                  <Button variant="primary" onClick={() => setEditing("new")}>
                    <Plus size={14} /> New code
                  </Button>
                )
              }
            >
              No discount codes yet.
            </Empty>
          ) : (
            <Table head={["Code", "Discount", "Applies to", "Uses", "Valid", "State", ""]}>
              {rows.map((d) => (
                <tr key={d.id} className={ROW_HOVER}>
                  <td className="px-3 py-2">
                    <div className="font-mono text-sm font-medium text-ink">{d.code}</div>
                    {d.note && <div className="mt-0.5 max-w-56 truncate text-2xs text-ink-faint" title={d.note}>{d.note}</div>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink">{formatValue(d)}</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {TARGET_LABELS[d.applies_to]}
                    {d.plan_ids && <div className="text-2xs text-ink-faint">{d.plan_ids.join(", ")} only</div>}
                  </td>
                  <td className="w-48 px-3 py-2">
                    {d.max_uses === null ? (
                      <span className="text-xs tabular-nums text-ink-muted">{d.uses} used, no cap</span>
                    ) : (
                      <Meter
                        value={d.uses + d.in_checkout}
                        max={d.max_uses}
                        tone={d.uses + d.in_checkout >= d.max_uses ? "caution" : "neutral"}
                        title={`${d.uses} paid and ${d.in_checkout} in checkout, of ${d.max_uses}`}
                        caption={`${d.uses} of ${d.max_uses}`}
                      />
                    )}
                    {d.in_checkout > 0 && (
                      <span className="mt-0.5 block text-2xs text-ink-faint">{d.in_checkout} in checkout</span>
                    )}
                    <span className="mt-0.5 block text-2xs text-ink-faint">
                      {d.per_vendor_limit === 1 ? "once per vendor" : `${d.per_vendor_limit} per vendor`}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-2xs tabular-nums text-ink-muted">
                    {showDay(d.valid_from)}
                    {" to "}
                    {d.valid_to ? showDay(d.valid_to) : "no end"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={STATE_TONE[d.state]} dot>
                      {d.state}
                    </Badge>
                    <span className="mt-0.5 block text-2xs text-ink-faint">{STATE_COPY[d.state]}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" onClick={() => setViewing(d)}>
                        Uses
                      </Button>
                      <Button size="sm" disabled={!writable} onClick={() => setEditing(d)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={d.active ? "danger" : "primary"}
                        disabled={!writable || setActive.isPending}
                        onClick={() =>
                          setActive.mutate(
                            { id: d.id, active: !d.active },
                            {
                              onSuccess: () => toast.success(d.active ? `${d.code} switched off` : `${d.code} switched on`),
                              onError: (e) => toast.error(e.message),
                            },
                          )
                        }
                      >
                        {d.active ? "Switch off" : "Switch on"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </Stack>

      {editing && (
        <DiscountModal code={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
      {viewing && <RedemptionsModal code={viewing} onClose={() => setViewing(null)} />}
    </Page>
  );
}

function DiscountModal({ code, onClose }: { code: DiscountCode | null; onClose: () => void }) {
  const save = useSaveDiscount();
  const plans = useSelfServePlans();
  const [draft, setDraft] = useState<DiscountDraft>(() => (code ? draftOf(code) : emptyDraft()));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<DiscountDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const errors = tried ? problems(draft) : {};
  // The database fixes these once a code has a confirmed use.
  const locked = Boolean(code && code.uses > 0);

  const submit = () => {
    setTried(true);
    if (Object.keys(problems(draft)).length > 0) return;
    const clean = { ...draft, code: draft.code.trim().toUpperCase() };
    save.mutate(
      { id: code?.id ?? null, draft: clean },
      {
        onSuccess: () => {
          toast.success(code ? `${clean.code} saved` : `${clean.code} created`, {
            description: clean.active ? "Vendors can use it at checkout now." : "It's switched off until you turn it on.",
          });
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const togglePlan = (id: string) =>
    set({ plan_ids: draft.plan_ids.includes(id) ? draft.plan_ids.filter((p) => p !== id) : [...draft.plan_ids, id] });

  return (
    <Modal open title={code ? `Edit ${code.code}` : "New discount code"} onClose={onClose} width="lg">
      <div className="space-y-3">
        {locked && (
          <Note>
            {code!.code} has been used {code!.uses === 1 ? "once" : `${code!.uses} times`}, so its code, discount
            and what it applies to are fixed. Its dates, caps, note and on/off can still change.
          </Note>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" htmlFor="disc-code" hint="Vendors type this. Stored in capitals." error={errors.code}>
            <Input
              id="disc-code"
              autoFocus={!code}
              value={draft.code}
              disabled={locked}
              maxLength={32}
              placeholder="MONSOON25"
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Applies to" htmlFor="disc-target" hint={TARGET_HELP[draft.applies_to]}>
            <Select
              id="disc-target"
              value={draft.applies_to}
              disabled={locked}
              onChange={(e) => set({ applies_to: e.target.value as DiscountTarget, plan_ids: [] })}
            >
              {(Object.keys(TARGET_LABELS) as DiscountTarget[]).map((t) => (
                <option key={t} value={t}>
                  {TARGET_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {draft.applies_to === "vendor_plan" && (
          <Field label="Plans" hint="Leave all unticked to allow every plan a vendor can buy themselves.">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {plans.isLoading && <span className="text-xs text-ink-faint">Loading plans…</span>}
              {(plans.data ?? []).map((p) => (
                <Checkbox
                  key={p.id}
                  label={p.name}
                  checked={draft.plan_ids.includes(p.id)}
                  disabled={locked}
                  onChange={() => togglePlan(p.id)}
                />
              ))}
            </div>
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Discount type" htmlFor="disc-kind">
            <Select
              id="disc-kind"
              value={draft.kind}
              disabled={locked}
              onChange={(e) => set({ kind: e.target.value as DiscountKind })}
            >
              <option value="percent">Percentage off</option>
              <option value="flat">Flat rupee amount off</option>
            </Select>
          </Field>
          <Field
            label={draft.kind === "percent" ? "Percentage" : "Rupees off"}
            htmlFor="disc-value"
            hint={draft.kind === "percent" ? "Rounded to the nearest rupee at checkout." : "Never more than the lines it applies to."}
            error={errors.value}
          >
            <Input
              id="disc-value"
              type="number"
              inputMode="numeric"
              min={1}
              max={draft.kind === "percent" ? 100 : 1_000_000}
              value={Number.isNaN(draft.value) ? "" : draft.value}
              disabled={locked}
              onChange={(e) => set({ value: e.target.value === "" ? NaN : Number(e.target.value) })}
              className="tabular-nums"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Maximum uses"
            htmlFor="disc-max"
            hint={code && code.uses > 0 ? `Blank for no cap. At least ${code.uses}, the uses already made.` : "Blank for no cap."}
            error={errors.max_uses}
          >
            <Input
              id="disc-max"
              type="number"
              inputMode="numeric"
              min={Math.max(1, code?.uses ?? 1)}
              value={draft.max_uses ?? ""}
              placeholder="no cap"
              onChange={(e) => set({ max_uses: e.target.value === "" ? null : Number(e.target.value) })}
              className="tabular-nums"
            />
          </Field>
          <Field label="Uses per vendor" htmlFor="disc-per-vendor" error={errors.per_vendor_limit}>
            <Input
              id="disc-per-vendor"
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              value={Number.isNaN(draft.per_vendor_limit) ? "" : draft.per_vendor_limit}
              onChange={(e) => set({ per_vendor_limit: e.target.value === "" ? NaN : Number(e.target.value) })}
              className="tabular-nums"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valid from" htmlFor="disc-from" hint="From 00:00 India time.">
            <Input
              id="disc-from"
              type="date"
              value={istDay(draft.valid_from)}
              onChange={(e) => e.target.value && set({ valid_from: dayStart(e.target.value) })}
            />
          </Field>
          <Field label="Valid to" htmlFor="disc-to" hint="Through the end of that day. Blank to run until switched off." error={errors.valid_to}>
            <Input
              id="disc-to"
              type="date"
              value={istDay(draft.valid_to)}
              onChange={(e) => set({ valid_to: e.target.value ? dayEnd(e.target.value) : null })}
            />
          </Field>
        </div>

        <Field label="Note" htmlFor="disc-note" hint="For the team, not shown to vendors." error={errors.note}>
          <Textarea
            id="disc-note"
            rows={2}
            maxLength={200}
            value={draft.note}
            placeholder="Monsoon launch, 25% off the first month"
            onChange={(e) => set({ note: e.target.value })}
          />
        </Field>

        <Checkbox
          label="On: vendors can use it inside its dates"
          checked={draft.active}
          onChange={(e) => set({ active: e.target.checked })}
        />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={save.isPending} onClick={submit}>
          {save.isPending ? "Saving…" : code ? "Save changes" : "Create code"}
        </Button>
      </div>
    </Modal>
  );
}

function RedemptionsModal({ code, onClose }: { code: DiscountCode; onClose: () => void }) {
  const list = useDiscountRedemptions(code.id);
  const rows = list.data ?? [];

  return (
    <Modal open title={`${code.code}: uses`} onClose={onClose} width="lg">
      <p className="mb-3 text-xs text-ink-muted">
        Every order that carried the code, newest first. A use counts once the order is paid; a checkout holds one for
        30 minutes.
      </p>
      {list.isLoading ? (
        <SkeletonList rows={3} height="h-10" />
      ) : list.error ? (
        <ErrorNote message={(list.error as Error).message} />
      ) : rows.length === 0 ? (
        <Empty>No vendor has used this code yet.</Empty>
      ) : (
        <Table head={["Vendor", "Order", "Discount", "Status", "When"]}>
          {rows.map((r) => (
            <tr key={r.id} className={ROW_HOVER}>
              <td className="px-3 py-2 text-ink">{r.vendor_name ?? "Vendor"}</td>
              <td className="px-3 py-2">
                <div className="text-ink-muted">{r.order_kind === "subscription" ? "Subscription" : "Ad order"}</div>
                <div className="max-w-44 truncate font-mono text-2xs text-ink-faint" title={r.order_ref}>{r.order_ref}</div>
              </td>
              <td className="px-3 py-2 tabular-nums text-ink">
                {inrFromPaise(r.discount_paise)}
                <span className="block text-2xs text-ink-faint">of {inrFromPaise(r.eligible_paise)}</span>
              </td>
              <td className="px-3 py-2">
                <Badge tone={REDEMPTION_TONE[r.status]} dot>
                  {r.status}
                </Badge>
                <span className="mt-0.5 block text-2xs text-ink-faint">{REDEMPTION_COPY[r.status]}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-2xs tabular-nums text-ink-muted">
                {format(new Date(r.confirmed_at ?? r.reserved_at), "d MMM yy, HH:mm")}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  );
}
