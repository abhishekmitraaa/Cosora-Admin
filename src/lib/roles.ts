import type { Database } from "./database.types";

export type AdminRole = Database["public"]["Enums"]["admin_role_type"];

export const ALL_ROLES: AdminRole[] = [
  "super_admin",
  "product_moderator",
  "vendor_ops",
  "ads_moderator",
  "finance_admin",
  "support",
];

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super admin",
  product_moderator: "Product moderator",
  vendor_ops: "Vendor ops",
  ads_moderator: "Ads moderator",
  finance_admin: "Finance admin",
  support: "Support (read-only)",
};

export type Section =
  | "products"
  // Video Closeups. Moderated by the same two roles as `products`, and enforced
  // the same way — `trg_product_videos_moderation` mirrors
  // `enforce_products_moderation` clause for clause. A sibling of "products",
  // deliberately not a sub-tab of it: it is a different table with its own RLS.
  | "videos"
  | "vendors"
  | "ads"
  | "subscriptions"
  | "reports"
  | "admins"
  // Chat moderation. These are the first sections where `support` is not
  // read-only — reviewing chats IS the support role's job, so the DB grants it
  // writes here that it has nowhere else.
  | "chats"
  | "chat-review"
  | "chat-keywords"
  | "chat-patterns"
  | "chat-reasons"
  // Buyer Help / seller registration / subscription FAQs (2026-09-23). REAL
  // DATA: public.faqs, written only through admin_faq_* RPCs. The first
  // admin-editable content that is not dev-seed ("content" still is).
  | "faqs"
  // Account suspension, generalised. Not part of "vendors": buyers get
  // suspended too, and the role gate is different (support/super_admin via
  // set_account_status, NOT vendor_ops).
  | "accounts"
  // ── Added by the Phase-4 UI pass ────────────────────────────────────────
  //
  // Two kinds of new section live below, and the difference matters when
  // reading the gates:
  //
  //   REAL DATA, no schema change. `geography` aggregates vendor_profiles rows
  //   that already exist, so its gate mirrors an existing one exactly and the
  //   DB is already enforcing it. (Ads monitoring is NOT a section: it is a
  //   view inside "ads" and inherits that section's gate unchanged.)
  //
  //   DEV-SEED, no table yet. `content`, `payments`, `discounts` and
  //   `customers` render from a local development fixture and write nothing.
  //   Their gates are declared NOW so Phase 2 only has to swap the data source,
  //   but until the tables exist these are UX only in a stronger sense than the
  //   rest of this file: there is no RLS behind them because there is nothing
  //   to apply RLS to. Do not read a gate here as evidence that a write is
  //   protected.
  //
  //   `certificates` LEFT this group on 2026-09-13: certificate_orders exists,
  //   RLS is on it, and every write goes through certificate_fulfiller(), so
  //   its gate is now a mirror of a real SQL predicate like the rest.
  //
  // Aggregate view of vendor_profiles.city/state. Same roles as "vendors",
  // because it is the same rows read a different way.
  | "geography"
  // Embedding-pipeline health history. Infrastructure, not moderation: the page
  // is read-only, and the correct response to a bad status is to go and fix the
  // pipeline rather than to action anything here. Unlike the UX-only sections
  // noted above, this one IS enforced in the database —
  // admin_embedding_pipeline_health() carries its own is_admin() guard, so the
  // gate below is defence in depth rather than the only check.
  | "system-health"
  // Banners and theme configuration for the buyer-facing site.
  | "content"
  // Transaction ledger. Distinct from "reports", which keeps its KPI view.
  | "payments"
  // Physical certificate fulfilment.
  | "certificates"
  // Discount codes.
  | "discounts"
  // Buyer/vendor CRM and segmentation. Distinct from "accounts", which is
  // suspension only.
  | "customers"
  // Third-party website analytics. An external link, not a built feature.
  | "traction";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE IS UX ONLY. IT IS NOT SECURITY.
 *
 * These maps decide which nav items render and which buttons are shown/disabled.
 * They are a convenience so an admin isn't offered actions that will fail. They
 * are NOT the access control — a user who edits their JS bundle, or calls
 * PostgREST directly with their JWT, bypasses every check in this file.
 *
 * The real gate lives in textile-spark-net's migrations
 * (20260717130000 / 20260717130100) and is enforced by Postgres on every write:
 *   - RLS policies gate WHICH ADMIN may write a row at all.
 *   - BEFORE triggers gate WHICH COLUMN may change (products.status,
 *     vendor_profiles.is_verified, profiles.is_admin/admin_role/account_status,
 *     advertisements.status, and the moderation reason columns).
 *
 * Consequently, no write path in this app relies on `canWrite` succeeding first.
 * Every mutation is sent to the database and its rejection is surfaced verbatim.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Roles for which a section renders in the nav at all. */
