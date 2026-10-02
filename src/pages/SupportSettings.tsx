import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  Badge,
  Button,
  Checkbox,
  ErrorNote,
  Field,
  Input,
  Modal,
  Note,
  Notice,
  Page,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  SkeletonList,
  Stack,
  Table,
} from "@/components/ui";
import {
  addHoliday,
  CHANNEL_LABELS,
  istTime,
  removeHoliday,
  saveContact,
  saveHours,
  saveRollout,
  setCategoryActive,
  useSupportSettings,
  type SupportHoursRow,
  type SupportSettings as Settings,
} from "@/lib/support";

/**
 * SUPPORT SETTINGS (Help & Support P4d, 2026-09-30).
 *
 * What the Help page promises and who can reach support. Everyone who reads support
 * sees this page; only a super admin changes it (admin.require_content_admin() in each
 * admin_support_set_* function). "can_edit" comes from the database, not roles.ts.
 *
 * The rollout switch is also the fallback (plan section 5): set it to Off and Help goes
 * back to the phone line and email, with every request still readable here.
 */

// Monday first, the way a week reads here. 0 is Sunday in the database.
const WEEK: { weekday: number; label: string }[] = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 0, label: "Sunday" },
];

const ROLLOUT: { id: Settings["rollout"]; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "Nobody can open a request. Help shows the phone line and email only." },
  { id: "staff", label: "Staff testing", hint: "Active admins and the test accounts below." },
  { id: "all", label: "Everyone", hint: "Every signed-in buyer and vendor." },
];

async function run(fn: () => Promise<void>, done: string, qc: ReturnType<typeof useQueryClient>) {
  try {
    await fn();
    toast.success(done);
    void qc.invalidateQueries({ queryKey: ["support"] });
    return true;
  } catch (e) {
    toast.error((e as Error).message);
    return false;
  }
}

export default function SupportSettings() {
  const settings = useSupportSettings();
  if (settings.isPending) {
    return (
      <Page>
        <PageHeader title="Support settings" />
        <SkeletonList rows={4} height="h-40" />
      </Page>
    );
  }
  // A failed background refresh keeps the last good data, so unsaved edits survive it.
  if (!settings.data) return <ErrorNote message={(settings.error as Error | null)?.message ?? "Could not load support settings."} />;
  const s = settings.data;
  return (
    <Page>
      <PageHeader
        title="Support settings"
        subtitle="Who can reach support, the hours the Help page promises, and the contact details it shows."
      />
      {!s.can_edit && <ReadOnlyBanner reason="Read-only: only a super admin changes support settings." />}
      <Stack>
        <Notice tone={s.open_now ? "positive" : "neutral"}>
          {s.open_now ? "Support is open now." : `Support is closed now.${s.next_open_at ? ` It opens ${istTime(s.next_open_at)}.` : ""}`}{" "}
          Last changed {istTime(s.updated_at)}
          {s.updated_by_name ? ` by ${s.updated_by_name}` : ""}.
        </Notice>
        <RolloutPanel s={s} />
        <HoursPanel s={s} />
        <HolidaysPanel s={s} />
        <ContactPanel s={s} />
        <TopicsPanel s={s} />
      </Stack>
    </Page>
  );
}

// ── Rollout ────────────────────────────────────────────────────────────────────
type Person = { id: string; name: string };

