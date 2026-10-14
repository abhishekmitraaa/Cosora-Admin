import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, ImageOff, Plus, Search, Trash2 } from "lucide-react";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  HERO_SLIDES_MAX,
  fromLocalInput,
  toLocalInput,
  useHeroSlides,
  useListingSearch,
  useSaveHeroSlides,
  type HeroSlide,
  type ListingHit,
} from "@/lib/heroSlides";
import {
  Badge,
  Button,
  Empty,
  ErrorNote,
  Field,
  Input,
  Note,
  Page,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  SkeletonList,
  cn,
} from "@/components/ui";

/**
 * NEW ARRIVALS CAROUSEL (2026-10-14). Real data: lib/heroSlides.ts and the admin_hero_slides* RPCs in
 * textile-spark-net migration 20261014150000.
 *
 * The list is edited here and saved whole: order, schedule, removals and additions go in one
 * admin_hero_slides_save call, so the site never shows half an edit. roles.ts section "hero-slides":
 * super_admin and manager; the RPCs refuse everyone else.
 */

const BUYER_SITE = "https://www.cosora.in";

/** One row being edited: what the panel shows, plus the schedule as datetime-local text. */
interface Row {
  product_id: string;
  name: string;
  brand_name: string | null;
  image: string | null;
  status: string;
  start: string;
  end: string;
}

const fromSlide = (s: HeroSlide): Row => ({
  product_id: s.product_id,
  name: s.name,
  brand_name: s.brand_name,
  image: s.image,
  status: s.status,
  start: toLocalInput(s.starts_at),
  end: toLocalInput(s.ends_at),
});

const sameRows = (a: Row[], b: Row[]) =>
  a.length === b.length &&
  a.every((r, i) => r.product_id === b[i].product_id && r.start === b[i].start && r.end === b[i].end);