const SECTION_READ: Record<Section, AdminRole[]> = {
  products: ["super_admin", "product_moderator", "support"],
  videos: ["super_admin", "product_moderator", "support"],
  vendors: ["super_admin", "vendor_ops", "support"],
  ads: ["super_admin", "ads_moderator", "support"],
  subscriptions: ["super_admin", "finance_admin", "support"],
  reports: ALL_ROLES,
  admins: ["super_admin"],
  chats: ["super_admin", "support"],
  "chat-review": ["super_admin", "support"],
  "chat-keywords": ["super_admin", "support"],
  "chat-patterns": ["super_admin", "support"],
  // Support READS this list — it has to, the reason picker is populated from it.
  // What support may not do is CHANGE it; that split lives in SECTION_WRITE.
  //
  // This said ["super_admin"] and the comment claimed support "may not even
  // READ" the table. chat_block_reasons_select is
  // `admin_role() in ('support','super_admin')`, so that was simply wrong, and
  // it hid the page from the role that uses its vocabulary daily.
  "chat-reasons": ["super_admin", "support"],
  // admin_faq_list() admits support + super_admin, the same audience as block
  // reasons. Support answers the questions buyers ask, so it reads what the FAQ says.
  faqs: ["super_admin", "support"],
  accounts: ["super_admin", "support"],

  // ── Phase-4 sections ───────────────────────────────────────────────────
  // Same three roles as `vendors`: this is the vendor list plotted, not a new
  // dataset, and anyone who may open Vendors can already read every city and
  // state it aggregates.
  geography: ["super_admin", "vendor_ops", "support"],
  // Must match admin_embedding_pipeline_health()'s own guard exactly — the RPC
  // raises 42501 for anyone else, so listing a role here that the DB refuses
  // would put a nav entry in front of a page that can only error. Deliberately
  // NOT support/finance/ads: a stalled embedding queue is not something those
  // roles can act on.
  "system-health": ["super_admin", "vendor_ops"],
  // Site banners and theme are brand-level configuration. Starting at
  // super_admin only; widen deliberately if a marketing role is ever added.
  content: ["super_admin"],
  // Finance reads and acts; support reads, because "did this vendor's payment
  // land" is a support question. Mirrors the subscriptions split.
  payments: ["super_admin", "finance_admin", "support"],
  // NO LONGER DEV-SEED (2026-09-13). certificate_orders exists, and this gate
  // now MIRRORS A REAL SQL PREDICATE: certificate_fulfiller() in migration
  // 20260913130000 admits super_admin and finance_admin. If these ever drift,
  // the database wins and the admin sees a 42501.
  //
  // STILL OUTSTANDING: the intended list is
  //   ["super_admin", "finance_admin", "delivery_team"]
  // and `delivery_team` does NOT exist in the admin_role_type enum, so naming
  // it here would imply a role nobody can hold. Add it here, in SECTION_WRITE,
  // and in certificate_fulfiller() in the same change that creates the enum
  // value.
  certificates: ["super_admin", "finance_admin"],
  discounts: ["super_admin", "finance_admin"],
  customers: ["super_admin", "support", "finance_admin"],
  // The hosted analytics dashboard, reached by an external link. Every role,
  // matching `reports` - this panel already shows all-time revenue to all six
  // roles, so site traffic is not a narrower secret than what is on that page.
  traction: ALL_ROLES,
};

