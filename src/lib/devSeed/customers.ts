import { createDevStore, daysAgo, devSeed } from "./store";

/**
 * C5 - CUSTOMER SEGMENTATION. DEV-SEED ONLY.
 *
 * DISTINCT FROM THE `accounts` SECTION, and the distinction is the whole reason
 * this exists. `accounts` answers one question about one person: is this
 * account suspended, and what is its suspension history. It is search-first and
 * deliberately has no roster, because `profiles_select` is `true` and paging the
 * whole user table serves no operational purpose there.
 *
 * This screen is the other question: who are our customers as a population, and
 * which ones are worth a call. That needs a spend figure, an activity figure and
 * a tag, none of which exist:
 *
 *   - There is no customer tag anywhere in the schema.
 *   - `profiles` has no last-active timestamp.
 *   - Spend per account would have to be assembled from
 *     `subscription_invoices` (rupees) and `ad_orders` (paise) with no shared
 *     key beyond the vendor id, and would be blank for every buyer, since
 *     buyers do not pay Cosora anything today.
 *
 * Phase 2, roughly:
 *   customer_tags(id, label, colour)
 *   profile_tags(profile_id, tag_id, applied_by, applied_at)
 *   a materialised customer_summary view over the two money tables plus
 *   conversations and rfqs, refreshed on a schedule.
 *
 * Until then the rows below are a fixture and the screen says so. It is
 * READ-ONLY by design in this pass (roles.ts sets SECTION_WRITE.customers to
 * an empty list): the UI searches, segments and summarises, and tag editing is
 * a Phase-2 feature that needs a table to write to before it needs a gate.
 */

export type CustomerKind = "buyer" | "vendor";

export type Segment =
  | "new"
  | "active"
  | "high_value"
  | "at_risk"
  | "dormant"
  | "never_transacted";

export const SEGMENT_LABELS: Record<Segment, string> = {
  new: "New this month",
  active: "Active",
  high_value: "High value",
  at_risk: "At risk",
  dormant: "Dormant",
  never_transacted: "Never transacted",
};

/**
 * What each segment MEANS, spelled out. A segment filter whose rule is not
 * written down anywhere becomes folklore within a month, and two people
 * disagree about what "at risk" covers in the same meeting.
 */
export const SEGMENT_RULES: Record<Segment, string> = {
  new: "First signed in within the last 30 days.",
  active: "Sent a message, posted an RFQ or quoted within the last 30 days.",
  high_value: "Lifetime spend of ₹25,000 or more.",
  at_risk: "Was active before, but nothing in the last 60 to 120 days.",
  dormant: "Nothing at all for more than 120 days.",
  never_transacted: "Has an account and has never paid Cosora anything.",
};

export interface Customer {
  id: string;
  name: string;
  email: string;
  city: string;
  kind: CustomerKind;
  segments: Segment[];
  tags: string[];
  joinedAt: string;
  lastActiveAt: string;
  /** Rupees, lifetime. Zero for every buyer, which is true and worth seeing. */
  lifetimeSpend: number;
  /** Conversations, RFQs and quotes together, as one activity count. */
  interactions: number;
}

