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

export type Section = "products" | "vendors" | "ads" | "subscriptions" | "reports" | "admins";

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
 *     vendor_profiles.is_verified/account_status, profiles.is_admin/admin_role,
 *     advertisements.status, and the moderation reason columns).
 *
 * Consequently, no write path in this app relies on `canWrite` succeeding first.
 * Every mutation is sent to the database and its rejection is surfaced verbatim.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Roles for which a section renders in the nav at all. */
const SECTION_READ: Record<Section, AdminRole[]> = {
  products: ["super_admin", "product_moderator", "support"],
  vendors: ["super_admin", "vendor_ops", "support"],
  ads: ["super_admin", "ads_moderator", "support"],
  subscriptions: ["super_admin", "finance_admin", "support"],
  reports: ALL_ROLES,
  admins: ["super_admin"],
};

/**
 * Roles the DB will actually let write in a section. Mirrors the SQL predicates
 * exactly — if these ever drift, the DB wins and the user sees a rejection.
 * `reports` is read-only for everyone (the flagged-items log is handled by
 * `canWriteFlags`, which every admin including support may do).
 */
const SECTION_WRITE: Record<Section, AdminRole[]> = {
  products: ["super_admin", "product_moderator"],
  vendors: ["super_admin", "vendor_ops"],
  ads: ["super_admin", "ads_moderator"],
  subscriptions: ["super_admin", "finance_admin"],
  reports: [],
  admins: ["super_admin"],
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

/** Why a section is visible but its actions are not — shown in the read-only banner. */
export function readOnlyReason(role: AdminRole | null, section: Section): string {
  const label = role ? ROLE_LABELS[role] : "No role assigned";
  const allowed = SECTION_WRITE[section].map((r) => ROLE_LABELS[r]).join(" or ");
  if (!allowed) return `${label} — this section is read-only for all roles.`;
  return `Read-only: you are signed in as ${label}. Changes here require ${allowed}, and the database will reject them otherwise.`;
}
