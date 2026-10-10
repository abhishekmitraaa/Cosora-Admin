/**
 * What staff are told about the Admin Log (Mitra, 2026-10-11: "tell the staff").
 *
 * Shown on the sign-in page and on "Choose your password", the first screen a newly
 * registered staff member sees. It must say exactly what is recorded, no more:
 *   - sign-ins and sign-outs (admin_audit_session, Login.tsx / useAdminSession);
 *   - every insert, update and delete on the tables the panel writes (trg_admin_audit);
 *   - invites, refunds and staff registrations (admin_audit_record, from the edge functions);
 *   - phone numbers revealed in Support (admin_support_reveal_contact).
 * Each entry carries the time and the admin's name; super_admin and manager read it
 * (admin_audit_log_list); admin.audit_log_append_only() refuses UPDATE and DELETE.
 *
 * Pages visited and records opened are NOT recorded yet. When that tracking ships,
 * change the wording here, in the same release, and not before.
 */
export const ACTIVITY_NOTICE =
  "Activity in this panel is recorded. Your sign-ins and the changes you make, including invites, refunds and " +
  "revealed phone numbers, go into the Admin Log with the time and your name. Super admins and managers can read " +
  "it, and no one can edit or delete an entry.";
