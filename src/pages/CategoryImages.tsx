import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ExternalLink, ImageOff, RotateCcw, Upload } from "lucide-react";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { IMAGE_TYPES } from "@/lib/siteContent";
import {
  SURFACE_HINT,
  categoryImageUrl,
  useCategoryImageSlots,
  useSetCategoryImage,
  type CategoryImageSlot,
} from "@/lib/categoryImages";
import {
  Badge,
  Button,
  ErrorNote,
  Field,
  Note,
  Page,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  Select,
  SkeletonList,
  Tabs,
  cn,
} from "@/components/ui";

/**
 * CATEGORY PICTURES (2026-10-14). Real data: lib/categoryImages.ts and the admin_category_image*
 * RPCs in textile-spark-net migration 20261014090000.
 *
 *   New Arrivals      the 12 tiles of "Shop by category" on the buyer home page
 *   Categories page   each category's banner and its sub-category tiles on /categories
 *
 * roles.ts section "category-images": super_admin and manager read and write; the RPCs and the
 * storage policies refuse everyone else. A slot with no picture shows the buyer app's default.
 */

const BUYER_SITE = "https://www.cosora.in";

type Tab = "new_arrivals" | "categories";

export default function CategoryImages() {
  const role = useRole();
  const writable = canWrite(role, "category-images");
  const slots = useCategoryImageSlots();
  const [tab, setTab] = useState<Tab>("new_arrivals");

  const rows = slots.data ?? [];
  const tiles = rows.filter((r) => r.surface === "new_arrivals");
  const groups = useMemo(() => {
    const map = new Map<string, CategoryImageSlot[]>();
    for (const r of rows) {
      if (r.surface === "new_arrivals") continue;
      const g = r.group_label ?? r.label;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);
  const custom = (list: CategoryImageSlot[]) => list.filter((r) => r.image_path).length;

  return (
    <Page>
      <PageHeader
        title="Category pictures"
        subtitle="The pictures buyers see for each category: New Arrivals' tiles, and the banners and tiles on the Categories page."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "category-images")} />}

      <Note className="mb-4">
        Upload a picture to replace Cosora's default, or put the default back. A change reaches the site in about a
        minute and is in the Admin Log. Pictures are resized before upload (JPEG, PNG or WebP, up to 2 MB after resizing).
      </Note>

      <Tabs
        tabs={[
          { id: "new_arrivals", label: "New Arrivals", count: custom(tiles) || undefined },
          { id: "categories", label: "Categories page", count: custom(groups.flatMap(([, g]) => g)) || undefined },
        ]}
        active={tab}
        onChange={setTab}
      />

      {slots.isLoading ? (
        <SkeletonList rows={3} height="h-40" />
      ) : slots.error ? (
        <ErrorNote message={(slots.error as Error).message} />
      ) : tab === "new_arrivals" ? (
        <Panel
          title="Shop by category"
          description="The 12 tiles on the buyer home page, in order. Each is shown whole on a white tile."
          actions={<SiteLink path="/home/new-arrivals" />}
        >
          <SlotGrid slots={tiles} writable={writable} />
        </Panel>
      ) : (
        <CategoriesTab groups={groups} writable={writable} />
      )}
    </Page>
  );
}

function SiteLink({ path }: { path: string }) {
  return (
    <a
      href={`${BUYER_SITE}${path}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
    >
      View on the site <ExternalLink size={12} />
    </a>
  );
}

function CategoriesTab({ groups, writable }: { groups: [string, CategoryImageSlot[]][]; writable: boolean }) {
  const [group, setGroup] = useState(groups[0]?.[0] ?? "");
  const current = groups.find(([g]) => g === group)?.[1] ?? [];
  const banner = current.filter((r) => r.surface === "categories_banner");
  const tiles = current.filter((r) => r.surface === "categories_tile");

  return (
    <div className="space-y-4">
      <Field label="Category" htmlFor="category-pick" className="max-w-xs">
        <Select id="category-pick" value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.map(([g, list]) => {
            const n = list.filter((r) => r.image_path).length;
            return (
              <option key={g} value={g}>
                {g}{n ? ` (${n} changed)` : ""}
              </option>
            );
          })}
        </Select>
      </Field>

      <Panel title="Banner" description={`The picture at the top of ${group} on the Categories page.`} actions={<SiteLink path="/categories" />}>
        <SlotGrid slots={banner} writable={writable} wide />
      </Panel>
      <Panel title="Sub-category tiles" description={`${tiles.length} tiles under ${group}.`}>
        <SlotGrid slots={tiles} writable={writable} />
      </Panel>
    </div>
  );
}

function SlotGrid({ slots, writable, wide = false }: { slots: CategoryImageSlot[]; writable: boolean; wide?: boolean }) {
  return (
    <div className={cn("grid gap-3", wide ? "grid-cols-1 sm:max-w-xl" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6")}>
      {slots.map((s) => (
        <SlotCard key={s.slot} slot={s} writable={writable} wide={wide} />
      ))}
    </div>
  );
}

function SlotCard({ slot, writable, wide }: { slot: CategoryImageSlot; writable: boolean; wide: boolean }) {
  const set = useSetCategoryImage();
  const input = useRef<HTMLInputElement | null>(null);
  const busy = set.isPending;

  const run = (file: File | null) => {
    set.mutate(
      { slot: slot.slot, surface: slot.surface, file },
      {
        onSuccess: (r) => {
          toast.success(file ? `Picture saved for ${slot.label}` : `${slot.label} shows the default again`, {
            description: "It reaches the site in about a minute.",
          });
          if (r.cleanupError) toast.warning("The old picture couldn't be removed from storage", { description: r.cleanupError });
        },
        onError: (e) => toast.error("Couldn't save the picture", { description: (e as Error).message }),
      },
    );
  };

  return (
    <div data-slot={slot.slot} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className={cn("relative bg-surface-2", wide ? "aspect-[16/7]" : "aspect-square")}>
        {slot.image_path ? (
          <img
            src={categoryImageUrl(slot.image_path)}
            alt={slot.label}
            className={cn("absolute inset-0 h-full w-full", slot.surface === "new_arrivals" ? "object-contain bg-white p-2" : "object-cover")}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-center text-ink-faint">
            <span className="flex flex-col items-center gap-1 text-2xs">
              <ImageOff size={16} aria-hidden />
              Cosora's default
            </span>
          </div>
        )}
        {busy && <div className="absolute inset-0 skeleton opacity-70" aria-hidden />}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold leading-snug text-ink">{slot.label}</p>
          <Badge tone={slot.image_path ? "info" : "neutral"}>{slot.image_path ? "Custom" : "Default"}</Badge>
        </div>
        {slot.updated_at && (
          <p className="text-2xs text-ink-faint">
            {format(new Date(slot.updated_at), "d MMM yyyy, HH:mm")}
            {slot.updated_by_name ? ` · ${slot.updated_by_name}` : ""}
          </p>
        )}
        {writable && (
          <div className="mt-auto flex flex-wrap gap-1.5">
            <input
              ref={input}
              type="file"
              accept={Object.keys(IMAGE_TYPES).join(",")}
              className="hidden"
              aria-label={`Picture for ${slot.label}`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) run(f);
              }}
            />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()} title={SURFACE_HINT[slot.surface]}>
              <Upload size={12} /> {slot.image_path ? "Replace" : "Upload"}
            </Button>
            {slot.image_path && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(null)}>
                <RotateCcw size={12} /> Use default
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