function RolloutPanel({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const [rollout, setRollout] = useState(s.rollout);
  const [people, setPeople] = useState<Person[]>(s.test_profiles);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRollout(s.rollout);
    setPeople(s.test_profiles);
  }, [s.rollout, s.test_profiles]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const search = useQuery({
    queryKey: ["support", "test-account-search", debounced],
    enabled: s.can_edit && debounced.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_profile_search", { p_term: debounced, p_limit: 8 });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const changed =
    rollout !== s.rollout ||
    people.length !== s.test_profiles.length ||
    people.some((p) => !s.test_profiles.find((x) => x.id === p.id));

  async function save() {
    setBusy(true);
    await run(() => saveRollout(rollout, people.map((p) => p.id)), "Rollout saved.", qc);
    setBusy(false);
    setConfirmAll(false);
  }

  return (
    <Panel
      title="Who can reach support"
      description="Off → Staff testing → Everyone. Setting it back to Off is the fallback: no deploy needed, and every request stays readable here."
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {ROLLOUT.map((r) => (
          <label
            key={r.id}
            className={
              "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 " +
              (rollout === r.id ? "border-brand bg-brand-tint" : "border-line bg-surface-2")
            }
          >
            <input
              type="radio"
              name="support-rollout"
              className="mt-0.5 accent-[rgb(var(--brand))]"
              checked={rollout === r.id}
              disabled={!s.can_edit}
              onChange={() => setRollout(r.id)}
            />
            <span className="text-xs leading-relaxed">
              <span className="font-medium text-ink">{r.label}</span>
              <span className="mt-0.5 block text-ink-faint">{r.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4">
        <Field label={`Test accounts (${people.length} of 20)`} htmlFor="support-test-search" hint="They can use support while rollout is Staff testing.">
          {s.can_edit && (
            <Input
              id="support-test-search"
              value={term}
              placeholder="Search by name or email"
              onChange={(e) => setTerm(e.target.value)}
            />
          )}
        </Field>
        {s.can_edit && debounced.length >= 2 && (
          <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface">
            {search.isPending && <li className="px-3 py-2 text-xs text-ink-faint">Searching…</li>}
            {search.error && <li className="px-3 py-2 text-xs text-critical-fg">{(search.error as Error).message}</li>}
            {search.data?.length === 0 && <li className="px-3 py-2 text-xs text-ink-faint">No account matches.</li>}
            {search.data?.map((p) => {
              const added = people.some((x) => x.id === p.id);
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 last:border-b-0">
                  <span className="min-w-0 truncate text-xs text-ink">
                    {p.full_name || "No name"}{" "}
                    <span className="text-ink-faint">
                      {p.email?.endsWith("@phone.cosora.invalid") ? "phone sign-in" : p.email}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    disabled={added || people.length >= 20}
                    onClick={() => setPeople([...people, { id: p.id, name: p.full_name || p.email || p.id }])}
                  >
                    {added ? "Added" : "Add"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {people.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {people.map((p) => (
              <li key={p.id} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs text-ink ring-1 ring-inset ring-line">
                <span data-no-translate>{p.name}</span>
                {s.can_edit && (
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPeople(people.filter((x) => x.id !== p.id))}>
                    <X size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-ink-faint">No test accounts. Active admins can test while rollout is Staff testing.</p>
        )}
      </div>

      {s.can_edit && (
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            disabled={!changed || busy}
            onClick={() => (rollout === "all" && s.rollout !== "all" ? setConfirmAll(true) : void save())}
          >
            Save rollout
          </Button>
        </div>
      )}

      <Modal open={confirmAll} title="Open support to everyone?" onClose={() => setConfirmAll(false)}>
        <p className="mb-2 text-sm text-ink-muted">The launch gate (plan P7, G1) says all of these are true first:</p>
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>at least one active Support-role admin has practised on the inbox;</li>
          <li>the dummy sign-in code is switched off;</li>
          <li>Resend is set up, so receipts can be emailed;</li>
          <li>this year's holidays are entered below;</li>
          <li>the corrected buyer FAQs are approved and live.</li>
        </ul>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirmAll(false)}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>Open to everyone</Button>
        </div>
      </Modal>
    </Panel>
  );
}

// ── Hours ──────────────────────────────────────────────────────────────────────
function HoursPanel({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<SupportHoursRow[]>(s.hours);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRows(s.hours), [s.hours]);

  const byDay = (weekday: number) => rows.find((r) => r.weekday === weekday)!;
  const edit = (weekday: number, patch: Partial<SupportHoursRow>) =>
    setRows(rows.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
  const changed = JSON.stringify(rows) !== JSON.stringify(s.hours);

  return (
    <Panel
      title="Support hours (IST)"
      description="The Help page shows open or closed from these, and when closed, when the next reply can come. Chat stays open as messages after hours."
    >
      <div className="space-y-1.5">
        {WEEK.map(({ weekday, label }) => {
          const r = byDay(weekday);
          if (!r) return null;
          return (
            // On a phone the times take their own row; side by side they don't fit.
            <div key={weekday} className="grid grid-cols-[6rem_1fr] items-center gap-x-2 gap-y-1 sm:grid-cols-[8rem_6rem_1fr]">
              <span className="text-sm text-ink">{label}</span>
              <label className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  className="accent-[rgb(var(--brand))]"
                  checked={r.is_open}
                  disabled={!s.can_edit}
                  onChange={(e) => edit(weekday, { is_open: e.target.checked, open: r.open ?? "10:00", close: r.close ?? "19:00" })}
                />
                {r.is_open ? "Open" : "Closed"}
              </label>
              {r.is_open ? (
                <div className="col-span-2 flex items-center gap-1.5 sm:col-span-1">
                  <Input
                    type="time"
                    aria-label={`${label} opens`}
                    value={r.open ?? ""}
                    disabled={!s.can_edit}
                    onChange={(e) => edit(weekday, { open: e.target.value })}
                    className="min-w-0 flex-1 py-1 sm:w-36 sm:flex-none"
                  />
                  <span className="text-xs text-ink-faint">to</span>
                  <Input
                    type="time"
                    aria-label={`${label} closes`}
                    value={r.close ?? ""}
                    disabled={!s.can_edit}
                    onChange={(e) => edit(weekday, { close: e.target.value })}
                    className="min-w-0 flex-1 py-1 sm:w-36 sm:flex-none"
                  />
                </div>
              ) : (
                <span className="hidden text-xs text-ink-faint sm:inline">closed all day</span>
              )}
            </div>
          );
        })}
      </div>
      {s.can_edit && (
        <div className="mt-4 flex justify-end gap-2">
          {changed && <Button onClick={() => setRows(s.hours)}>Undo changes</Button>}
          <Button
            variant="primary"
            disabled={!changed || busy}
            onClick={async () => {
              setBusy(true);
              await run(() => saveHours(rows), "Hours saved.", qc);
              setBusy(false);
            }}
          >
            Save hours
          </Button>
        </div>
      )}
    </Panel>
  );
}

// ── Holidays ───────────────────────────────────────────────────────────────────
function HolidaysPanel({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const [day, setDay] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Holidays" description="Closed all day on these dates, whatever the weekly hours say. Past holidays drop off after 30 days.">
      {s.holidays.length === 0 ? (
        <Note>No holidays entered. Enter this year's before support opens to everyone.</Note>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {s.holidays.map((h) => (
            <li key={h.day} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <span className="tabular-nums text-ink">{format(new Date(`${h.day}T00:00:00`), "EEE d MMM yyyy")}</span>{" "}
                <span className="text-ink-muted">{h.label}</span>
              </span>
              {s.can_edit && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await run(() => removeHoliday(h.day), "Holiday removed.", qc);
                    setBusy(false);
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {s.can_edit && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!day || !label.trim()) return;
            setBusy(true);
            if (await run(() => addHoliday(day, label), "Holiday added.", qc)) {
              setDay("");
              setLabel("");
            }
            setBusy(false);
          }}
        >
          <Field label="Date" htmlFor="holiday-day">
            <Input id="holiday-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Name" htmlFor="holiday-label" className="min-w-[12rem] flex-1">
            <Input id="holiday-label" maxLength={80} value={label} placeholder="Diwali" onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" disabled={busy || !day || !label.trim()}>Add holiday</Button>
        </form>
      )}
    </Panel>
  );
}

// ── Contact details ────────────────────────────────────────────────────────────
function ContactPanel({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(s.phone);
  const [email, setEmail] = useState(s.email);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPhone(s.phone);
    setEmail(s.email);
  }, [s.phone, s.email]);
  const changed = phone !== s.phone || email !== s.email;
  return (
    <Panel title="Contact details on Help" description="The phone line and email address the Help page offers, including when rollout is Off.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phone" htmlFor="support-phone" hint="With the country code, e.g. +91 88155 78226.">
          <Input id="support-phone" value={phone} disabled={!s.can_edit} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="support-email">
          <Input id="support-email" type="email" value={email} disabled={!s.can_edit} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
      {s.can_edit && (
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            disabled={!changed || busy}
            onClick={async () => {
              setBusy(true);
              await run(() => saveContact(phone, email), "Contact details saved.", qc);
              setBusy(false);
            }}
          >
            Save contact details
          </Button>
        </div>
      )}
    </Panel>
  );
}

// ── Topics ─────────────────────────────────────────────────────────────────────
function TopicsPanel({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmBilling, setConfirmBilling] = useState(false);
  const [showHidden, setShowHidden] = useState(true);
  const rows = showHidden ? s.categories : s.categories.filter((c) => c.active);

  async function toggle(code: string, active: boolean) {
    setBusy(code);
    await run(() => setCategoryActive(code, active), active ? "Topic turned on." : "Topic turned off.", qc);
    setBusy(null);
  }

  return (
    <Panel
      title="Topics"
      description="What people pick when they ask for help. A topic that's off disappears from the Help page; its old requests stay here."
      actions={<Checkbox label="Show topics that are off" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="py-1.5" />}
    >
      <Table head={["Topic", "For", "Channels", "State", ""]}>
        {rows.map((c) => (
          <tr key={c.code} className={c.active ? undefined : "opacity-70"}>
            <td className="px-3 py-2">
              <div className="text-ink">{c.label.en}</div>
              <div className="font-mono text-2xs text-ink-faint">{c.code}</div>
            </td>
            <td className="px-3 py-2 text-xs text-ink-muted">{c.audience === "both" ? "Buyers and vendors" : c.audience === "buyer" ? "Buyers" : "Vendors"}</td>
            <td className="px-3 py-2 text-xs text-ink-muted">{c.channels.map((ch) => CHANNEL_LABELS[ch]).join(", ")}</td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-1">
                <Badge tone={c.active ? "positive" : "neutral"} dot>{c.active ? "on" : "off"}</Badge>
                {c.restricted && <Badge tone="critical">restricted</Badge>}
              </div>
            </td>
            <td className="px-3 py-2 text-right">
              {s.can_edit && (
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => (c.code === "vendor_billing" && !c.active ? setConfirmBilling(true) : void toggle(c.code, !c.active))}
                >
                  {c.active ? "Turn off" : "Turn on"}
                </Button>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <Modal open={confirmBilling} title="Turn on Subscription and billing?" onClose={() => setConfirmBilling(false)}>
        <p className="mb-4 text-sm text-ink-muted">
          This topic stays off until the manual refund process is written down (plan D-11: support → finance → a
          refund by hand in Razorpay). Without it, staff have no way to answer a refund request. Turn it on only if
          that process exists.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirmBilling(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy !== null}
            onClick={() => {
              setConfirmBilling(false);
              void toggle("vendor_billing", true);
            }}
          >
            The process exists, turn it on
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}
