import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";

/**
 * Listings, videos and catalogues their seller changed after Cosora approved or rejected them
 * (buyer repo migration 20261010124955_listing_edit_rereview). The database sends an edited
 * live item back to review and keeps one open record per item: each changed field's value
 * before the first edit and now, and how many pictures were added, removed or reordered. The
 * record closes when a moderator approves or rejects the item.
 */
export type ListingEntity = "product" | "product_video" | "catalogue";

export interface ListingEdit {
  entityId: string;
  /** The item's status when the first of these edits landed: live, rejected or paused. */
  wasStatus: string;
  changes: Record<string, { from?: Json; to?: Json } | ImagesChange>;
  edits: number;
  editedAt: string;
  lastEditedAt: string;
}

interface ImagesChange {
  added?: number;
  removed?: number;
  reordered?: boolean;
}

/** The open edit for each item, by id. Empty when the migration isn't applied yet. */
export async function fetchListingEdits(entity: ListingEntity, ids: string[]): Promise<Map<string, ListingEdit>> {
  const out = new Map<string, ListingEdit>();
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase.rpc("admin_listing_edits", { p_entity: entity, p_ids: ids.slice(i, i + 500) });
    if (error) {
      if (error.code === "PGRST202") return out;
      throw new Error(error.message);
    }
    for (const r of data ?? []) {
      out.set(r.entity_id, {
        entityId: r.entity_id,
        wasStatus: r.was_status,
        changes: (r.changes ?? {}) as ListingEdit["changes"],
        edits: r.edits,
        editedAt: r.edited_at,
        lastEditedAt: r.last_edited_at,
      });
    }
  }
  return out;
}

const LABELS: Record<ListingEntity, Record<string, string>> = {
  product: {
    name: "Name", description: "Description", price_value: "Price", compare_at_price: "Compare-at price",
    currency: "Currency", moq: "MOQ", unit: "Unit", fabric: "Fabric", gsm: "GSM", fit_type: "Fit", gender: "Gender",
    colour: "Colour", sizes: "Sizes", pattern: "Pattern", occasion: "Occasion", neck_type: "Neck", sleeve_type: "Sleeve",
    collar_type: "Collar", country_of_origin: "Country of origin", waist_sizes: "Waist sizes", lengths: "Lengths",
    location: "Location", category_id: "Category", customization_available: "Customisation", attributes: "Other details",
  },
  product_video: {
    brand_line: "Caption", category: "Category", price: "Price", moq: "MOQ", thumbnail_url: "Thumbnail",
    video_url: "Video", duration_seconds: "Length", video_width: "Width", video_height: "Height", provider: "Host",
    bunny_video_id: "Video file", product_id: "Linked product",
  },
  catalogue: { title: "Title", description: "Description", cover_url: "Cover", file_url: "File", page_count: "Pages" },
};

/** Fields whose values mean nothing read out (an id, a file address): shown as changed or replaced. */
const OPAQUE = new Set(["category_id", "product_id", "thumbnail_url", "video_url", "bunny_video_id", "cover_url", "file_url"]);

function show(v: Json | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") : "—";
  if (typeof v === "object") {
    const parts = Object.entries(v).filter(([, x]) => x !== null && x !== "").map(([k, x]) => `${k}: ${Array.isArray(x) ? x.join(", ") : String(x)}`);
    return parts.length ? parts.join("; ") : "—";
  }
  const s = String(v);
  return s.length > 140 ? `${s.slice(0, 139)}…` : s;
}

export interface ChangeLine {
  field: string;
  label: string;
  /** "before → after", or a phrase when the values themselves don't read. */
  text: string;
}

/** The record as lines a moderator can read, pictures last. */
export function describeChanges(entity: ListingEntity, changes: ListingEdit["changes"]): ChangeLine[] {
  const lines: ChangeLine[] = [];
  for (const [field, c] of Object.entries(changes)) {
    if (field === "images") continue;
    const { from, to } = c as { from?: Json; to?: Json };
    const label = LABELS[entity][field] ?? field.replace(/_/g, " ");
    const text = OPAQUE.has(field)
      ? from == null ? "added" : to == null ? "removed" : field === "category_id" || field === "product_id" ? "changed" : "replaced"
      : `${show(from)} → ${show(to)}`;
    lines.push({ field, label, text });
  }
  const img = changes.images as ImagesChange | undefined;
  if (img && (img.added || img.removed || img.reordered)) {
    const bits = [
      img.added ? `${img.added} added` : "",
      img.removed ? `${img.removed} removed` : "",
      img.reordered ? "order changed" : "",
    ].filter(Boolean);
    lines.push({ field: "images", label: "Pictures", text: bits.join(", ") });
  }
  return lines;
}

export const WAS_STATUS_TEXT: Record<string, string> = {
  live: "after it was approved",
  rejected: "after it was rejected",
  paused: "while paused by the plan limit (it had been approved)",
};
