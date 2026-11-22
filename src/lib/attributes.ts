import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Form questions (Ranking F3, 2026-10-31): public.attribute_definitions, the category questions of the buyer
// app's listing form and requirement form. Read here in full (staff also read questions turned off); written
// only through admin_attribute_save / admin_attribute_set_active, which admit super admins and land in the
// Admin Log. Buyer repo: migration 20261031100000, lib/queries/attributeDefinitions.ts.
// ─────────────────────────────────────────────────────────────

export type AttributeForm = "product" | "requirement";

export interface AttributeRow {
  id: string;
  form: AttributeForm;
  category_id: string | null;
  subcategory_id: string | null;
  layer: "base" | "sub" | "common" | null;
  seller_type: "product" | "service" | "freelancer" | null;
  applies_to_subcategories: string[] | null;
  schema_key: string | null;
  section_title: string | null;
  section_position: number | null;
  key: string;
  label: string;
  label_hi: string | null;
  label_gu: string | null;
  kind: string;
  options: string[] | null;
  unit: string | null;
  placeholder: string | null;
  required: boolean;
  full_width: boolean;
  half: boolean;
  core: boolean;
  match_key: string | null;
  match_weight: number;
  position: number;
  active: boolean;
  updated_at: string;
}

/** The kinds an admin can give a new question; the special ones (sizes, colours, price, files) stay with the seeds. */
export const NEW_KINDS: Record<AttributeForm, { id: string; label: string }[]> = {
  product: [
    { id: "text", label: "Short text" }, { id: "number", label: "Number" }, { id: "select", label: "One choice" },
    { id: "multiselect", label: "Several choices" }, { id: "textarea", label: "Long text" }, { id: "checkbox", label: "Yes / no" },
  ],
  requirement: [
    { id: "text", label: "Short text" }, { id: "textarea", label: "Long text" }, { id: "select", label: "One choice" },
    { id: "chips", label: "Several choices" }, { id: "radio", label: "One choice (buttons)" },
  ],
};

export const CHOICE_KINDS = new Set(["select", "multiselect", "chips", "radio"]);

const PAGE = 1000;

export async function fetchAttributes(): Promise<AttributeRow[]> {
  const rows: AttributeRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("attribute_definitions").select("*").order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as AttributeRow[]));
    if ((data ?? []).length < PAGE) return rows;
  }
}

/** Saves an existing question (p_id) or adds one (p_id null). Returns the question's id. */
export async function saveAttribute(id: string | null, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc("admin_attribute_save", { p_id: id, p_row: row as never });
  if (error) throw error;
  return data as string;
}

export async function setAttributeActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc("admin_attribute_set_active", { p_id: id, p_active: active });
  if (error) throw error;
}

/** Options as an admin types them: one per line, blanks dropped, duplicates once. */
export function parseOptions(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
}

/** A save's refusal in words (AR-L07): constraint names and Postgres wording meant nothing to staff. */
export function attributeErrorText(e: unknown): string {
  const m = String((e as { message?: unknown })?.message ?? e ?? "");
  const code = String((e as { code?: unknown })?.code ?? "");
  if (code === "23505" || /duplicate key/i.test(m)) return "A question with this key already exists on this form. Choose another key.";
  if (/key_check/.test(m)) return "The key must start with a letter and use only letters, digits and _ (at most 64).";
  if (/match_key_check/.test(m)) return "The matching key must start with a letter and use only letters, digits and _.";
  if (/match_weight_check/.test(m)) return "The matching weight must be between 0 and 10.";
  if (/label(_hi|_gu)?_check/.test(m)) return "A label can be at most 200 characters.";
  if (/placeholder_check/.test(m)) return "The placeholder can be at most 200 characters.";
  if (/unit_check/.test(m)) return "The unit can be at most 40 characters.";
  if (/options_check/.test(m)) return "A question can have at most 200 options.";
  if (/_kind\b|attribute_definitions_kind/.test(m)) return "That answer type isn't available on this form.";
  if (/_place\b|attribute_definitions_place/.test(m)) return "Choose where the question goes: the seller type, category and sub-category, or the section.";
  return m || "The question wasn't saved.";
}
