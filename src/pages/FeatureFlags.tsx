import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  Badge, Button, ErrorNote, Field, Input, Page, PageHeader, Panel, ReadOnlyBanner, SkeletonList, Stack, Textarea,
} from "@/components/ui";
import { FEATURE_FLAG_LABELS, saveFeatureFlag, useFeatureFlags, type FeatureFlag } from "@/lib/subscriptionSettings";

/**
 * FEATURE SWITCHES (subscriptions P0, 2026-10-08).
 *
 * A new feature ships switched off and is turned on here: first for a few listed
 * accounts while it is tested in production, then for everyone. The database and the
 * edge functions read the same switch, so this page is the control and not a hint.
 * Super admins change switches (with a reason, recorded in the Admin Log); managers read.
 */

type Person = { id: string; name: string };
const MAX_ACCOUNTS = 200;

export default function FeatureFlags() {
  const role = useRole();
  const writable = canWrite(role, "feature-flags");
  const flags = useFeatureFlags();

  return (
    <Page>
      <PageHeader
        title="Feature switches"
        subtitle="Turn a new feature on for listed test accounts first, then for everyone. Every change needs a reason and goes into the Admin Log."
      />
      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "feature-flags")} />}
      {flags.isPending ? (
        <SkeletonList rows={2} height="h-40" />
      ) : flags.error ? (
        <ErrorNote message={(flags.error as Error).message} />
      ) : (
        <Stack>
          {(flags.data ?? []).map((f) => <FlagPanel key={f.key} flag={f} writable={writable} />)}
        </Stack>
      )}
    </Page>
  );
}

function FlagPanel({ flag, writable }: { flag: FeatureFlag; writable: boolean }) {
  const qc = useQueryClient();
  const initialPeople = flag.allowProfileIds.map((id, i) => ({ id, name: flag.allowNames[i] ?? id }));
  const [everyone, setEveryone] = useState(flag.enabled);
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const [reason, setReason] = useState("");
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEveryone(flag.enabled);
    setPeople(flag.allowProfileIds.map((id, i) => ({ id, name: flag.allowNames[i] ?? id })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag.enabled, flag.updatedAt]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const search = useQuery({
    queryKey: ["feature-flags", "account-search", debounced],
    enabled: writable && debounced.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_profile_search", { p_term: debounced, p_limit: 8 });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const changed =
    everyone !== flag.enabled ||
    people.length !== flag.allowProfileIds.length ||
    people.some((p) => !flag.allowProfileIds.includes(p.id));

  async function save() {
    setBusy(true);
    try {
      await saveFeatureFlag(flag.key, everyone, people.map((p) => p.id), reason.trim());
      toast.success("Switch saved.");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["feature-flags"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = FEATURE_FLAG_LABELS[flag.key] ?? flag.key;
  return (
    <Panel
      title={label}
      description={flag.description}
      actions={
        flag.enabled
          ? <Badge tone="positive" dot>On for everyone</Badge>
          : flag.allowProfileIds.length > 0
            ? <Badge tone="caution" dot>{`On for ${flag.allowProfileIds.length} listed account${flag.allowProfileIds.length === 1 ? "" : "s"}`}</Badge>
            : <Badge tone="neutral" dot>Off</Badge>
      }
    >
      <p className="mb-3 font-mono text-2xs text-ink-faint">{flag.key}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { on: false, title: "Listed accounts only", hint: "Everyone else is refused. With no accounts listed, the feature is off." },
          { on: true, title: "Everyone", hint: "The feature is live for every account." },
        ].map((o) => (
          <label
            key={String(o.on)}
            className={
              "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 " +
              (everyone === o.on ? "border-brand bg-brand-tint" : "border-line bg-surface-2")
            }
          >
            <input
              type="radio"
              name={`flag-${flag.key}`}
              className="mt-0.5 accent-[rgb(var(--brand))]"
              checked={everyone === o.on}
              disabled={!writable}
              onChange={() => setEveryone(o.on)}
            />
            <span className="text-xs leading-relaxed">
              <span className="font-medium text-ink">{o.title}</span>
              <span className="mt-0.5 block text-ink-faint">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4">
        <Field
          label={`Listed accounts (${people.length} of ${MAX_ACCOUNTS})`}
          htmlFor={`flag-${flag.key}-search`}
          hint="They get the feature while it isn't on for everyone."
        >
          {writable && (
            <Input
              id={`flag-${flag.key}-search`}
              value={term}
              placeholder="Search by name or email"
              onChange={(e) => setTerm(e.target.value)}
            />
          )}
        </Field>
        {writable && debounced.length >= 2 && (
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
                    disabled={added || people.length >= MAX_ACCOUNTS}
                    onClick={() => setPeople([...people, { id: p.id, name: p.full_name || p.email || p.id }])}
                  >
                    {added ? "Listed" : "Add"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {people.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {people.map((p) => (
              <li key={p.id} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-ink ring-1 ring-inset ring-line">
                {p.name}
                {writable && (
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    className="rounded text-ink-faint hover:text-ink"
                    onClick={() => setPeople(people.filter((x) => x.id !== p.id))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {writable && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Reason" htmlFor={`flag-${flag.key}-reason`} hint="Required. Recorded in the Admin Log." className="min-w-[16rem] flex-1">
            <Textarea
              id={`flag-${flag.key}-reason`}
              rows={2}
              value={reason}
              placeholder="Why is this switch changing?"
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button variant="primary" disabled={!changed || !reason.trim() || busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save switch"}
          </Button>
        </div>
      )}

      <p className="mt-3 text-2xs text-ink-faint">
        {flag.updatedByName
          ? `Last changed ${format(new Date(flag.updatedAt), "d MMM yyyy, HH:mm")} by ${flag.updatedByName}.`
          : `Created ${format(new Date(flag.updatedAt), "d MMM yyyy")}; not changed since.`}
      </p>
    </Panel>
  );
}
