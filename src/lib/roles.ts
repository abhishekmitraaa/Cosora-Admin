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
  // Account suspension, generalised. Not part of "vendors": buyers get
  // suspended too, and the role gate is different (support/super_admin via
  // set_account_status, NOT vendor_ops).
  | "accounts";

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
  accounts: ["super_admin", "support"],
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
  // set_account_status() gates itself to these two, so vendor_ops sees the page
  // (it is reachable from a vendor) but not the actions.
  accounts: ["super_admin", "support"],
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
  if (!allowed) return `${label} — this section is read-only for all roles.`;
  return `Read-only: you are signed in as ${label}. Changes here require ${allowed}, and the database will reject them otherwise.`;
}
