import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge, Button, Field, Input, Modal, Note, Panel, ROW_HOVER, Table, Textarea } from "@/components/ui";
import {
  cancelPlanPrice, rupees, setPlanPrice, todayIST, usePlanPrices, type PlanPriceRow, type PlanWithPrice,
} from "@/lib/subscriptionAdmin";

/**
 * Plan prices (subscriptions P12, 2026-10-09). Today's price of each paid plan, a change waiting
 * for its day, and the history. A change applies now, or at the morning billing run (about
 * 9:00 IST) on the date chosen, which writes it where checkout and the plans page read it.
 * Payments already started and autopay mandates keep the price they were made at; the next
 * autopay checkout at a new price makes a new Razorpay plan by itself.
 *
 * Shows nothing before the P12 migration is applied.
 */
export function PlanPricesPanel({ writable }: { writable: boolean }) {
  const qc = useQueryClient();
  const prices = usePlanPrices();
  const [editing, setEditing] = useState<PlanWithPrice | null>(null);
  const [cancelling, setCancelling] = useState<PlanPriceRow | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const data = prices.data;
  if (!data) return null;

  const paid = data.plans.filter((p) => p.id !== "free");
  const waiting = new Map(data.history.filter((h) => h.status === "scheduled").map((h) => [h.plan_id, h]));
  const name = (id: string) => data.plans.find((p) => p.id === id)?.name ?? id;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["plan-prices"] });
    void qc.invalidateQueries({ queryKey: ["plans"] });
  };

  return (
    <Panel
      title="Plan prices"
      description="Before GST. A new price applies to purchases and renewals from when it takes effect; payments already started and autopay mandates keep the price they were made at."
      actions={
        <Button size="sm" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? "Hide history" : "History"}
        </Button>
      }
    >
      <Table head={["Plan", "Monthly", "Yearly", "Waiting change", ""]}>
        {paid.map((p) => {
          const w = waiting.get(p.id);
          const overdue = w && new Date(w.effective_from).getTime() < Date.now() - 36 * 3_600_000;
          return (
            <tr key={p.id} className={ROW_HOVER} data-testid={`plan-price-${p.id}`}>
              <td className="px-3 py-2 font-medium text-ink">{p.name}</td>
              <td className="px-3 py-2 tabular-nums text-ink">{rupees(p.monthly_price)}</td>
              <td className="px-3 py-2 tabular-nums text-ink">{rupees(p.yearly_price)}</td>
              <td className="px-3 py-2 text-xs text-ink-muted">
                {w ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums">{`${rupees(w.monthly_price)} / ${rupees(w.yearly_price)} from ${format(new Date(w.effective_from), "d MMM yyyy")}`}</span>
                    {overdue && <Badge tone="critical">overdue: the morning run hasn't applied it</Badge>}
                    {writable && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(w)}>
                        Cancel
                      </Button>
                    )}
                  </span>
                ) : (
                  <span className="text-ink-ghost">none</span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <Button size="sm" disabled={!writable} onClick={() => setEditing(p)}>
                  Change price
                </Button>
              </td>
            </tr>
          );
        })}
      </Table>

      {showHistory && (
        <ul className="mt-3 divide-y divide-line text-xs" data-testid="plan-price-history">
          {data.history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
              <span className="w-16 font-medium text-ink">{name(h.plan_id)}</span>
              <span className="tabular-nums text-ink">
                {`${rupees(h.monthly_price)} / ${rupees(h.yearly_price)}`}
                {h.previous_monthly != null && (
                  <span className="text-ink-faint">{` (was ${rupees(h.previous_monthly)} / ${rupees(h.previous_yearly ?? 0)})`}</span>
                )}
              </span>
              <Badge tone={h.status === "applied" ? "positive" : h.status === "scheduled" ? "info" : "neutral"}>
                {h.status === "applied" && h.applied_at
                  ? `applied ${format(new Date(h.applied_at), "d MMM yyyy, HH:mm")}`
                  : h.status === "scheduled"
                    ? `waiting for ${format(new Date(h.effective_from), "d MMM yyyy")}`
                    : "cancelled"}
              </Badge>
              <span className="min-w-0 flex-1 text-ink-muted">{h.reason}</span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <PriceDialog
          plan={editing}
          waiting={waiting.get(editing.id) ?? null}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {cancelling && (
        <CancelDialog
          change={cancelling}
          planName={name(cancelling.plan_id)}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null);
            refresh();
          }}
        />
      )}
    </Panel>
  );
}