export default function HeroSlides() {
  const role = useRole();
  const writable = canWrite(role, "hero-slides");
  const slides = useHeroSlides();
  const save = useSaveHeroSlides();

  const saved = useMemo(() => (slides.data ?? []).map(fromSlide), [slides.data]);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => setRows(saved), [saved]);
  const dirty = !sameRows(rows, saved);

  const lastChange = useMemo(() => {
    const withTime = (slides.data ?? []).filter((s) => s.updated_at);
    withTime.sort((a, b) => Date.parse(b.updated_at!) - Date.parse(a.updated_at!));
    return withTime[0] ?? null;
  }, [slides.data]);

  const badWindow = rows.findIndex((r) => r.start && r.end && Date.parse(r.end) <= Date.parse(r.start));

  const move = (i: number, by: -1 | 1) =>
    setRows((prev) => {
      const j = i + by;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i: number) => setRows((prev) => prev.filter((_, k) => k !== i));
  const patch = (i: number, p: Partial<Row>) => setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const add = (hit: ListingHit) =>
    setRows((prev) =>
      prev.length >= HERO_SLIDES_MAX || prev.some((r) => r.product_id === hit.product_id)
        ? prev
        : [...prev, { ...hit, status: "live", start: "", end: "" }],
    );

  const onSave = () =>
    save.mutate(
      rows.map((r) => ({ product_id: r.product_id, starts_at: fromLocalInput(r.start), ends_at: fromLocalInput(r.end) })),
      {
        onSuccess: (n) =>
          toast.success(n ? `Carousel saved: ${n} listing${n === 1 ? "" : "s"}` : "Carousel cleared: it shows popular listings", {
            description: "It reaches the site in about a minute.",
          }),
        onError: (e) => toast.error("Couldn't save the carousel", { description: (e as Error).message }),
      },
    );

  return (
    <Page>
      <PageHeader
        title="New Arrivals carousel"
        subtitle="The listings in the carousel at the top of the buyer's New Arrivals page, in order."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "hero-slides")} />}

      <Note className="mb-4">
        Pick up to {HERO_SLIDES_MAX} live listings and put them in order. A start or end time is optional (your
        computer's time zone). With nothing picked, or when none of the picks is live, the carousel shows the most
        popular live listings by itself. A pick that stops being live leaves the carousel on its own. Saving
        reaches the site in about a minute and is in the Admin Log.
      </Note>

      {slides.isLoading ? (
        <SkeletonList rows={3} height="h-20" />
      ) : slides.error ? (
        <ErrorNote message={(slides.error as Error).message} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel
            title={`In the carousel (${rows.length}/${HERO_SLIDES_MAX})`}
            description={
              lastChange
                ? `Last saved ${format(new Date(lastChange.updated_at!), "d MMM yyyy, HH:mm")}${lastChange.updated_by_name ? ` by ${lastChange.updated_by_name}` : ""}.`
                : "Nothing picked: the site shows the most popular live listings."
            }
            actions={
              <a
                href={`${BUYER_SITE}/home/new-arrivals`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
              >
                View on the site <ExternalLink size={12} />
              </a>
            }
          >
            {rows.length === 0 ? (
              <Empty>No listings picked. Add some from the search, or leave it empty for the automatic carousel.</Empty>
            ) : (
              <ol className="space-y-2">
                {rows.map((r, i) => (
                  <li key={r.product_id} data-hero-row={r.product_id} className="rounded-xl border border-line bg-surface p-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-ink-faint">{i + 1}</span>
                      <Thumb src={r.image} alt={r.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
                        <p className="truncate text-xs text-ink-muted">{r.brand_name ?? "Seller"}</p>
                        {r.status !== "live" && (
                          <span className="mt-1 inline-block"><Badge tone="caution">Not live: hidden from the carousel</Badge></span>
                        )}
                      </div>
                      {writable && (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button size="sm" variant="ghost" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                            <ArrowUp size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label={`Move ${r.name} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                            <ArrowDown size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => remove(i)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 grid gap-3 pl-8 sm:grid-cols-2">
                      <Field label="Starts (optional)" htmlFor={`start-${r.product_id}`}>
                        <Input
                          id={`start-${r.product_id}`}
                          type="datetime-local"
                          value={r.start}
                          disabled={!writable}
                          onChange={(e) => patch(i, { start: e.target.value })}
                        />
                      </Field>
                      <Field
                        label="Ends (optional)"
                        htmlFor={`end-${r.product_id}`}
                        error={badWindow === i ? "Ends before it starts." : null}
                      >
                        <Input
                          id={`end-${r.product_id}`}
                          type="datetime-local"
                          value={r.end}
                          disabled={!writable}
                          onChange={(e) => patch(i, { end: e.target.value })}
                        />
                      </Field>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {writable && (
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
                {dirty && <span className="mr-auto text-xs text-ink-muted">Unsaved changes</span>}
                <Button variant="ghost" disabled={!dirty || save.isPending} onClick={() => setRows(saved)}>
                  Discard
                </Button>
                <Button variant="primary" disabled={!dirty || save.isPending || badWindow >= 0} onClick={onSave}>
                  {save.isPending ? "Saving…" : "Save carousel"}
                </Button>
              </div>
            )}
          </Panel>

          {writable && <AddListings rows={rows} onAdd={add} />}
        </div>
      )}
    </Page>
  );
}

function AddListings({ rows, onAdd }: { rows: Row[]; onAdd: (hit: ListingHit) => void }) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  // Searches as you type, a moment after the last key.
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(text), 300);
    return () => window.clearTimeout(t);
  }, [text]);
  const results = useListingSearch(query);
  const full = rows.length >= HERO_SLIDES_MAX;
  const picked = new Set(rows.map((r) => r.product_id));

  return (
    <Panel title="Add a listing" description="Live listings only, by listing name or seller name.">
      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
        <Input
          type="search"
          aria-label="Search live listings"
          placeholder="e.g. linen shirt, or a seller's name"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="pl-8"
        />
      </div>
      {full && <p className="mb-2 text-xs text-ink-muted">The carousel is full. Remove one to add another.</p>}
      {results.isLoading ? (
        <SkeletonList rows={4} height="h-14" />
      ) : results.error ? (
        <ErrorNote message={(results.error as Error).message} />
      ) : (results.data ?? []).length === 0 ? (
        <Empty>{query.trim() ? "No live listing matches." : "No live listings yet."}</Empty>
      ) : (
        <ul className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
          {(results.data ?? []).map((hit) => {
            const added = picked.has(hit.product_id);
            return (
              <li key={hit.product_id} data-hero-hit={hit.product_id} className="flex items-center gap-3 rounded-lg border border-line p-2">
                <Thumb src={hit.image} alt={hit.name} small />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{hit.name}</p>
                  <p className="truncate text-2xs text-ink-muted">
                    {hit.brand_name ?? "Seller"}
                    {hit.category_name ? ` · ${hit.category_name}` : ""}
                  </p>
                </div>
                <Button size="sm" variant={added ? "ghost" : "outline"} disabled={added || full} onClick={() => onAdd(hit)}>
                  {added ? "Added" : (<><Plus size={12} /> Add</>)}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Thumb({ src, alt, small = false }: { src: string | null; alt: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const box = cn("shrink-0 overflow-hidden rounded-lg bg-surface-2", small ? "h-10 w-10" : "h-14 w-[42px]");
  if (!src || failed) {
    return (
      <span className={cn(box, "grid place-items-center text-ink-faint")}>
        <ImageOff size={14} aria-hidden />
      </span>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn(box, "object-cover")} />;
}
