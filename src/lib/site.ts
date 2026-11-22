/** The public site, for "view on site" links (review AR-L06). */
export const SITE_URL = "https://www.cosora.in";
export const siteProductUrl = (id: string) => `${SITE_URL}/product/${id}`;
export const siteVendorUrl = (id: string) => `${SITE_URL}/vendor/${id}`;
export const siteVideoUrl = (id: string) => `${SITE_URL}/video-closeups?v=${id}`;
