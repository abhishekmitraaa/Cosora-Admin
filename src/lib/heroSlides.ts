import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * NEW ARRIVALS CAROUSEL (2026-10-14; migration 20261014150000_hero_slides in textile-spark-net).
 *
 * Mitra: "the top carousel in the new arrivals should be controllable as in what to put in the top
 * carousel". The carousel at the top of the buyer's New Arrivals page shows the live listings picked
 * here, in order, each inside its optional schedule. With nothing picked (or none of the picks live)
 * it shows the most popular live listings by itself. A pick that stops being live drops out of the
 * carousel on the site; it stays in this list, marked, until someone removes it.
 *
 *   admin_hero_slides()              the picks, with name, seller, status and picture
 *   admin_hero_slides_save(slides)   replaces the whole ordered list; at most 12; a listing joining
 *                                    it must be live
 *
 * Both admit super_admin and manager (admin.require_hero_slides_admin()). Each change is in the
 * Admin Log, and reaches the site in about a minute through the site-config snapshot.
 *
 * Search uses feed_products, the buyer feeds' own function: it returns live listings only, so
 * nothing a buyer can't see can be offered here.
 */

export const HERO_SLIDES_MAX = 12;

export interface HeroSlide {
  product_id: string;
  position: number;
  starts_at: string | null;
  ends_at: string | null;
  name: string;
  status: string;
  brand_name: string | null;
  image: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
}

/** A listing found by the search, ready to add. */
export interface ListingHit {
  product_id: string;
  name: string;
  brand_name: string | null;
  image: string | null;
  category_name: string | null;
}

/** What a save sends, per slide, in order. */
export interface HeroSlideDraft {
  product_id: string;
  starts_at: string | null;
  ends_at: string | null;
}

export function useHeroSlides() {
  return useQuery({
    queryKey: ["hero-slides"],
    queryFn: async (): Promise<HeroSlide[]> => {
      const { data, error } = await supabase.rpc("admin_hero_slides");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as HeroSlide[];
    },
  });
}

/** Live listings whose name or seller matches (feed_products), paid tiers then newest first. Empty query: all of them. */
export function useListingSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["hero-slides", "search", q],
    queryFn: async (): Promise<ListingHit[]> => {
      const { data, error } = await supabase.rpc("feed_products", {
        p_sort: "newest",
        p_limit: 24,
        p_offset: 0,
        p_query: q || undefined,
      });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        product_id: r.id,
        name: r.name,
        brand_name: r.brand_name,
        image: r.images?.[0] ?? null,
        category_name: r.category_name,
      }));
    },
    staleTime: 30_000,
  });
}

export function useSaveHeroSlides() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slides: HeroSlideDraft[]) => {
      const { data, error } = await supabase.rpc("admin_hero_slides_save", {
        p_slides: slides as unknown as never,
      });
      if (error) throw new Error(error.message);
      return data as number;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["hero-slides"] }),
  });
}

/** An ISO time as a datetime-local value in this browser's time zone, or "". */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value (this browser's time zone) as ISO, or null when empty. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