/**
 * Roles the DB will actually let write in a section. Mirrors the SQL predicates
 * exactly — if these ever drift, the DB wins and the user sees a rejection.
 * `reports` is read-only for everyone (the flagged-items log is handled by
 * `canWriteFlags`, which every admin including support may do).
 */
const SECTION_WRITE: Record<Section, AdminRole[]> = {
  products: ["super_admin", "product_moderator"],
  videos: ["super_admin", "product_moderator"],
  vendors: ["super_admin", "vendor_ops"],
  ads: ["super_admin", "ads_moderator"],
  subscriptions: ["super_admin", "finance_admin"],
  reports: [],
  admins: ["super_admin"],
  // The chats overview is oversight only — every action lives in the queue.
  chats: [],
  "chat-review": ["super_admin", "support"],
  "chat-keywords": ["super_admin", "support"],
  "chat-patterns": ["super_admin", "support"],
  "chat-reasons": ["super_admin"],
  // admin_faq_add / update / delete / reorder admit support + super_admin, the
  // same predicate as admin_faq_list (migration 20260924170736; Mitra's answer to
  // the 2026-09-23 open question). Support answers buyers' questions, so it keeps
  // the answers current. Changing this means changing the RPC gates AND this line;
  // either alone is wrong.
  faqs: ["super_admin", "support"],
  // set_account_status() gates itself to these two, so vendor_ops sees the page
  // (it is reachable from a vendor) but not the actions.
  accounts: ["super_admin", "support"],

  // ── Phase-4 sections ───────────────────────────────────────────────────
  // An aggregate read of rows this app already lists. Nothing on the map
  // writes, for any role.
  geography: [],
  // Read-only by construction: there is no mutation on the System Health page,
  // and the log table is service_role-only with RLS on and no policies, so no
  // role can write it from a browser even if a page tried.
  "system-health": [],
  content: ["super_admin"],
  payments: ["super_admin", "finance_admin"],
  // Mirrors certificate_fulfiller() exactly. Add "delivery_team" here at the
  // same time as in SECTION_READ and in the SQL, once the enum value exists.
  certificates: ["super_admin", "finance_admin"],
  discounts: ["super_admin", "finance_admin"],
  // Read-only by design in this pass. The CRM screen searches, segments and
  // summarises; it does not edit anyone. Tag editing is a Phase-2 feature that
  // needs a table to write to before it needs a role gate.
  customers: [],
  // An external link. There is nothing here to write.
  traction: [],
};

/** `role` is nullable: an is_admin user with no role yet fails closed everywhere. */
export function canSee(role: AdminRole | null, section: Section): boolean {
  return role !== null && SECTION_READ[section].includes(role);
}

export function canWrite(role: AdminRole | null, section: Section): boolean {
  return role !== null && SECTION_WRITE[section].includes(role);
}

/** The flagged-items log is the one table support may write (admin_flags_insert). */
export function canWriteFlags(role: AdminRole | null): boolean {
  return role !== null;
}

/**
 * Suspending / reinstating a buyer or vendor ACCOUNT (profiles.account_status).
 *
 * Not a section — it appears inside pages whose own section has a different
 * gate. VendorDetail is the case that matters: `vendor_ops` may write that page
 * (verification, the legacy vendor_profiles flag) but may NOT touch the account
 * status, because set_account_status() is gated to support/super_admin inside
 * the function. This mirrors that predicate; the RPC is what enforces it.
 */
export function canSuspendAccounts(role: AdminRole | null): boolean {
  return role === "super_admin" || role === "support";
}

/** Why a section is visible but its actions are not — shown in the read-only banner. */
export function readOnlyReason(role: AdminRole | null, section: Section): string {
  const label = role ? ROLE_LABELS[role] : "No role assigned";
  const allowed = SECTION_WRITE[section].map((r) => ROLE_LABELS[r]).join(" or ");
  if (!allowed) return `${label}. This section is read-only for every role.`;
  return `Read-only: you are signed in as ${label}. Changes here require ${allowed}, and the database will reject them otherwise.`;
}
