import { createDevStore, daysAgo, daysAhead, devId, devSeed } from "./store";

/**
 * C1 - SITE CONTENT. DEV-SEED ONLY. No table exists for either tab.
 *
 * Phase 2 needs two tables, roughly:
 *   site_banners(id, title, subtitle, image_url, link_url, placement, position,
 *                active, starts_at, ends_at, created_by, created_at)
 *   site_theme(singleton row: heading_font, body_font, accent, surface, ink, ...)
 *
 * Both are buyer-facing configuration, so both need an RLS policy that lets
 * anyone READ and only a super_admin WRITE. Nothing on this screen writes today.
 */

export type BannerPlacement = "home_hero" | "home_strip" | "category_top" | "vendor_dashboard";

export const PLACEMENT_LABELS: Record<BannerPlacement, string> = {
  home_hero: "Buyer home, hero",
  home_strip: "Buyer home, strip below hero",
  category_top: "Category page, top",
  vendor_dashboard: "Vendor dashboard",
};

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  /** Where the banner sends a buyer. Relative path into the main app. */
  linkUrl: string;
  /** Descriptive slot rather than a file: uploads are a Phase-2 storage concern. */
  imageLabel: string;
  placement: BannerPlacement;
  /** Manual order within a placement. Lower renders first. */
  position: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

/**
 * A plausible set of Cosora banners, written as a marketplace ops person would
 * write them: real placements, real-sounding campaigns, no lorem ipsum and no
 * invented metrics. These are fixtures, and the screen says so.
 */
const SEED: Banner[] = [
  {
    id: "banner-seed-1",
    title: "Monsoon sourcing week",
    subtitle: "Rate cards from 40 mills, open until the end of the month.",
    linkUrl: "/categories/fabrics",
    imageLabel: "monsoon-week-1600x600.jpg",
    placement: "home_hero",
    position: 1,
    active: true,
    startsAt: daysAgo(6),
    endsAt: daysAhead(9),
  },
  {
    id: "banner-seed-2",
    title: "Verified mills in Tiruppur",
    subtitle: "Knitwear suppliers who have cleared document checks.",
    linkUrl: "/vendors?city=tiruppur&verified=1",
    imageLabel: "tiruppur-knitwear-1600x600.jpg",
    placement: "home_hero",
    position: 2,
    active: true,
    startsAt: null,
    endsAt: null,
  },
  {
    id: "banner-seed-3",
    title: "Post a requirement in under a minute",
    subtitle: "Quick RFQ takes an image and a quantity.",
    linkUrl: "/requirement/new",
    imageLabel: "quick-rfq-strip-1200x300.jpg",
    placement: "home_strip",
    position: 1,
    active: true,
    startsAt: null,
    endsAt: null,
  },
  {
    id: "banner-seed-4",
    title: "Republic Day trade fair",
    subtitle: "Exhibitor list and floor plan for the Surat pavilion.",
    linkUrl: "/events/surat-trade-fair",
    imageLabel: "surat-fair-1600x600.jpg",
    placement: "home_hero",
    position: 3,
    active: false,
    startsAt: daysAgo(120),
    endsAt: daysAgo(96),
  },
  {
    id: "banner-seed-5",
    title: "Complete your profile score",
    subtitle: "Vendors above 80% appear higher in buyer search.",
    linkUrl: "/dashboard/profile",
    imageLabel: "profile-score-1200x300.jpg",
    placement: "vendor_dashboard",
    position: 1,
    active: true,
    startsAt: null,
    endsAt: null,
  },
];

export const bannerStore = createDevStore<Banner>(devSeed(SEED));

export function addBanner(input: Omit<Banner, "id">) {
  bannerStore.update((rows) => [...rows, { ...input, id: devId("banner") }]);
}

export function editBanner(id: string, patch: Partial<Banner>) {
  bannerStore.update((rows) => rows.map((b) => (b.id === id ? { ...b, ...patch } : b)));
}

/**
 * Reorder within a placement.
 *
 * Positions are renumbered densely from 1 after every move, so a list can never
 * end up with two banners claiming position 2 - which is the state that makes
 * "why is this one on top?" unanswerable once real rows exist.
 */
