import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { SITE_CONTENT_BUCKET, IMAGE_MAX_BYTES } from "@/lib/siteContent";
import { assertJpeg, JPEG_MIME } from "@/lib/jpeg";

/**
 * CATEGORY PICTURES (2026-10-14; migration 20261014090000_category_images in textile-spark-net).
 *
 * Mitra: "the manager admin should be able to change the pictures of the categories on the buyer
 * side, on New Arrivals and in the categories section". Every picture is a SLOT the buyer app
 * names (its src/lib/categoryImageSlots.ts): New Arrivals' 12 tiles, and each category's banner
 * and sub-category tiles on /categories. A slot with no picture shows the app's own default.
 *
 *   admin_category_images()                 every slot, its picture and who last changed it
 *   admin_category_image_set(slot, path)    set, or null for the default; returns the replaced path
 *
 * Both admit super_admin and manager (admin.require_category_image_admin()). Pictures go to the
 * public `site-content` bucket under categories/<uuid>.<ext>, where the storage policies admit the
 * same two roles. Each change is in the Admin Log, and reaches the site in about a minute through
 * the site-config snapshot.
 */

export type SlotSurface = "new_arrivals" | "categories_banner" | "categories_tile";

export interface CategoryImageSlot {
  slot: string;
  surface: SlotSurface;
  label: string;
  group_label: string | null;
  position: number;
  image_path: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
}

/** The longest side a picture is stored at, by where it shows. Banners are wide; tiles are small squares. */
export const MAX_SIDE: Record<SlotSurface, { w: number; h: number }> = {
  new_arrivals: { w: 800, h: 800 },
  categories_tile: { w: 800, h: 800 },
  categories_banner: { w: 1600, h: 900 },
};

export const SURFACE_HINT: Record<SlotSurface, string> = {
  new_arrivals: "Square. A product on a plain white background reads best (JPEG has no transparency); it's shown whole, not cropped.",
  categories_tile: "Square. It's cropped to fill the tile.",
  categories_banner: "Wide, about 16:7. It's cropped to fill the banner, with the category's name over the bottom.",
};

export function categoryImageUrl(path: string): string {
  return supabase.storage.from(SITE_CONTENT_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function useCategoryImageSlots() {
  return useQuery({
    queryKey: ["category-images"],
    queryFn: async (): Promise<CategoryImageSlot[]> => {
      const { data, error } = await supabase.rpc("admin_category_images");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CategoryImageSlot[];
    },
  });
}

/**
 * Shrinks a JPEG to the size it's shown at and re-encodes it as JPEG (JPEG only since 2026-10-16,
 * lib/jpeg.ts). A phone photo of several megabytes becomes a few hundred kilobytes, which is what
 * every visitor downloads. A picture already small enough is re-encoded only if that makes it smaller.
 */
export async function preparePicture(file: File, surface: SlotSurface): Promise<{ blob: Blob; ext: string }> {
  await assertJpeg(file);
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file couldn't be read as a picture.");
  });
  const { w, h } = MAX_SIDE[surface];
  const scale = Math.min(1, w / bitmap.width, h / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare the picture.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encode = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const blob = await encode(JPEG_MIME, 0.86);
  if (!blob || blob.type !== JPEG_MIME) throw new Error("This browser can't prepare the picture.");

  // Not made bigger by re-encoding: keep the original when it was already the right size and smaller.
  const keepOriginal = scale === 1 && file.size <= blob.size;
  const out = keepOriginal ? file : blob;
  if (out.size > IMAGE_MAX_BYTES) throw new Error("The picture must be 2 MB or smaller.");
  return { blob: out, ext: "jpg" };
}

async function uploadPicture(file: File, surface: SlotSurface): Promise<string> {
  const { blob, ext } = await preparePicture(file, surface);
  const path = `categories/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(SITE_CONTENT_BUCKET)
    .upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** Best effort: the storage error, or null when the object is gone. */
async function removePicture(path: string): Promise<string | null> {
  const { error } = await supabase.storage.from(SITE_CONTENT_BUCKET).remove([path]);
  return error ? error.message : null;
}

export interface SetResult {
  /** Set when the replaced picture couldn't be removed from storage. */
  cleanupError: string | null;
}

/**
 * Sets a slot's picture (a file) or puts the default back (null). A new picture is uploaded first;
 * if the save is refused, the upload is removed again. After a save, the picture it replaced is
 * removed: the row first, then the object.
 */
export function useSetCategoryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slot, surface, file }: { slot: string; surface: SlotSurface; file: File | null }): Promise<SetResult> => {
      const uploaded = file ? await uploadPicture(file, surface) : null;
      const { data, error } = await supabase.rpc("admin_category_image_set", { p_slot: slot, p_image_path: uploaded });
      if (error) {
        if (uploaded) await removePicture(uploaded);
        throw new Error(error.message);
      }
      const replaced = data as string | null;
      return { cleanupError: replaced ? await removePicture(replaced) : null };
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["category-images"] }),
  });
}
