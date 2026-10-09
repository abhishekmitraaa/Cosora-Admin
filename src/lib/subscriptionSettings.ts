import { useQuery } from "@tanstack/react-query";
import { describeWriteError, supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions P0 (2026-10-08): feature switches and Cosora's billing details.
//
// Both live in the database behind their own RPCs, which decide who may read and
// write (textile-spark-net migration 20261008100000_subscriptions_p0_foundations):
//   * admin_feature_flags()       super_admin, manager read
//     admin_feature_flag_set()    super_admin only, with a reason (Admin Log)
//   * admin_billing_entity()      super_admin, finance_admin
//     admin_billing_entity_save() super_admin, finance_admin, with a reason
// roles.ts only decides what renders.
// ─────────────────────────────────────────────────────────────────────────────

export interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  allowProfileIds: string[];
  allowNames: string[];
  updatedAt: string;
  updatedByName: string | null;
}

/** What each switch is called on screen. A key missing here shows as itself. */
export const FEATURE_FLAG_LABELS: Record<string, string> = {
  subscription_checkout: "Plan checkout",
  notification_delivery: "Email, WhatsApp and SMS delivery",
  subscription_autopay: "Autopay",
  subscription_lifecycle: "Reminders, grace days and paused listings",
  ad_state_targeting: "Ad reach by state",
};

export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: async (): Promise<FeatureFlag[]> => {
      const { data, error } = await supabase.rpc("admin_feature_flags");
      if (error) throw new Error(describeWriteError(error));
      return (data ?? []).map((f) => ({
        key: f.key, description: f.description, enabled: f.enabled,
        allowProfileIds: f.allow_profile_ids ?? [], allowNames: f.allow_names ?? [],
        updatedAt: f.updated_at, updatedByName: f.updated_by_name,
      }));
    },
  });
}

export async function saveFeatureFlag(key: string, enabled: boolean, allowProfileIds: string[], reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_feature_flag_set", {
    p_key: key, p_enabled: enabled, p_allow_profile_ids: allowProfileIds, p_reason: reason,
  });
  if (error) throw new Error(describeWriteError(error));
}

// ── Billing details ─────────────────────────────────────────────────────────────

export interface BillingEntity {
  legal_name: string;
  trade_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state_code: string;
  postal_code: string;
  gstin: string;
  pan: string;
  sac_code: string;
  invoice_prefix: string;
  email: string;
  phone: string;
}

export const EMPTY_BILLING_ENTITY: BillingEntity = {
  legal_name: "", trade_name: "", address_line1: "", address_line2: "", city: "", state_code: "",
  postal_code: "", gstin: "", pan: "", sac_code: "", invoice_prefix: "INV", email: "", phone: "",
};

export interface StoredBillingEntity extends BillingEntity {
  updated_at: string;
  updated_by_name: string | null;
}

export function useBillingEntity() {
  return useQuery({
    queryKey: ["billing-entity"],
    queryFn: async (): Promise<StoredBillingEntity | null> => {
      const { data, error } = await supabase.rpc("admin_billing_entity");
      if (error) throw new Error(describeWriteError(error));
      if (!data) return null;
      const r = data as Record<string, unknown>;
      const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
      return {
        legal_name: s("legal_name"), trade_name: s("trade_name"), address_line1: s("address_line1"),
        address_line2: s("address_line2"), city: s("city"), state_code: s("state_code"), postal_code: s("postal_code"),
        gstin: s("gstin"), pan: s("pan"), sac_code: s("sac_code"), invoice_prefix: s("invoice_prefix") || "INV",
        email: s("email"), phone: s("phone"), updated_at: s("updated_at"),
        updated_by_name: typeof r.updated_by_name === "string" ? r.updated_by_name : null,
      };
    },
  });
}

export async function saveBillingEntity(entity: BillingEntity, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_billing_entity_save", {
    p: entity as unknown as Record<string, string>, p_reason: reason,
  });
  if (error) {
    if (error.code === "23514") throw new Error(`The database refused these details: ${error.message}`);
    throw new Error(describeWriteError(error));
  }
}

export interface IndiaState { code: string; name: string; gst_code: string }

export function useIndiaStates() {
  return useQuery({
    queryKey: ["india-states"],
    staleTime: Infinity,
    queryFn: async (): Promise<IndiaState[]> => {
      const { data, error } = await supabase.from("india_states").select("code, name, gst_code").order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

// ── GSTIN and PAN (mirrors public.gstin_is_valid and textile-spark-net src/lib/taxIds.ts) ──
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function isValidGstin(value: string): boolean {
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value)) return false;
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const p = GSTIN_CHARS.indexOf(value[i]) * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (total % 36)) % 36] === value[14];
}

export function isValidPan(value: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value);
}

/** What's wrong with these details before the database is asked, field by field. */
export function billingEntityProblems(e: BillingEntity, states: IndiaState[]): Partial<Record<keyof BillingEntity, string>> {
  const p: Partial<Record<keyof BillingEntity, string>> = {};
  if (e.legal_name.trim().length < 2) p.legal_name = "Enter the legal name as on the GST registration.";
  if (e.address_line1.trim().length < 3) p.address_line1 = "Enter the registered address.";
  if (e.city.trim().length < 2) p.city = "Enter the city.";
  if (!e.state_code) p.state_code = "Choose the state.";
  if (!/^[1-9][0-9]{5}$/.test(e.postal_code.trim())) p.postal_code = "Enter a 6-digit PIN code.";
  const gstin = e.gstin.trim().toUpperCase();
  const pan = e.pan.trim().toUpperCase();
  if (!isValidGstin(gstin)) p.gstin = "Enter a valid GSTIN (15 characters; the last one is a check character).";
  else {
    const state = states.find((s) => s.code === e.state_code);
    if (state && gstin.slice(0, 2) !== state.gst_code) p.gstin = `A GSTIN registered in ${state.name} starts with ${state.gst_code}.`;
  }
  if (!isValidPan(pan)) p.pan = "Enter a valid 10-character PAN.";
  else if (isValidGstin(gstin) && gstin.slice(2, 12) !== pan) p.pan = "The PAN must match characters 3 to 12 of the GSTIN.";
  if (e.sac_code.trim() && !/^[0-9]{6}$/.test(e.sac_code.trim())) p.sac_code = "A SAC code is 6 digits.";
  if (!/^[A-Z]{2,4}$/.test(e.invoice_prefix.trim().toUpperCase())) p.invoice_prefix = "2 to 4 letters.";
  if (e.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email.trim())) p.email = "Enter a valid email address.";
  if (e.phone.trim() && !/^\+?[0-9 ]{8,16}$/.test(e.phone.trim())) p.phone = "Enter a valid phone number.";
  return p;
}