export function moveBanner(id: string, direction: -1 | 1) {
  bannerStore.update((rows) => {
    const target = rows.find((b) => b.id === id);
    if (!target) return rows;
    const group = rows
      .filter((b) => b.placement === target.placement)
      .sort((a, b) => a.position - b.position);
    const index = group.findIndex((b) => b.id === id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= group.length) return rows;

    const reordered = [...group];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    const positions = new Map(reordered.map((b, i) => [b.id, i + 1]));
    return rows.map((b) => (positions.has(b.id) ? { ...b, position: positions.get(b.id)! } : b));
  });
}

/* ------------------------------------------------------------------ *
 * Theme tab
 * ------------------------------------------------------------------ */

/**
 * A CURATED font list, not a text box and not an upload.
 *
 * Free text would let someone save a font that does not exist and take the
 * buyer-facing site's typography down; an upload adds a storage bucket, a
 * licensing question and a webfont pipeline. Both are out of scope for a
 * configuration screen. These are the Google Fonts families that suit an Indian
 * B2B marketplace: each has a full weight range and Latin plus Devanagari
 * coverage where noted, which matters for a platform whose vendors write in
 * more than one script.
 */
export interface FontOption {
  family: string;
  note: string;
  devanagari: boolean;
}

export const HEADING_FONTS: FontOption[] = [
  { family: "Bricolage Grotesque", note: "Current admin display face", devanagari: false },
  { family: "Instrument Sans", note: "Neutral geometric, wide weight range", devanagari: false },
  { family: "Outfit", note: "Rounded geometric, friendly", devanagari: false },
  { family: "Sora", note: "Technical, squarish counters", devanagari: false },
  { family: "Poppins", note: "Widely used in Indian consumer products", devanagari: true },
  { family: "Mukta", note: "Designed for Devanagari and Latin together", devanagari: true },
];

export const BODY_FONTS: FontOption[] = [
  { family: "IBM Plex Sans", note: "Current admin body face", devanagari: true },
  { family: "Inter", note: "Neutral, high legibility at small sizes", devanagari: false },
  { family: "Source Sans 3", note: "Long-form reading, open apertures", devanagari: false },
  { family: "Noto Sans", note: "Broadest script coverage of any option here", devanagari: true },
  { family: "Mukta", note: "Matches the Devanagari heading option", devanagari: true },
  { family: "Work Sans", note: "Slightly warmer than Inter at body sizes", devanagari: false },
];

/**
 * The buyer-facing token set, mirroring the five colours documented in
 * textile-spark-net's project memory. Named after their JOB, not their hue, so
 * a rebrand does not leave a token called "blue" holding a green.
 */
export interface ThemeTokens {
  headingFont: string;
  bodyFont: string;
  vendorAccent: string;
  buyerAccent: string;
  success: string;
  border: string;
  ink: string;
}

/** The values textile-spark-net actually ships today. Not a proposal. */
export const CURRENT_THEME: ThemeTokens = {
  headingFont: "Bricolage Grotesque",
  bodyFont: "IBM Plex Sans",
  vendorAccent: "#256fef",
  buyerAccent: "#EF4D62",
  success: "#14ae5c",
  border: "#d0d4dc",
  ink: "#363636",
};

export const TOKEN_LABELS: Record<keyof Omit<ThemeTokens, "headingFont" | "bodyFont">, string> = {
  vendorAccent: "Vendor primary",
  buyerAccent: "Buyer primary",
  success: "Success and verified",
  border: "Borders and placeholders",
  ink: "Body text and headings",
};

export const TOKEN_USAGE: Record<keyof Omit<ThemeTokens, "headingFont" | "bodyFont">, string> = {
  vendorAccent: "Vendor CTAs, links and blue states",
  buyerAccent: "Buyer CTAs, alerts, the Switch to Buyer banner",
  success: "Success, verified and accepted states",
  border: "Borders, inactive controls, placeholder text",
  ink: "Body text and headings",
};
