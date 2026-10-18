import { useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EyeOff, ExternalLink, Eye } from "lucide-react";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  RUN_SOURCE_LABEL,
  WINDOW_LABEL,
  normaliseTerm,
  useHideTrend,
  useSearchTrends,
  useUnhideTrend,
  type TrendItem,
} from "@/lib/searchTrends";
import {
  Badge,
  Button,
  Empty,
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
  Table,
  Textarea,
} from "@/components/ui";

/**
 * TRENDING SEARCHES (2026-10-18). Real data: lib/searchTrends.ts and the admin_search_trend* RPCs in
 * textile-spark-net migration 20261018120000_search_trends.
 *
 * What /search shows under "Trending", with the counts behind each word, and the terms staff have taken
 * down. roles.ts section "search-trends": super_admin, support and manager read; super_admin and support
 * hide and unhide. The RPCs check the same roles themselves.
 */

const BUYER_SITE = "https://www.cosora.in";

const day = (d: string) => format(new Date(`${d}T00:00:00`), "d MMM yyyy");

/** What the reason box is for: hiding a term (from the list or typed) or letting one back. */
type Pending = { action: "hide" | "unhide"; term: string } | null;

export default function TrendingSearches() {
  const role = useRole();
  const writable = canWrite(role, "search-trends");
  const trends = useSearchTrends();
  const hide = useHideTrend();
  const unhide = useUnhideTrend();
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");

  const data = trends.data;
  const run = data?.run ?? null;
  const sw = data?.switch ?? null;
  // Typed terms have their own switch (2026-10-18: categories only for now). Unknown (older database) counts as off.
  const termsSw = data?.terms_switch ?? null;
  const termsPublic = Boolean(termsSw?.enabled);
  const busy = hide.isPending || unhide.isPending;

  const open = (action: "hide" | "unhide", term: string) => {
    setReason("");
    setPending({ action, term });
  };

  const submit = () => {
    if (!pending) return;
    const m = pending.action === "hide" ? hide : unhide;
    m.mutate(
      { term: pending.term, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(pending.action === "hide" ? `"${pending.term}" is hidden` : `"${pending.term}" can be listed again`, {
            description: "The list was recomputed. The site has it in about a minute.",
          });
          setPending(null);
          setTyped("");
        },
        onError: (e) =>
          toast.error(pending.action === "hide" ? "Couldn't hide it" : "Couldn't let it back", {
            description: (e as Error).message,
          }),
      },
    );
  };

  const switchBadge = !sw ? null : sw.enabled ? (
    <Badge tone="positive" dot>On for everyone</Badge>
  ) : sw.listed > 0 ? (
    <Badge tone="info" dot>On for {sw.listed} listed account{sw.listed === 1 ? "" : "s"}</Badge>
  ) : (
    <Badge tone="neutral" dot>Switched off</Badge>
  );

  const itemTable = (items: TrendItem[], kind: "term" | "category") => (
    <Table head={["#", kind === "term" ? "Term" : "Category", "Visitors", "Visitor-days", ""]}>
      {items.map((t) => (
        <tr key={t.label} data-trend-row={t.label}>
          <td className="px-3 py-2 tabular-nums text-ink-faint">{t.rank}</td>
          <td className="px-3 py-2 font-medium text-ink">{t.label}</td>
          <td className="px-3 py-2 tabular-nums">{t.visitors.toLocaleString("en-IN")}</td>
          <td className="px-3 py-2 tabular-nums">{t.searches.toLocaleString("en-IN")}</td>
          <td className="px-3 py-2 text-right">
            {writable && (
              <Button size="sm" variant="ghost" onClick={() => open("hide", normaliseTerm(t.label))} aria-label={`Hide ${t.label}`}>
                <EyeOff size={14} /> Hide
              </Button>
            )}
          </td>
        </tr>
      ))}
    </Table>
  );

  return (
    <Page>
      <PageHeader
        title="Trending searches"
        subtitle="What buyers see under the search bar on /search, measured from the searches they make on Cosora."
        actions={switchBadge}
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "search-trends")} />}

      <Note className="mb-4">
        The list is computed every night at 00:10 India time. It covers yesterday; when fewer than 5 terms qualify,
        the last 7 days, then the last 30, and the site's heading says which. A typed term is listed only once at
        least 3 different visitors searched it. Staff searches don't count, and terms with more than 4 digits, a dot, an
        "@", "http" or "www" never appear. Categories count everyone who searched for one or clicked a search result in
        it. The site shows the words only, never these numbers. Who sees it is the{" "}
        <Link to="/feature-flags" className="underline">search_trending switch</Link>; typed terms also need{" "}
        <Link to="/feature-flags" className="underline">search_trending_terms</Link>.
      </Note>

      {!termsPublic && (
        <Notice tone="info" className="mb-4" marker="terms-not-public">
          Typed terms are not shown on the site: buyers see only the most searched categories.
          {termsSw && termsSw.listed > 0 ? ` (${termsSw.listed} listed account${termsSw.listed === 1 ? "" : "s"} see the terms.)` : ""}{" "}
          Anyone with a script can pose as 3 visitors, so terms stay off until staff approve them or only signed-in
          searches count. The terms below are here to watch.
        </Notice>
      )}

      {trends.isLoading ? (
        <SkeletonList rows={3} height="h-24" />
      ) : trends.error ? (
        <ErrorNote message={(trends.error as Error).message} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-4">
            <Panel
              title={run ? `${WINDOW_LABEL[run.window]}${termsPublic ? "" : " (terms not public)"}` : "Nothing computed yet"}
              description={
                run
                  ? `${run.window === "day" ? day(run.ist_day) : `${day(run.window_start ?? run.ist_day)} to ${day(run.ist_day)}`}. Computed ${format(new Date(run.computed_at), "d MMM yyyy, HH:mm")} (${RUN_SOURCE_LABEL[run.source].toLowerCase()}).`
                  : "The first list is computed by the nightly job."
              }
              actions={
                <a
                  href={`${BUYER_SITE}/search`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
                >
                  View on the site <ExternalLink size={12} />
                </a>
              }
            >
              {(data?.terms ?? []).length === 0 ? (
                <Empty>No term reached 3 visitors in this window.</Empty>
              ) : (
                itemTable(data!.terms, "term")
              )}
            </Panel>

            <Panel title="Most searched categories" description="Cosora's own category names, so no minimum: one visitor counts.">
              {(data?.categories ?? []).length === 0 ? (
                <Empty>No category was searched in this window.</Empty>
              ) : (
                itemTable(data!.categories, "category")
              )}
            </Panel>
          </div>

          <div className="space-y-4">
            {writable && (
              <Panel title="Hide a term" description="Before it trends, or for a category name. Case and spaces don't matter.">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const term = normaliseTerm(typed);
                    if (term) open("hide", term);
                  }}
                >
                  <Input
                    aria-label="Term to hide"
                    placeholder="e.g. a brand we don't carry"
                    value={typed}
                    maxLength={100}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                  <Button type="submit" disabled={!normaliseTerm(typed)}>
                    <EyeOff size={14} /> Hide
                  </Button>
                </form>
              </Panel>
            )}

            <Panel title="Hidden terms" description="Left out of every list until let back. Each change is in the Admin Log.">
              {(data?.hidden ?? []).length === 0 ? (
                <Empty>Nothing hidden.</Empty>
              ) : (
                <ul className="space-y-2">
                  {data!.hidden.map((h) => (
                    <li key={h.term} data-hidden-term={h.term} className="rounded-lg border border-line p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm font-semibold text-ink">{h.term}</p>
                            {!h.hidden && <span className="shrink-0"><Badge tone="neutral">Shown again</Badge></span>}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-muted">{h.reason}</p>
                          <p className="mt-0.5 text-2xs text-ink-faint">
                            {format(new Date(h.updated_at), "d MMM yyyy, HH:mm")}
                            {h.updated_by_name ? ` · ${h.updated_by_name}` : ""}
                          </p>
                        </div>
                        {writable && (
                          h.hidden ? (
                            <Button size="sm" variant="ghost" onClick={() => open("unhide", h.term)} aria-label={`Let ${h.term} back`}>
                              <Eye size={14} /> Let back
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => open("hide", h.term)} aria-label={`Hide ${h.term} again`}>
                              <EyeOff size={14} /> Hide
                            </Button>
                          )
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Recent computations" description="The nightly job, and each hide or unhide.">
              {(data?.recent_runs ?? []).length === 0 ? (
                <Empty>None yet.</Empty>
              ) : (
                <ul className="divide-y divide-line text-xs">
                  {data!.recent_runs.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="text-ink">{format(new Date(r.computed_at), "d MMM, HH:mm")}</span>
                      <span className="text-ink-muted">{RUN_SOURCE_LABEL[r.source]}</span>
                      <span className="text-ink-muted">{WINDOW_LABEL[r.window].replace("Trending ", "")}</span>
                      <span className="tabular-nums text-ink-muted">
                        {r.terms} term{r.terms === 1 ? "" : "s"}, {r.categories} categor{r.categories === 1 ? "y" : "ies"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      <Modal
        open={pending !== null}
        title={pending?.action === "unhide" ? `Let "${pending?.term}" back` : `Hide "${pending?.term ?? ""}"`}
        onClose={() => !busy && setPending(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <Field
            label="Reason (in the Admin Log)"
            htmlFor="trend-reason"
            hint={pending?.action === "unhide" ? "Why it may be listed again." : "Why buyers shouldn't see it, e.g. a person's name or abuse."}
          >
            <Textarea id="trend-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || reason.trim().length < 3}>
              {busy ? "Saving…" : pending?.action === "unhide" ? "Let it back" : "Hide it"}
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
