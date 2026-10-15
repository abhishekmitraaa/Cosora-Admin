/**
 * Cosora-Admin's pictures are JPEG only (Mitra, 2026-10-16: "all the input pictures from the admin
 * should only accept JPEG format for the performance optimisation and fast rendering speed").
 *
 * Every picture input here (banners, category pictures, blog images, support replies) checks with
 * this module, and the database agrees: the `site-content` bucket accepts image/jpeg only and its
 * upload policies want a .jpg/.jpeg name; admin_support_prepare_upload() refuses any other picture
 * (textile-spark-net migration 20261016100000_reports_in_app_admin_jpeg).
 */

export const JPEG_MIME = "image/jpeg";
/** For <input accept>: the type, and the extensions for pickers that filter by name. */
export const JPEG_ACCEPT = "image/jpeg,.jpg,.jpeg";
export const JPEG_ONLY = "Use a JPEG picture (.jpg or .jpeg). PNG, WebP and other formats aren't accepted.";

/** The quick check: what the browser says the file is. */
export function isJpegType(file: File): boolean {
  return file.type === JPEG_MIME;
}

/**
 * The real check: the browser's type comes from the name, so a PNG renamed .jpg would pass the
 * quick one. A JPEG starts FF D8 FF. Throws JPEG_ONLY otherwise.
 */
export async function assertJpeg(file: File): Promise<void> {
  if (!isJpegType(file)) throw new Error(JPEG_ONLY);
  const head = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  if (head.length < 3 || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    throw new Error("That file is named .jpg but isn't a JPEG picture. Export it as JPEG and try again.");
  }
}