const SEED: Customer[] = [
  {
    id: "cust-seed-01",
    name: "Selvam Knit Mills",
    email: "selvakumar@selvamknits.in",
    city: "Tiruppur",
    kind: "vendor",
    segments: ["active", "high_value"],
    tags: ["knitwear", "export-ready", "gold-plan"],
    joinedAt: daysAgo(412),
    lastActiveAt: daysAgo(1),
    lifetimeSpend: 68_400,
    interactions: 214,
  },
  {
    id: "cust-seed-02",
    name: "Ira Sourcing Partners",
    email: "ira@irasourcing.co.in",
    city: "Bengaluru",
    kind: "buyer",
    segments: ["active", "never_transacted"],
    tags: ["private-label", "womenswear"],
    joinedAt: daysAgo(188),
    lastActiveAt: daysAgo(2),
    lifetimeSpend: 0,
    interactions: 96,
  },
  {
    id: "cust-seed-03",
    name: "Bhilwara Suitings Co",
    email: "mahesh@bhilwarasuitings.com",
    city: "Bhilwara",
    kind: "vendor",
    segments: ["active", "high_value"],
    tags: ["suiting", "mill", "gold-plan"],
    joinedAt: daysAgo(603),
    lastActiveAt: daysAgo(3),
    lifetimeSpend: 91_250,
    interactions: 341,
  },
  {
    id: "cust-seed-04",
    name: "Harkirat Hosiery",
    email: "harkirat@hosierysethi.in",
    city: "Ludhiana",
    kind: "vendor",
    segments: ["at_risk"],
    tags: ["hosiery", "silver-plan"],
    joinedAt: daysAgo(297),
    lastActiveAt: daysAgo(74),
    lifetimeSpend: 12_990,
    interactions: 58,
  },
  {
    id: "cust-seed-05",
    name: "Meher Retail Group",
    email: "procurement@meherretail.in",
    city: "Mumbai",
    kind: "buyer",
    segments: ["active", "never_transacted"],
    tags: ["multi-brand", "large-volume"],
    joinedAt: daysAgo(521),
    lastActiveAt: daysAgo(1),
    lifetimeSpend: 0,
    interactions: 402,
  },
  {
    id: "cust-seed-06",
    name: "Anagha Prints",
    email: "anagha@anaghaprints.in",
    city: "Bagru",
    kind: "vendor",
    segments: ["new", "active"],
    tags: ["block-print", "artisan"],
    joinedAt: daysAgo(19),
    lastActiveAt: daysAgo(1),
    lifetimeSpend: 1_697,
    interactions: 24,
  },
  {
    id: "cust-seed-07",
    name: "Trilok Fibres",
    email: "trilok@trilokfibres.com",
    city: "Bhiwandi",
    kind: "vendor",
    segments: ["dormant"],
    tags: ["synthetics", "basic-plan"],
    joinedAt: daysAgo(688),
    lastActiveAt: daysAgo(167),
    lifetimeSpend: 3_897,
    interactions: 31,
  },
  {
    id: "cust-seed-08",
    name: "Kabir Apparel Studio",
    email: "kabir@kabirapparel.in",
    city: "New Delhi",
    kind: "buyer",
    segments: ["at_risk", "never_transacted"],
    tags: ["menswear", "small-batch"],
    joinedAt: daysAgo(244),
    lastActiveAt: daysAgo(88),
    lifetimeSpend: 0,
    interactions: 41,
  },
  {
    id: "cust-seed-09",
    name: "Gomti Silk House",
    email: "imtiaz@gomtisilk.in",
    city: "Varanasi",
    kind: "vendor",
    segments: ["active"],
    tags: ["silk", "handloom", "silver-plan"],
    joinedAt: daysAgo(355),
    lastActiveAt: daysAgo(4),
    lifetimeSpend: 17_680,
    interactions: 129,
  },
  {
    id: "cust-seed-10",
    name: "Devanshi Fabrics",
    email: "devanshi@devanshifabrics.in",
    city: "Surat",
    kind: "vendor",
    segments: ["active", "high_value"],
    tags: ["synthetics", "wholesale", "gold-plan"],
    joinedAt: daysAgo(470),
    lastActiveAt: daysAgo(1),
    lifetimeSpend: 44_310,
    interactions: 276,
  },
  {
    id: "cust-seed-11",
    name: "Nirvi Design House",
    email: "studio@nirvidesign.in",
    city: "Ahmedabad",
    kind: "buyer",
    segments: ["new", "never_transacted"],
    tags: ["designer", "sampling"],
    joinedAt: daysAgo(11),
    lastActiveAt: daysAgo(2),
    lifetimeSpend: 0,
    interactions: 9,
  },
  {
    id: "cust-seed-12",
    name: "Panipat Home Textiles",
    email: "neeraj@panipathome.in",
    city: "Panipat",
    kind: "vendor",
    segments: ["active"],
    tags: ["home-textiles", "silver-plan"],
    joinedAt: daysAgo(398),
    lastActiveAt: daysAgo(6),
    lifetimeSpend: 23_150,
    interactions: 167,
  },
  {
    id: "cust-seed-13",
    name: "Aarohi Buying House",
    email: "aarohi@aarohibuying.com",
    city: "Chennai",
    kind: "buyer",
    segments: ["dormant", "never_transacted"],
    tags: ["buying-house", "export"],
    joinedAt: daysAgo(742),
    lastActiveAt: daysAgo(203),
    lifetimeSpend: 0,
    interactions: 73,
  },
  {
    id: "cust-seed-14",
    name: "Kaveri Yarns",
    email: "kavitha@kaveriyarns.in",
    city: "Coimbatore",
    kind: "vendor",
    segments: ["at_risk"],
    tags: ["yarn", "basic-plan"],
    joinedAt: daysAgo(312),
    lastActiveAt: daysAgo(66),
    lifetimeSpend: 6_890,
    interactions: 44,
  },
  {
    id: "cust-seed-15",
    name: "Sarvottam Denim",
    email: "hitesh@sarvottamdenim.com",
    city: "Ahmedabad",
    kind: "vendor",
    segments: ["active", "high_value"],
    tags: ["denim", "mill", "gold-plan"],
    joinedAt: daysAgo(559),
    lastActiveAt: daysAgo(2),
    lifetimeSpend: 57_930,
    interactions: 298,
  },
];

export const customerStore = createDevStore<Customer>(devSeed(SEED));

/** Every tag in use, sorted, for the filter row. */
export function allTags(rows: Customer[]): string[] {
  return [...new Set(rows.flatMap((c) => c.tags))].sort();
}

export const inr = (rupees: number) => `₹${rupees.toLocaleString("en-IN")}`;