function PriceDialog({ plan, waiting, onClose, onDone }: {
  plan: PlanWithPrice;
  waiting: PlanPriceRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [monthly, setMonthly] = useState(String(plan.monthly_price));
  const [yearly, setYearly] = useState(String(plan.yearly_price));
  const [when, setWhen] = useState<"now" | "date">("now");
  const [date, setDate] = useState(todayIST(1));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const m = Number(monthly);
  const y = Number(yearly);
  const whole = (n: number) => Number.isInteger(n) && n >= 1;
  const problem = !whole(m) || !whole(y)
    ? "Prices are whole rupees, at least ₹1."
    : y > m * 12
      ? `The yearly price can't be more than 12 months at the monthly price (${rupees(m * 12)}).`
      : m === plan.monthly_price && y === plan.yearly_price
        ? "Those are the prices now."
        : null;
  const saving = whole(m) && whole(y) && y < m * 12 ? Math.round((1 - y / (m * 12)) * 100) : 0;

  const save = async () => {
    setBusy(true);
    try {
      const r = await setPlanPrice({ plan: plan.id, monthly: m, yearly: y, effective: when === "now" ? null : date, reason: reason.trim() });
      toast.success(r.status === "applied"
        ? `${plan.name} now costs ${rupees(m)} a month`
        : `${plan.name}'s new price waits for ${format(new Date(r.effective_from), "d MMM yyyy")}`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message, { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`Change ${plan.name}'s price`} onClose={onClose}>
      <Note className="mb-3">
        {`Now ${rupees(plan.monthly_price)} a month, ${rupees(plan.yearly_price)} a year, before GST.`}
        {waiting && ` A change to ${rupees(waiting.monthly_price)} / ${rupees(waiting.yearly_price)} is waiting for ${format(new Date(waiting.effective_from), "d MMM yyyy")}; this replaces it.`}
      </Note>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Monthly (₹)" htmlFor="price-monthly">
          <Input id="price-monthly" inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
        <Field label="Yearly (₹)" htmlFor="price-yearly" hint={saving > 0 ? `${saving}% less than 12 months` : undefined}>
          <Input id="price-yearly" inputMode="numeric" value={yearly} onChange={(e) => setYearly(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
      </div>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-ink-muted">Takes effect</legend>
        <div className="mt-1.5 flex flex-wrap items-center gap-4 text-sm text-ink">
          <label className="flex items-center gap-2">
            <input type="radio" name="price-when" checked={when === "now"} onChange={() => setWhen("now")} /> Now
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="price-when" checked={when === "date"} onChange={() => setWhen("date")} /> On
            <Input
              type="date"
              aria-label="Date the price takes effect"
              className="w-40"
              min={todayIST(1)}
              max={todayIST(365)}
              value={date}
              onChange={(e) => { setDate(e.target.value); setWhen("date"); }}
            />
          </label>
        </div>
        {when === "date" && <p className="mt-1 text-xs text-ink-faint">At the morning billing run that day, about 9:00 IST.</p>}
      </fieldset>
      <Field label="Reason" htmlFor="price-reason" hint="Required. Kept in the price history and the Admin Log." className="mt-3">
        <Textarea id="price-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the price changing?" />
      </Field>
      {problem && <p className="mt-2 text-xs text-critical-fg">{problem}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Keep as is</Button>
        <Button variant="primary" disabled={busy || problem !== null || reason.trim().length < 3 || (when === "date" && !date)} onClick={() => void save()}>
          {busy ? "Saving…" : when === "now" ? "Change now" : "Schedule"}
        </Button>
      </div>
    </Modal>
  );
}

function CancelDialog({ change, planName, onClose, onDone }: {
  change: PlanPriceRow;
  planName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    setBusy(true);
    try {
      await cancelPlanPrice(change.id, reason.trim());
      toast.success(`${planName}'s waiting change is cancelled`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message, { duration: 8000 });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Cancel ${planName}'s waiting price`} onClose={onClose}>
      <Note className="mb-3">
        {`${rupees(change.monthly_price)} / ${rupees(change.yearly_price)} from ${format(new Date(change.effective_from), "d MMM yyyy")} won't happen; today's price stays.`}
      </Note>
      <Field label="Reason" htmlFor="price-cancel-reason" hint="Required. Recorded in the Admin Log.">
        <Textarea id="price-cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Keep it</Button>
        <Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => void cancel()}>
          {busy ? "Cancelling…" : "Cancel the change"}
        </Button>
      </div>
    </Modal>
  );
}
