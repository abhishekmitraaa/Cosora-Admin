import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AdminRole } from "@/lib/roles";

/**
 * Staff registration (Andy, 2026-10-01; textile-spark-net help-feature-plan.md D-10).
 *
 * A manager or super admin registers a staff member with their name, personal email
 * and phone. The `admin-staff` edge function creates the admin-panel account with a
 * generated employee ID and work email (the sign-in name) and a temporary password,
 * which goes to the personal email. The formats are interim (ToDo.md, "Settle the
 * staff work-email and employee-ID formats").
 *
 * The directory is admin.staff_members, read through admin_staff_list() (super_admin
 * and manager; the database refuses everyone else).
 */

/** A row of admin_staff_list(). */
export interface StaffRow {
  user_id: string;
  employee_id: string;
  full_name: string;
  work_email: string;
  personal_email: string;
  phone: string;
  admin_role: AdminRole | null;
  is_active: boolean;
  registered_at: string;
  registered_by_name: string | null;
  temp_password_issued_at: string | null;
  temp_password_delivery: "email" | "shown" | null;
  password_changed_at: string | null;
}

/** What `register` and `reset_password` answer. */
export interface CredentialResult {
  ok: true;
  user_id?: string;
  employee_id: string;
  work_email: string;
  admin_role?: AdminRole;
  /** "email": sent to the personal address. "shown": the email didn't go; show the password once. */
  delivery: "email" | "shown";
  sent_to: string | null;
  email_configured: boolean;
  email_problem: string | null;
  /** Present only when delivery is "shown". Never stored. */
  temporary_password: string | null;
}

export function useStaffDirectory(enabled: boolean) {
  return useQuery({
    queryKey: ["staff-directory"],
    enabled,
    queryFn: async (): Promise<StaffRow[]> => {
      const { data, error } = await supabase.rpc("admin_staff_list");
      if (error) throw new Error(error.message);
      return (data ?? []) as StaffRow[];
    },
  });
}

/**
 * Calls the edge function and surfaces its own words on a non-2xx answer (as the
 * Admins page does for admin-invite), not "Edge Function returned a non-2xx status".
 */
async function invokeStaff<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-staff", { body });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = await ctx.json();
        detail = b.detail || b.error || detail;
      } catch {
        /* keep the original message */
      }
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.detail || data.error);
  return data as T;
}

export function registerStaff(input: {
  fullName: string;
  personalEmail: string;
  phone: string;
  role: AdminRole;
}): Promise<CredentialResult> {
  return invokeStaff<CredentialResult>({
    action: "register",
    full_name: input.fullName,
    personal_email: input.personalEmail,
    phone: input.phone,
    admin_role: input.role,
  });
}

export function resetStaffPassword(userId: string): Promise<CredentialResult> {
  return invokeStaff<CredentialResult>({ action: "reset_password", user_id: userId });
}

/** The signed-in staff member replaces their temporary password. */
export async function setOwnPassword(password: string): Promise<void> {
  await invokeStaff<{ ok: true }>({ action: "set_password", password });
  // The new app_metadata (must_change_password false) arrives with a fresh token.
  const { error } = await supabase.auth.refreshSession();
  if (error) throw new Error(error.message);
}

/** True while the signed-in account still has a temporary password to replace. */
export function mustChangePassword(appMetadata: Record<string, unknown> | undefined): boolean {
  return appMetadata?.must_change_password === true;
}
