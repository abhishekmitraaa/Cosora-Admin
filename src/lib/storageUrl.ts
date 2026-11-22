/**
 * A picture a buyer or seller wrote, shown in an admin's browser only when it is this project's own Storage
 * (review AR-M40, 2026-11-22). Any other host would load straight into staff browsers: a tracking pixel that tells its
 * owner which admin looked, and when. The buyer app applies the same rule (src/lib/storageUrl.ts there).
 */
const ORIGIN = (() => {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL as string).origin;
  } catch {
    return null;
  }
})();

export function ownStorageUrl(u: string | null | undefined): string | null {
  if (!u || !ORIGIN) return null;
  try {
    const url = new URL(u);
    if (url.origin !== ORIGIN) return null;
    if (!url.pathname.startsWith("/storage/v1/object/public/") && !url.pathname.startsWith("/storage/v1/render/image/public/")) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
