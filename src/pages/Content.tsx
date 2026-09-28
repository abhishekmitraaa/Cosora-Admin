import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ImageOff, Plus, Trash2 } from "lucide-react";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  BANNER_LIMITS,
  COLOUR_LABELS,
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  bannerImageUrl,
  contrast,
  isHex,
  isInternalPath,
  useDeleteBanner,
  useReorderBanners,
  useSaveBanner,
  useSaveTheme,
  useSiteBanners,
  useSiteTheme,
  type BannerDraft,
  type SiteBanner,
  type SiteTheme,
  type ThemeColour,
} from "@/lib/siteContent";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  Note,
  Page,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  Select,
  SkeletonList,
  Stack,
  SubHeading,
  Tabs,
  type Tone,
} from "@/components/ui";

/**
 * SITE CONTENT (admin completion Phase 9). Real data: lib/siteContent.ts and the
 * admin_site_* RPCs in textile-spark-net migration 20260928195051.
 *
 *   Banners  the vendor dashboard's banners (Mitra: nothing on the buyer side). Order,
 *            schedule, an optional image, and a button that goes to a path on cosora.in.
 *   Theme    the buyer site's five brand colours and two fonts, with the contrast floors
 *            the database enforces: text at least 4.5:1 on white, white at least 3:1 on
 *            each accent.
 *
 * roles.ts section "content": super_admin reads and writes; the RPCs refuse everyone else.
 * A saved change reaches the site in about a minute (the site-config snapshot).
 */

type Tab = "banners" | "theme";

const TABS: { id: Tab; label: string }[] = [
  { id: "banners", label: "Vendor dashboard banners" },
  { id: "theme", label: "Theme" },
];

export default function Content() {
  const role = useRole();
  const writable = canWrite(role, "content");
  const [tab, setTab] = useState<Tab>("banners");

  return (
    <Page>
      <PageHeader
        title="Site content"
        subtitle="Banners on the vendor dashboard, and the colours and fonts of the buyer site."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "content")} />}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "banners" ? <BannersTab writable={writable} /> : <ThemeTab writable={writable} />}
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════ *
 * Banners
 * ══════════════════════════════════════════════════════════════════ */

// <input type="date"> works in local days. A start is that day's first moment; an end is
// the first moment of the next day, so "ends on 5 Oct" runs through the 5th.
const dayStart = (v: string) => (v ? new Date(`${v}T00:00:00`).toISOString() : null);
const dayAfter = (v: string) => {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};
const startInput = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd") : "");
const endInput = (iso: string | null) => (iso ? format(new Date(Date.parse(iso) - 1), "yyyy-MM-dd") : "");

function draftFrom(b: SiteBanner | null): BannerDraft {
  return {
    title: b?.title ?? "",
    subtitle: b?.subtitle ?? "",
    cta_label: b?.cta_label ?? "",
    link_path: b?.link_path ?? "",
    image_path: b?.image_path ?? null,
    file: null,
    active: b?.active ?? true,
    starts_at: b?.starts_at ?? null,
    ends_at: b?.ends_at ?? null,
  };
}

function bannerStatus(b: SiteBanner, now: number): { label: string; tone: Tone } {
  if (!b.active) return { label: "off", tone: "neutral" };
  if (b.ends_at && Date.parse(b.ends_at) <= now) return { label: "ended", tone: "neutral" };
  if (b.starts_at && Date.parse(b.starts_at) > now) return { label: "scheduled", tone: "info" };
  return { label: "showing", tone: "positive" };
}

