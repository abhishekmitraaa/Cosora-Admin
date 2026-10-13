/**
 * What staff are told about the Admin Log (Mitra, 2026-10-11: "tell the staff").
 *
 * Shown on the sign-in page and on "Choose your password", the first screen a newly
 * registered staff member sees. It must say exactly what is recorded, no more:
 *   - sign-ins and sign-outs (admin_audit_session, Login.tsx / useAdminSession);
 *   - every insert, update and delete on the tables the panel writes (trg_admin_audit);
 *   - invites, refunds and staff registrations (admin_audit_record, from the edge functions);
 *   - phone numbers revealed in Support (admin_support_reveal_contact);
 *   - since 2026-10-13, every page of the panel an admin opens and every record they open
 *     (a vendor, a support request, a chat): admin_activity_record(), lib/activity.ts.
 *     Page visits are deleted after 180 days; record views and the Admin Log are kept.
 * Each entry carries the time and the admin's name; super_admin and manager read it
 * (admin_audit_log_list); admin.audit_log_append_only() refuses UPDATE and DELETE.
 *
 * Anything that changes what is recorded changes the wording here, in the same release.
 */
export const ACTIVITY_NOTICE =
  "Activity in this panel is recorded. Your sign-ins, the pages and records you open, and the changes you make, " +
  "including invites, refunds and revealed phone numbers, are logged with the time and your name. Super admins and " +
  "managers can read the log. No one can edit or delete a change or a sign-in; page visits are kept for 180 days.";
