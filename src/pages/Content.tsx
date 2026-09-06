import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { useDevSeed, SEED_ACTIVE } from "@/lib/devSeed/store";
import {
  addBanner,
  bannerStore,
  BODY_FONTS,
  CURRENT_THEME,
  editBanner,
  moveBanner,
  PLACEMENT_LABELS,
  TOKEN_LABELS,
  TOKEN_USAGE,
  type Banner,
  type BannerPlacement,
  type ThemeTokens,
} from "@/lib/devSeed/content";
import { HEADING_FONTS } from "@/lib/devSeed/content";
import {
  Badge,
  Button,
  Card,
  DevSeedBanner,
  Empty,
  Field,
  Input,
  Modal,
  Note,
  Page,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  Select,
  Stack,
  SubHeading,
  Tabs,
} from "@/components/ui";

/**
 * C1 - SITE CONTENT AND DESIGN. DEV-SEED DATA. Nothing here writes to Supabase.
 *
 * Both tabs edit a local store from src/lib/devSeed/content.ts, which is
 * populated in a development build and empty in production. See that file and
 * src/lib/devSeed/store.ts for the full contract; the short version is that
 * Phase 2 creates `site_banners` and `site_theme`, swaps the store for a query,
 * and this file's markup does not change.
 *
 * Gated to super_admin in roles.ts (section "content"), read and write.
 */

type Tab = "banners" | "theme";

const TABS: { id: Tab; label: string }[] = [
  { id: "banners", label: "Banners" },
  { id: "theme", label: "Theme" },
];

const EMPTY_DRAFT: Omit<Banner, "id"> = {
  title: "",
  subtitle: "",
  linkUrl: "",
  imageLabel: "",
  placement: "home_hero",
  position: 99,
  active: true,
  startsAt: null,
  endsAt: null,
};

export default function Content() {
  const role = useRole();
  const writable = canWrite(role, "content");
  const [tab, setTab] = useState<Tab>("banners");

  return (
    <Page>
      <PageHeader
        title="Site content"
        subtitle="Banners on the buyer-facing site, and the type and colour it is built from."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "content")} />}
      {SEED_ACTIVE && <DevSeedBanner what="Site content" />}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "banners" ? <BannersTab writable={writable} /> : <ThemeTab writable={writable} />}
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════ *
 * Banners
 * ══════════════════════════════════════════════════════════════════ */
