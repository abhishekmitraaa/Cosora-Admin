import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * SITE CONTENT (admin completion Phase 9, migration 20260928195051 in textile-spark-net).
 *
 * Mitra's decision (2026-09-27): no banner placements on the buyer side; banners on the
 * vendor dashboard, and a Theme tab that is live on the site. Everything here is a
 * super_admin RPC, and the database checks every rule again:
 *   admin_site_banners / _banner_save / _banner_delete / _banner_reorder
 *   admin_site_theme_get / _theme_save
 * Images go to the public `site-content` bucket under banners/<uuid>.<ext> (the storage
 * policies admit super admins there and nowhere else).
 *
 * The buyer app reads both from site-config/site.json, which the `site-config-snapshot`
 * edge function rebuilds after every save, so a change reaches the site in about a
 * minute. Both tables are in the Admin Log.
 */

export interface SiteBanner {
  id: string;
  title: string;
  subtitle: string | null;
  cta_label: string | null;
  link_path: string | null;
  image_path: string | null;
  position: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ThemeColour = "vendor_accent" | "buyer_accent" | "success" | "border" | "ink";

export interface SiteTheme extends Record<ThemeColour, string> {
  heading_font: string;
  body_font: string;
}

export interface ThemeState {
  theme: SiteTheme & { updated_at?: string };
  defaults: SiteTheme;
  fonts: string[];
  floors: { ink_on_white: number; white_on_accent: number };
}

export const BANNER_LIMITS = { title: 80, subtitle: 160, cta: 30, path: 200 } as const;
export const SITE_CONTENT_BUCKET = "site-content";
export const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** The colours, named by their job, not their hue. */
export const COLOUR_LABELS: Record<ThemeColour, { label: string; usage: string }> = {
  vendor_accent: { label: "Vendor accent", usage: "Vendor buttons, links and blue states" },
  buyer_accent: { label: "Buyer accent", usage: "Buyer buttons, alerts, prices and the Switch to Buyer banner" },
  success: { label: "Success", usage: "Verified, accepted and success states" },
  border: { label: "Borders", usage: "Borders, inactive controls and placeholder text" },
  ink: { label: "Text", usage: "Body text and headings" },
};

/** A path on cosora.in, the same rule as the database's. */
export function isInternalPath(p: string): boolean {
  return p.length <= BANNER_LIMITS.path && /^\/[^/\\]/.test(p) && !/[\s<>"'`\u0000-\u001f]/.test(p);
}

export function bannerImageUrl(path: string): string {
  return supabase.storage.from(SITE_CONTENT_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** WCAG 2 contrast, mirroring admin.contrast_ratio(). */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [la, lb] = [lum(a), lum(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

export function useSiteBanners() {
  return useQuery({
    queryKey: ["site-content", "banners"],
    queryFn: async (): Promise<SiteBanner[]> => {
      const { data, error } = await supabase.rpc("admin_site_banners");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SiteBanner[];
    },
  });
}

export function useSiteTheme() {
  return useQuery({
    queryKey: ["site-content", "theme"],
    queryFn: async (): Promise<ThemeState> => {
      const { data, error } = await supabase.rpc("admin_site_theme_get");
      if (error) throw new Error(error.message);
      return data as unknown as ThemeState;
    },
  });
}

/** Checks the type and size the bucket enforces, then uploads under a new name. Returns the path. */
export async function uploadBannerImage(file: File): Promise<string> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error("Use a JPEG, PNG or WebP image.");
  if (file.size > IMAGE_MAX_BYTES) throw new Error("The image must be 2 MB or smaller.");
  const path = `banners/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(SITE_CONTENT_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** Best effort: returns the error message, or null when the object is gone. */
export async function removeBannerImage(path: string): Promise<string | null> {
  const { error } = await supabase.storage.from(SITE_CONTENT_BUCKET).remove([path]);
  return error ? error.message : null;
}

export interface BannerDraft {
  title: string;
  subtitle: string;
  cta_label: string;
  link_path: string;
  /** The image already saved on the banner, or null when there is none or it's being removed. */
  image_path: string | null;
  /** A newly picked image, uploaded only when the banner is saved. */
  file: File | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

export interface SaveResult {
  id: string;
  /** Set when the replaced image couldn't be removed from storage. */
  cleanupError: string | null;
}

/**
 * Saves a banner. A new image is uploaded first; if the save is refused, the upload is
 * removed again. After a successful save, the image it replaced (or removed) is deleted:
 * the row first, then the object.
 */
export function useSaveBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft, previousImage }: { id: string | null; draft: BannerDraft; previousImage: string | null }): Promise<SaveResult> => {
      const uploaded = draft.file ? await uploadBannerImage(draft.file) : null;
      const image = uploaded ?? draft.image_path;
      const { data, error } = await supabase.rpc("admin_site_banner_save", {
        p_id: id ?? undefined,
        p_title: draft.title,
        p_subtitle: draft.subtitle || undefined,
        p_cta_label: draft.cta_label || undefined,
        p_link_path: draft.link_path || undefined,
        p_image_path: image ?? undefined,
        p_active: draft.active,
        p_starts_at: draft.starts_at ?? undefined,
        p_ends_at: draft.ends_at ?? undefined,
      });
      if (error) {
        if (uploaded) await removeBannerImage(uploaded);
        throw new Error(error.message);
      }
      const cleanupError = previousImage && previousImage !== image ? await removeBannerImage(previousImage) : null;
      return { id: data as string, cleanupError };
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["site-content", "banners"] }),
  });
}

/** Deletes the row, then its image. Returns the storage error if the image stayed behind. */
export function useDeleteBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string | null> => {
      const { data, error } = await supabase.rpc("admin_site_banner_delete", { p_id: id });
      if (error) throw new Error(error.message);
      const image = data as string | null;
      return image ? await removeBannerImage(image) : null;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["site-content", "banners"] }),
  });
}

export function useReorderBanners() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("admin_site_banner_reorder", { p_ids: ids });
      if (error) throw new Error(error.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["site-content", "banners"] }),
  });
}

export function useSaveTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: SiteTheme) => {
      const { error } = await supabase.rpc("admin_site_theme_save", {
        p_vendor_accent: t.vendor_accent,
        p_buyer_accent: t.buyer_accent,
        p_success: t.success,
        p_border: t.border,
        p_ink: t.ink,
        p_heading_font: t.heading_font,
        p_body_font: t.body_font,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["site-content", "theme"] }),
  });
}
