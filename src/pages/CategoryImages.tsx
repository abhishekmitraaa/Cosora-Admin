import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ExternalLink, ImageOff, RotateCcw, Upload } from "lucide-react";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { JPEG_ACCEPT } from "@/lib/jpeg";
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
  cn,
} from "@/components/ui";

/**
 * CATEGORY PICTURES (2026-10-14). Real data: lib/categoryImages.ts and the admin_category_image*
 * RPCs in textile-spark-net migration 20261014090000.
 *
 *   Categories page   each category's banner and its sub-category tiles on /categories
 *
 * Since 2026-10-17 a sub-category's tile is that category's picture on every page of the buyer site (New
 * Arrivals' "Shop by category", sellers' stores, Trends); New Arrivals no longer has pictures of its own
 * (migration 20261017100000 removed those slots).
 *
 * roles.ts section "category-images": super_admin and manager read and write; the RPCs and the
 * storage policies refuse everyone else. A slot with no picture shows the buyer app's default.
 */

const BUYER_SITE = "https://www.cosora.in";

export default function CategoryImages() {
  const role = useRole();
  const writable = canWrite(role, "category-images");
  const slots = useCategoryImageSlots();
  const rows = slots.data ?? [];
  const groups = useMemo(() => {
    const map = new Map<string, CategoryImageSlot[]>();
    for (const r of rows) {
      const g = r.group_label ?? r.label;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <Page>
      <PageHeader
        title="Category pictures"
        subtitle="The picture buyers see for each category, everywhere on the site: the Categories page's banners and tiles, New Arrivals' tiles, sellers' stores and Trends."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "category-images")} />}

      <Note className="mb-4">
        Upload a picture to replace Cosora's default, or put the default back. A change reaches the site in about a
        minute and is in the Admin Log. Pictures are JPEG (.jpg) only, and are resized before upload (up to 2 MB after resizing).
      </Note>

      {slots.isLoading ? (
        <SkeletonList rows={3} height="h-40" />
      ) : slots.error ? (
        <ErrorNote message={(slots.error as Error).message} />
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
            className="absolute inset-0 h-full w-full object-cover"
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
              accept={JPEG_ACCEPT}
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