function BannersTab({ writable }: { writable: boolean }) {
  const banners = useDevSeed(bannerStore);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Omit<Banner, "id">>(EMPTY_DRAFT);

  // Grouped by placement, because "which banner is on top" is only a question
  // within a placement. A single flat ordered list would let someone reorder a
  // vendor-dashboard banner against a buyer-home one, which means nothing.
  const placements = Object.keys(PLACEMENT_LABELS) as BannerPlacement[];
  const grouped = placements
    .map((p) => ({
      placement: p,
      rows: banners.filter((b) => b.placement === p).sort((a, b) => a.position - b.position),
    }))
    .filter((g) => g.rows.length > 0);

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setCreating(true);
  }

  function submitCreate() {
    if (!draft.title.trim()) return;
    addBanner({ ...draft, title: draft.title.trim(), subtitle: draft.subtitle.trim() });
    setCreating(false);
    toast.success("Banner added to the local fixture");
  }

  function submitEdit() {
    if (!editing || !editing.title.trim()) return;
    editBanner(editing.id, editing);
    setEditing(null);
    toast.success("Banner updated in the local fixture");
  }

  return (
    <Stack>
      <Note>
        Scheduling is two optional dates. A banner with no dates is live whenever it is active; a
        banner with dates is live only inside them <span className="font-medium text-ink">and</span>{" "}
        while active, so deactivating always wins over a schedule. Phase 2 needs the buyer-side query
        to apply the same rule, or a scheduled banner will keep serving after its end date.
      </Note>

      {banners.length === 0 ? (
        <Empty
          action={
            writable && (
              <Button variant="primary" onClick={openCreate}>
                <Plus size={14} /> Add a banner
              </Button>
            )
          }
        >
          No banners are configured. In a production build this list is empty because the{" "}
          <span className="font-mono text-2xs">site_banners</span> table does not exist yet.
        </Empty>
      ) : (
        grouped.map((group) => (
          <Panel
            key={group.placement}
            title={PLACEMENT_LABELS[group.placement]}
            description={`${group.rows.length} banner${group.rows.length === 1 ? "" : "s"}, in the order buyers see them.`}
            actions={
              writable && (
                <Button onClick={openCreate}>
                  <Plus size={14} /> Add
                </Button>
              )
            }
          >
            <div className="space-y-2">
              {group.rows.map((b, i) => (
                <BannerCard
                  key={b.id}
                  banner={b}
                  writable={writable}
                  isFirst={i === 0}
                  isLast={i === group.rows.length - 1}
                  onEdit={() => setEditing(b)}
                />
              ))}
            </div>
          </Panel>
        ))
      )}

      <Modal open={creating} title="Add a banner" onClose={() => setCreating(false)} width="lg">
        <BannerForm value={draft} onChange={setDraft} />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="primary" disabled={!draft.title.trim()} onClick={submitCreate}>
            Add banner
          </Button>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        title={`Edit "${editing?.title ?? ""}"`}
        onClose={() => setEditing(null)}
        width="lg"
      >
        {editing && (
          <BannerForm
            value={editing}
            onChange={(patch) => setEditing({ ...editing, ...patch })}
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" disabled={!editing?.title.trim()} onClick={submitEdit}>
            Save changes
          </Button>
        </div>
      </Modal>
    </Stack>
  );
}

function BannerCard({
  banner: b,
  writable,
  isFirst,
  isLast,
  onEdit,
}: {
  banner: Banner;
  writable: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
}) {
  const now = Date.now();
  const scheduled = b.startsAt || b.endsAt;
  const withinWindow =
    (!b.startsAt || new Date(b.startsAt).getTime() <= now) &&
    (!b.endsAt || new Date(b.endsAt).getTime() >= now);
  const serving = b.active && withinWindow;

  return (
    <Card padded={false} className="flex flex-wrap items-start gap-3 p-3">
      {/* A labelled slot, not a fake image. There is no upload pipeline behind
          this screen, and a grey rectangle pretending to be a photo would
          suggest otherwise. */}
      <div className="grid h-16 w-28 shrink-0 place-items-center rounded-lg border border-dashed border-line-strong bg-surface-2 px-2 text-center">
        <span className="break-all font-mono text-2xs leading-tight text-ink-faint">
          {b.imageLabel || "no image set"}
        </span>
      </div>

      <div className="min-w-[14rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{b.title}</span>
          {serving ? (
            <Badge tone="positive" dot>serving</Badge>
          ) : b.active ? (
            <Badge tone="caution" dot>outside its dates</Badge>
          ) : (
            <Badge dot>inactive</Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{b.subtitle}</p>
        <p className="mt-1 font-mono text-2xs text-ink-faint">{b.linkUrl || "no link set"}</p>
        {scheduled && (
          <p className="mt-1 text-2xs tabular-nums text-ink-faint">
            {b.startsAt ? new Date(b.startsAt).toLocaleDateString("en-IN") : "no start"} to{" "}
            {b.endsAt ? new Date(b.endsAt).toLocaleDateString("en-IN") : "no end"}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="flex flex-col gap-0.5">
          <button
            aria-label="Move up"
            disabled={!writable || isFirst}
            onClick={() => moveBanner(b.id, -1)}
            className="grid h-6 w-6 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            <ChevronUp size={13} />
          </button>
          <button
            aria-label="Move down"
            disabled={!writable || isLast}
            onClick={() => moveBanner(b.id, 1)}
            className="grid h-6 w-6 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            <ChevronDown size={13} />
          </button>
        </div>
        <Button size="sm" disabled={!writable} onClick={onEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant={b.active ? "danger" : "primary"}
          disabled={!writable}
          onClick={() => {
            editBanner(b.id, { active: !b.active });
            toast.success(b.active ? "Banner deactivated" : "Banner activated");
          }}
        >
          {b.active ? "Deactivate" : "Activate"}
        </Button>
      </div>
    </Card>
  );
}

function BannerForm({
  value,
  onChange,
}: {
  value: Omit<Banner, "id">;
  onChange: (patch: Omit<Banner, "id">) => void;
}) {
  const set = (patch: Partial<Banner>) => onChange({ ...value, ...patch });
  // <input type="date"> wants yyyy-mm-dd; the store holds ISO instants.
  const toDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const fromDate = (v: string) => (v ? new Date(`${v}T00:00:00`).toISOString() : null);

  return (
    <div className="space-y-3">
      <Field label="Headline" htmlFor="banner-title">
        <Input
          id="banner-title"
          autoFocus
          value={value.title}
          placeholder="Monsoon sourcing week"
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <Field label="Supporting line" htmlFor="banner-subtitle">
        <Input
          id="banner-subtitle"
          value={value.subtitle}
          placeholder="Rate cards from 40 mills, open until the end of the month."
          onChange={(e) => set({ subtitle: e.target.value })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Destination path" htmlFor="banner-link" hint="Relative to the buyer site.">
          <Input
            id="banner-link"
            value={value.linkUrl}
            placeholder="/categories/fabrics"
            onChange={(e) => set({ linkUrl: e.target.value })}
          />
        </Field>
        <Field
          label="Image filename"
          htmlFor="banner-image"
          hint="A name only for now. Uploads arrive with the storage bucket in Phase 2."
        >
          <Input
            id="banner-image"
            value={value.imageLabel}
            placeholder="monsoon-week-1600x600.jpg"
            onChange={(e) => set({ imageLabel: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Placement" htmlFor="banner-placement">
        <Select
          id="banner-placement"
          value={value.placement}
          onChange={(e) => set({ placement: e.target.value as BannerPlacement })}
        >
          {(Object.keys(PLACEMENT_LABELS) as BannerPlacement[]).map((p) => (
            <option key={p} value={p}>
              {PLACEMENT_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts on" htmlFor="banner-start" hint="Leave blank to start immediately.">
          <Input
            id="banner-start"
            type="date"
            value={toDate(value.startsAt)}
            onChange={(e) => set({ startsAt: fromDate(e.target.value) })}
          />
        </Field>
        <Field label="Ends on" htmlFor="banner-end" hint="Leave blank to run until deactivated.">
          <Input
            id="banner-end"
            type="date"
            value={toDate(value.endsAt)}
            onChange={(e) => set({ endsAt: fromDate(e.target.value) })}
          />
        </Field>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ *
 * Theme
 * ══════════════════════════════════════════════════════════════════ */
function ThemeTab({ writable }: { writable: boolean }) {
  const [draft, setDraft] = useState<ThemeTokens>(CURRENT_THEME);
  const dirty = JSON.stringify(draft) !== JSON.stringify(CURRENT_THEME);
  const swatchKeys = Object.keys(TOKEN_LABELS) as (keyof typeof TOKEN_LABELS)[];

  return (
    <Stack>
      <Note>
        This edits the <span className="font-medium text-ink">buyer-facing site's</span> theme, not
        this admin panel's. The admin panel's own tokens live in{" "}
        <span className="font-mono text-2xs">src/index.css</span> and its light and dark modes are
        controlled by the toggle in the navigation rail.
      </Note>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <Stack>
          <Panel
            title="Typography"
            description="A curated list, deliberately. Free text lets someone save a family that does not exist and take the buyer site's type down; an upload needs a licence, a storage bucket and a webfont pipeline. Every option here is a Google Font already available to the buyer app."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Heading font"
                htmlFor="theme-heading"
                hint={HEADING_FONTS.find((f) => f.family === draft.headingFont)?.note}
              >
                <Select
                  id="theme-heading"
                  disabled={!writable}
                  value={draft.headingFont}
                  onChange={(e) => setDraft({ ...draft, headingFont: e.target.value })}
                >
                  {HEADING_FONTS.map((f) => (
                    <option key={f.family} value={f.family}>
                      {f.family}
                      {f.devanagari ? " (Devanagari)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Body font"
                htmlFor="theme-body"
                hint={BODY_FONTS.find((f) => f.family === draft.bodyFont)?.note}
              >
                <Select
                  id="theme-body"
                  disabled={!writable}
                  value={draft.bodyFont}
                  onChange={(e) => setDraft({ ...draft, bodyFont: e.target.value })}
                >
                  {BODY_FONTS.map((f) => (
                    <option key={f.family} value={f.family}>
                      {f.family}
                      {f.devanagari ? " (Devanagari)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              Devanagari coverage is called out because Cosora's vendors do not all write in Latin
              script. A heading face without it falls back mid-sentence, which is worse than
              choosing a plainer family that has it.
            </p>
          </Panel>

          <Panel
            title="Colour tokens"
            description="Named after the job each colour does, not its hue, so a rebrand does not leave a token called blue holding a green."
          >
            <div className="space-y-2">
              {swatchKeys.map((key) => (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 p-2.5"
                >
                  <input
                    type="color"
                    aria-label={TOKEN_LABELS[key]}
                    disabled={!writable}
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-line bg-transparent disabled:cursor-not-allowed"
                  />
                  <div className="min-w-[10rem] flex-1">
                    <div className="text-sm font-medium text-ink">{TOKEN_LABELS[key]}</div>
                    <div className="text-2xs text-ink-faint">{TOKEN_USAGE[key]}</div>
                  </div>
                  <Input
                    aria-label={`${TOKEN_LABELS[key]} hex value`}
                    disabled={!writable}
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    className="w-28 font-mono text-xs uppercase"
                  />
                  {draft[key].toLowerCase() !== CURRENT_THEME[key].toLowerCase() && (
                    <Badge tone="caution">changed</Badge>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={!writable || !dirty} onClick={() => toast.message("Nothing was saved", { description: "The site_theme table does not exist yet. Phase 2 wires this button to it." })}>
                Save theme
              </Button>
              <Button disabled={!dirty} onClick={() => setDraft(CURRENT_THEME)}>
                Reset to live values
              </Button>
              {dirty && (
                <span className="text-xs text-caution-fg">
                  Preview only. Nothing is saved and the buyer site is unchanged.
                </span>
              )}
            </div>
          </Panel>
        </Stack>

        <ThemePreview theme={draft} />
      </div>
    </Stack>
  );
}

/**
 * Live preview.
 *
 * Deliberately a real miniature of buyer-side surfaces (a vendor card, a buyer
 * CTA, a verified badge) rather than a row of colour squares: the question this
 * pane answers is "can you read the label on that button", which swatches
 * cannot show. Fonts are applied by name and fall back to the system stack when
 * a family is not loaded, so a preview never renders in a face it is not
 * naming.
 */
function ThemePreview({ theme }: { theme: ThemeTokens }) {
  return (
    <div className="lg:sticky lg:top-6">
      <SubHeading className="mb-2 block">Preview</SubHeading>
      <div
        className="overflow-hidden rounded-xl border border-line shadow-card"
        style={{
          background: "#ffffff",
          color: theme.ink,
          fontFamily: `"${theme.bodyFont}", system-ui, sans-serif`,
        }}
      >
        <div className="border-b p-4" style={{ borderColor: theme.border }}>
          <div
            className="text-lg font-bold leading-tight"
            style={{ fontFamily: `"${theme.headingFont}", system-ui, sans-serif` }}
          >
            Cotton poplin, 120 GSM
          </div>
          <div className="mt-1 text-xs" style={{ color: theme.border }}>
            Rathi Textiles, Erode
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-2 py-1 text-xs font-medium"
              style={{ background: `${theme.success}1a`, color: theme.success }}
            >
              Verified supplier
            </span>
            <span className="text-xs" style={{ color: theme.border }}>
              MOQ 500 m
            </span>
          </div>
        </div>

        <div className="space-y-2 p-4">
          <button
            className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white"
            style={{ background: theme.vendorAccent }}
          >
            Send a quote
          </button>
          <button
            className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white"
            style={{ background: theme.buyerAccent }}
          >
            Request a sample
          </button>
          <button
            className="w-full rounded-lg border px-3 py-2 text-sm font-medium"
            style={{ borderColor: theme.border, color: theme.ink }}
          >
            Save for later
          </button>
          <p className="pt-1 text-xs leading-relaxed" style={{ color: theme.ink }}>
            Body copy at the size buyers actually read it, in{" "}
            <span style={{ color: theme.vendorAccent }}>the link colour</span> and the ink colour
            together.
          </p>
        </div>
      </div>
      <p className="mt-2 text-2xs leading-relaxed text-ink-faint">
        The preview is fixed to a light background because the buyer site has no dark mode. Check
        both filled buttons here: white text needs a background dark enough to carry it, and a light
        accent will fail that on this pane before it fails on the live site.
      </p>
    </div>
  );
}
