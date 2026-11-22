/**
 * A picture that fails to load shows a plain "Picture unavailable" tile instead of the browser's broken-image icon
 * (review AR-L32: the Products queue and Premises photos showed nothing a moderator could act on). One listener for
 * every <img>, in the capture phase because `error` doesn't bubble. The tile is an inline SVG (img-src allows data:).
 * An <img> with its own onError (HeroSlides) is left to it: it sets data-own-fallback.
 */
const TILE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">' +
      '<rect width="160" height="160" fill="#eef0f4"/>' +
      '<path d="M52 104l20-24 14 16 10-12 16 20z" fill="#c3c8d2"/><circle cx="100" cy="62" r="8" fill="#c3c8d2"/>' +
      '<text x="80" y="134" font-family="system-ui,sans-serif" font-size="12" fill="#6b7280" text-anchor="middle">Picture unavailable</text>' +
      "</svg>",
  );

export function installBrokenImageFallback(): void {
  if (typeof document === "undefined") return;
  document.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.dataset.ownFallback !== undefined || img.dataset.broken !== undefined) return;
      img.dataset.broken = img.currentSrc || img.src;
      img.removeAttribute("srcset");
      img.src = TILE;
      img.title = "This picture couldn't load";
      if (!img.alt) img.alt = "Picture unavailable";
    },
    true,
  );
}