function BannersTab({ writable }: { writable: boolean }) {
  const banners = useSiteBanners();
  const reorder = useReorderBanners();
  const save = useSaveBanner();
  const [editing, setEditing] = useState<SiteBanner | "new" | null>(null);
  const [deleting, setDeleting] = useState<SiteBanner | null>(null);

  if (banners.isLoading) return <SkeletonList rows={2} height="h-28" />;
  if (banners.error) return <ErrorNote message={(banners.error as Error).message} />;
  const rows = banners.data ?? [];
  const now = Date.now();
  const busy = reorder.isPending || save.isPending;

  function move(index: number, dir: -1 | 1) {
    const ids = rows.map((b) => b.id);
    [ids[index], ids[index + dir]] = [ids[index + dir], ids[index]];
    reorder.mutate(ids, { onError: (e) => toast.error(e.message) });
  }

  function toggle(b: SiteBanner) {
    save.mutate(
      { id: b.id, draft: { ...draftFrom(b), active: !b.active }, previousImage: b.image_path },
      {
        onSuccess: () => toast.success(b.active ? "Banner turned off" : "Banner turned on"),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Stack>
      <Note>
        These show to sellers on the vendor dashboard, in this order. A banner shows while it's on and
        inside its dates, and a change reaches the site in about a minute. Buyer-side banners were
        removed (Mitra, 2026-09-27). Banner text shows in English until a translation is added to the
        buyer app's catalogues.
      </Note>

      {rows.length === 0 ? (
        <Empty
          action={
            writable && (
              <Button variant="primary" onClick={() => setEditing("new")}>
                <Plus size={14} /> Add a banner
              </Button>
            )
          }
        >
          No banners. The vendor dashboard shows none until one is added.
        </Empty>
      ) : (
        <Panel
          title="Vendor dashboard"
          description={`${rows.length} banner${rows.length === 1 ? "" : "s"}, in the order sellers see them.`}
          actions={
            writable && (
              <Button onClick={() => setEditing("new")}>
                <Plus size={14} /> Add
              </Button>
            )
          }
        >
          <div className="space-y-2">
            {rows.map((b, i) => {
              const s = bannerStatus(b, now);
              return (
                <Card key={b.id} padded={false} className="flex flex-wrap items-start gap-3 p-3">
                  {b.image_path ? (
                    <img
                      src={bannerImageUrl(b.image_path)}
                      alt=""
                      className="h-16 w-28 shrink-0 rounded-lg border border-line object-cover"
                    />
                  ) : (
                    <div className="grid h-16 w-28 shrink-0 place-items-center rounded-lg border border-dashed border-line-strong bg-surface-2 text-ink-faint">
                      <ImageOff size={16} aria-label="No image" />
                    </div>
                  )}

                  <div className="min-w-[14rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{b.title}</span>
                      <Badge tone={s.tone} dot>
                        {s.label}
                      </Badge>
                    </div>
                    {b.subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{b.subtitle}</p>}
                    <p className="mt-1 font-mono text-2xs text-ink-faint">
                      {b.link_path ? `${b.cta_label ? `"${b.cta_label}" → ` : ""}${b.link_path}` : "no link"}
                    </p>
                    {(b.starts_at || b.ends_at) && (
                      <p className="mt-1 text-2xs tabular-nums text-ink-faint">
                        {b.starts_at ? format(new Date(b.starts_at), "d MMM yyyy") : "now"} to{" "}
                        {b.ends_at ? format(new Date(Date.parse(b.ends_at) - 1), "d MMM yyyy") : "no end"}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <div className="flex flex-col gap-0.5">
                      <button
                        aria-label="Move up"
                        disabled={!writable || busy || i === 0}
                        onClick={() => move(i, -1)}
                        className="grid h-6 w-6 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        aria-label="Move down"
                        disabled={!writable || busy || i === rows.length - 1}
                        onClick={() => move(i, 1)}
                        className="grid h-6 w-6 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                      >
                        <ChevronDown size={13} />
                      </button>
                    </div>
                    <Button size="sm" disabled={!writable || busy} onClick={() => setEditing(b)}>
                      Edit
                    </Button>
                    <Button size="sm" disabled={!writable || busy} onClick={() => toggle(b)}>
                      {b.active ? "Turn off" : "Turn on"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label={`Delete "${b.title}"`}
                      disabled={!writable || busy}
                      onClick={() => setDeleting(b)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </Panel>
      )}

      {editing !== null && (
        <BannerModal banner={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
      {deleting && <DeleteModal banner={deleting} onClose={() => setDeleting(null)} />}
    </Stack>
  );
}

function validate(d: BannerDraft): Partial<Record<keyof BannerDraft, string>> {
  const e: Partial<Record<keyof BannerDraft, string>> = {};
  const title = d.title.trim();
  if (!title) e.title = "A banner needs a headline.";
  else if (title.length > BANNER_LIMITS.title) e.title = `At most ${BANNER_LIMITS.title} characters.`;
  if (d.subtitle.trim().length > BANNER_LIMITS.subtitle) e.subtitle = `At most ${BANNER_LIMITS.subtitle} characters.`;
  if (d.cta_label.trim().length > BANNER_LIMITS.cta) e.cta_label = `At most ${BANNER_LIMITS.cta} characters.`;
  const link = d.link_path.trim();
  if (link && !isInternalPath(link)) e.link_path = 'A path on cosora.in that starts with one "/", like /advertisements.';
  if (d.cta_label.trim() && !link) e.link_path = "A button needs a destination.";
  if (d.starts_at && d.ends_at && Date.parse(d.starts_at) >= Date.parse(d.ends_at)) e.ends_at = "The banner must start before it ends.";
  return e;
}

function BannerModal({ banner, onClose }: { banner: SiteBanner | null; onClose: () => void }) {
  const save = useSaveBanner();
  const [draft, setDraft] = useState<BannerDraft>(() => draftFrom(banner));
  const [fileError, setFileError] = useState<string | null>(null);
  const errors = validate(draft);
  const valid = Object.keys(errors).length === 0;
  const set = (patch: Partial<BannerDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // A picked file previews from memory; it's uploaded only when the banner is saved.
  const localPreview = useMemo(() => (draft.file ? URL.createObjectURL(draft.file) : null), [draft.file]);
  useEffect(() => () => void (localPreview && URL.revokeObjectURL(localPreview)), [localPreview]);
  const preview = localPreview ?? (draft.image_path ? bannerImageUrl(draft.image_path) : null);

  function pick(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    if (!IMAGE_TYPES[file.type]) return setFileError("Use a JPEG, PNG or WebP image.");
    if (file.size > IMAGE_MAX_BYTES) return setFileError("The image must be 2 MB or smaller.");
    set({ file });
  }

  function submit() {
    save.mutate(
      {
        id: banner?.id ?? null,
        draft: { ...draft, title: draft.title.trim(), subtitle: draft.subtitle.trim(), cta_label: draft.cta_label.trim(), link_path: draft.link_path.trim() },
        previousImage: banner?.image_path ?? null,
      },
      {
        onSuccess: (r) => {
          toast.success(banner ? "Banner saved" : "Banner added", { description: "It reaches the vendor dashboard in about a minute." });
          if (r.cleanupError) toast.warning(`The old image couldn't be deleted: ${r.cleanupError}`);
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Modal open title={banner ? `Edit "${banner.title}"` : "Add a banner"} onClose={onClose} width="lg">
      <div className="space-y-3">
        <Field label={`Headline (${draft.title.trim().length}/${BANNER_LIMITS.title})`} htmlFor="banner-title" error={draft.title ? errors.title : null}>
          <Input
            id="banner-title"
            autoFocus
            value={draft.title}
            maxLength={BANNER_LIMITS.title + 20}
            placeholder="Get prime placement above competitors"
            onChange={(e) => set({ title: e.target.value })}
          />
        </Field>
        <Field label="Supporting line" htmlFor="banner-subtitle" error={errors.subtitle}>
          <Input
            id="banner-subtitle"
            value={draft.subtitle}
            placeholder="Boost your visibility with featured listings"
            onChange={(e) => set({ subtitle: e.target.value })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Button label" htmlFor="banner-cta" hint="Leave blank for no button." error={errors.cta_label}>
            <Input id="banner-cta" value={draft.cta_label} placeholder="Claim this banner" onChange={(e) => set({ cta_label: e.target.value })} />
          </Field>
          <Field label="Destination" htmlFor="banner-link" hint="A path on cosora.in." error={errors.link_path}>
            <Input
              id="banner-link"
              value={draft.link_path}
              placeholder="/advertisements"
              className="font-mono text-xs"
              onChange={(e) => set({ link_path: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Image" htmlFor="banner-image" hint="Optional. JPEG, PNG or WebP, up to 2 MB, about 3:2." error={fileError}>
          <div className="flex flex-wrap items-center gap-3">
            {preview ? (
              <img src={preview} alt="" className="h-20 w-32 rounded-lg border border-line object-cover" />
            ) : (
              <div className="grid h-20 w-32 place-items-center rounded-lg border border-dashed border-line-strong bg-surface-2 text-ink-faint">
                <ImageOff size={16} aria-label="No image" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <input
                id="banner-image"
                type="file"
                accept={Object.keys(IMAGE_TYPES).join(",")}
                onChange={(e) => pick(e.target.files?.[0])}
                className="text-xs text-ink-muted file:mr-2 file:rounded-md file:border file:border-line file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:text-ink"
              />
              {preview && (
                <Button size="sm" variant="ghost" onClick={() => set({ file: null, image_path: null })}>
                  Remove image
                </Button>
              )}
            </div>
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts on" htmlFor="banner-start" hint="Blank: straight away.">
            <Input id="banner-start" type="date" value={startInput(draft.starts_at)} onChange={(e) => set({ starts_at: dayStart(e.target.value) })} />
          </Field>
          <Field label="Ends after" htmlFor="banner-end" hint="Blank: until turned off." error={errors.ends_at}>
            <Input id="banner-end" type="date" value={endInput(draft.ends_at)} onChange={(e) => set({ ends_at: dayAfter(e.target.value) })} />
          </Field>
        </div>

        <Checkbox label="On" hint="A banner that's off never shows, whatever its dates." checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!valid || save.isPending} onClick={submit}>
          {save.isPending ? "Saving…" : banner ? "Save changes" : "Add banner"}
        </Button>
      </div>
    </Modal>
  );
}

function DeleteModal({ banner, onClose }: { banner: SiteBanner; onClose: () => void }) {
  const del = useDeleteBanner();
  return (
    <Modal open title={`Delete "${banner.title}"?`} onClose={onClose}>
      <p className="text-sm text-ink-muted">
        It leaves the vendor dashboard within about a minute{banner.image_path ? ", and its image is deleted" : ""}. To take a
        banner down for a while instead, turn it off.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose} disabled={del.isPending}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={del.isPending}
          onClick={() =>
            del.mutate(banner.id, {
              onSuccess: (imageError) => {
                toast.success("Banner deleted");
                if (imageError) toast.warning(`Its image couldn't be deleted: ${imageError}`);
                onClose();
              },
              onError: (e) => toast.error(e.message),
            })
          }
        >
          {del.isPending ? "Deleting…" : "Delete banner"}
        </Button>
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════ *
 * Theme
 * ══════════════════════════════════════════════════════════════════ */

const COLOURS = Object.keys(COLOUR_LABELS) as ThemeColour[];

const pickTheme = (t: SiteTheme): SiteTheme => ({
  vendor_accent: t.vendor_accent,
  buyer_accent: t.buyer_accent,
  success: t.success,
  border: t.border,
  ink: t.ink,
  heading_font: t.heading_font,
  body_font: t.body_font,
});

function ThemeTab({ writable }: { writable: boolean }) {
  const state = useSiteTheme();
  const saveTheme = useSaveTheme();
  const [draft, setDraft] = useState<SiteTheme | null>(null);

  useEffect(() => {
    if (state.data && draft === null) setDraft(pickTheme(state.data.theme));
  }, [state.data, draft]);

  if (state.isLoading || (state.data && !draft)) return <SkeletonList rows={2} height="h-40" />;
  if (state.error) return <ErrorNote message={(state.error as Error).message} />;
  if (!state.data || !draft) return null;

  const { fonts, floors, defaults } = state.data;
  const saved = pickTheme(state.data.theme);
  const normalised = { ...draft, ...Object.fromEntries(COLOURS.map((k) => [k, draft[k].toLowerCase()])) } as SiteTheme;
  const dirty = JSON.stringify(normalised) !== JSON.stringify(saved);
  const coloursOk = COLOURS.every((k) => isHex(draft[k]));
  const checks = coloursOk
    ? [
        { label: "Text on white", ratio: contrast(draft.ink, "#ffffff"), floor: floors.ink_on_white },
        { label: "White on the vendor accent", ratio: contrast("#ffffff", draft.vendor_accent), floor: floors.white_on_accent },
        { label: "White on the buyer accent", ratio: contrast("#ffffff", draft.buyer_accent), floor: floors.white_on_accent },
      ]
    : [];
  const floorsOk = coloursOk && checks.every((c) => c.ratio >= c.floor);

  return (
    <Stack>
      <Note>
        This is the buyer site's theme (cosora.in, the buyer and vendor app), not this panel's. A saved theme
        reaches the site in about a minute. A few standard buttons use a separate colour setting and keep
        today's coral for now, whatever the buyer accent.
      </Note>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <Stack>
          <Panel
            title="Typography"
            description="Open Sans (body) and Roboto (headings) are what the site shipped with. The others load from Google Fonts when chosen."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Heading font" htmlFor="theme-heading">
                <Select
                  id="theme-heading"
                  disabled={!writable}
                  value={draft.heading_font}
                  onChange={(e) => setDraft({ ...draft, heading_font: e.target.value })}
                >
                  {fonts.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Body font" htmlFor="theme-body">
                <Select
                  id="theme-body"
                  disabled={!writable}
                  value={draft.body_font}
                  onChange={(e) => setDraft({ ...draft, body_font: e.target.value })}
                >
                  {fonts.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Panel>

          <Panel title="Colours" description="Named for the job each colour does, so a rebrand never leaves a token called blue holding a green.">
            <div className="space-y-2">
              {COLOURS.map((key) => {
                const ok = isHex(draft[key]);
                return (
                  <div key={key} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 p-2.5">
                    <input
                      type="color"
                      aria-label={COLOUR_LABELS[key].label}
                      disabled={!writable}
                      value={ok ? draft[key].toLowerCase() : "#000000"}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-line bg-transparent disabled:cursor-not-allowed"
                    />
                    <div className="min-w-[10rem] flex-1">
                      <div className="text-sm font-medium text-ink">{COLOUR_LABELS[key].label}</div>
                      <div className="text-2xs text-ink-faint">{COLOUR_LABELS[key].usage}</div>
                    </div>
                    <Input
                      aria-label={`${COLOUR_LABELS[key].label} hex value`}
                      disabled={!writable}
                      value={draft[key]}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.value.trim() })}
                      className="w-28 font-mono text-xs uppercase"
                    />
                    {!ok ? (
                      <Badge tone="critical">not #rrggbb</Badge>
                    ) : (
                      draft[key].toLowerCase() !== saved[key] && <Badge tone="caution">changed</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Contrast" description="The database refuses a theme below these floors.">
            {coloursOk ? (
              <ul className="divide-y divide-line text-sm">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-ink-muted">{c.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums text-ink">{c.ratio.toFixed(2)}:1</span>
                      <Badge tone={c.ratio >= c.floor ? "positive" : "critical"} dot>
                        {c.ratio >= c.floor ? `meets ${c.floor}:1` : `below ${c.floor}:1`}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">Fix the colours marked above to see their contrast.</p>
            )}
          </Panel>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={!writable || !dirty || !floorsOk || saveTheme.isPending}
              onClick={() =>
                saveTheme.mutate(normalised, {
                  onSuccess: () => toast.success("Theme saved", { description: "It reaches the site in about a minute." }),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              {saveTheme.isPending ? "Saving…" : "Save theme"}
            </Button>
            <Button disabled={!dirty} onClick={() => setDraft(saved)}>
              Revert to saved
            </Button>
            <Button disabled={!writable || JSON.stringify(normalised) === JSON.stringify(pickTheme(defaults))} onClick={() => setDraft(pickTheme(defaults))}>
              Cosora defaults
            </Button>
            {dirty && <span className="text-xs text-caution-fg">Not saved yet. The site is unchanged.</span>}
          </div>
        </Stack>

        <ThemePreview theme={coloursOk ? normalised : saved} />
      </div>
    </Stack>
  );
}

/**
 * A miniature of buyer-site surfaces, in the chosen fonts (loaded from Google Fonts for
 * the preview). The question it answers is "can you read that button", which swatches can't.
 */
function ThemePreview({ theme }: { theme: SiteTheme }) {
  useEffect(() => {
    for (const family of [theme.heading_font, theme.body_font]) {
      const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;700&display=swap`;
      if (document.querySelector(`link[data-preview-font="${family}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-preview-font", family);
      document.head.appendChild(link);
    }
  }, [theme.heading_font, theme.body_font]);

  return (
    <div className="lg:sticky lg:top-6">
      <SubHeading className="mb-2 block">Preview</SubHeading>
      <div
        className="overflow-hidden rounded-xl border border-line shadow-card"
        style={{ background: "#ffffff", color: theme.ink, fontFamily: `"${theme.body_font}", system-ui, sans-serif` }}
      >
        <div className="border-b p-4" style={{ borderColor: theme.border }}>
          <div className="text-lg font-bold leading-tight" style={{ fontFamily: `"${theme.heading_font}", system-ui, sans-serif` }}>
            Cotton poplin, 120 GSM
          </div>
          <div className="mt-1 text-xs" style={{ color: theme.buyer_accent }}>
            ₹245 / metre · MOQ 500 m
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md px-2 py-1 text-xs font-medium" style={{ background: `${theme.success}1a`, color: theme.success }}>
              Verified supplier
            </span>
          </div>
        </div>
        <div className="space-y-2 p-4">
          <button className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: theme.buyer_accent }}>
            Request a quote
          </button>
          <button className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: theme.vendor_accent }}>
            Send a quote (vendor)
          </button>
          <button className="w-full rounded-lg border px-3 py-2 text-sm font-medium" style={{ borderColor: theme.border, color: theme.ink }}>
            Save for later
          </button>
          <p className="pt-1 text-xs leading-relaxed">
            Body text as buyers read it, with <span style={{ color: theme.vendor_accent }}>a vendor link</span>.
          </p>
        </div>
      </div>
      <p className="mt-2 text-2xs leading-relaxed text-ink-faint">
        The site has no dark mode, so the preview is always light.
      </p>
    </div>
  );
}
