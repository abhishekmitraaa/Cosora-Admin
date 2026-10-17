import { supabase } from "@/lib/supabase";

/**
 * EVERYTHING A VENDOR ENTERED FOR A LISTING (2026-10-17). Mitra: "the admin, while approving a product, should be
 * able to see all the details the vendor provided". The Products queue showed name, price, MOQ, fabric, GSM, one
 * colour and three pictures; the upload form asks for far more (textile-spark-net src/pages/Upload.tsx):
 * description, unit, sizes, waist sizes and lengths, fit, gender, pattern, occasion, neck / sleeve / collar,
 * country of origin, location, customization, and every other answer of its category in `attributes`, plus all
 * pictures, videos (Video Closeups tagged to the listing) and PDFs (product_documents, bucket product-files).
 *
 * Read with the admin's session: RLS lets an admin read any listing, its pictures, videos and PDFs.
 */

export interface ProductDetails {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  unit: string | null;
  moq: string | null;
  category: string | null;
  parentCategory: string | null;
  /** Label / value pairs for every column the form writes, in the form's order; empty ones left out. */
  fields: { label: string; value: string }[];
  /** Every other answer of the category, labelled. */
  answers: { label: string; value: string }[];
  images: string[];
  videos: { id: string; status: string; url: string | null; poster: string | null; durationSeconds: number | null }[];
  documents: { id: string; name: string; sizeBytes: number | null; url: string }[];
}

/** Field ids from the vendor form whose label isn't just the id spaced out. */
const LABELS: Record<string, string> = {
  sku: "SKU / reference",
  subType: "Sub-type",
  colours: "All colours",
  leadTime: "Lead time",
  productCertifications: "Certifications",
  certification: "Certifications",
  gsm: "GSM",
  washCare: "Wash care",
  denimWeight: "Denim weight (oz)",
  threadCount: "Thread count",
  braType: "Bra type",
  braClosure: "Closure",
  sareeLength: "Saree length",
  packOf: "Pack of",
  heelHeight: "Heel height",
  hsn: "HSN code",
  samplePolicy: "Sample policy",
  minOrder: "Minimum order",
};

export function fieldLabel(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const words = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A link a vendor wrote is shown only if it is plain http(s). product_images.url and product_videos.video_url
 * are vendor-written text: a "javascript:" URL in an <a href> here would run in an admin's session.
 */
export function safeHttpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function show(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v.length ? v.map(String).join(", ") : null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export async function fetchProductDetails(id: string): Promise<ProductDetails> {
  const [p, imgs, vids, docs] = await Promise.all([
    supabase
      .from("products")
      .select(
        `id, name, description, price_value, currency, unit, moq, fabric, gsm, fit_type, gender, colour, sizes,
         waist_sizes, lengths, pattern, occasion, neck_type, sleeve_type, collar_type, country_of_origin, location,
         customization_available, attributes, category:categories(name, parent_id)`,
      )
      .eq("id", id)
      .single(),
    supabase.from("product_images").select("url, position").eq("product_id", id).order("position"),
    supabase
      .from("product_videos")
      .select("id, status, video_url, thumbnail_url, duration_seconds")
      .eq("product_id", id)
      .order("created_at"),
    supabase.from("product_documents").select("id, name, size_bytes, path").eq("product_id", id).order("position"),
  ]);
  if (p.error) throw new Error(p.error.message);
  for (const r of [imgs, vids, docs]) if (r.error) throw new Error(r.error.message);
  const row = p.data as unknown as Record<string, unknown> & { category: { name: string; parent_id: string | null } | null };

  let parentCategory: string | null = null;
  if (row.category?.parent_id) {
    const { data } = await supabase.from("categories").select("name").eq("id", row.category.parent_id).maybeSingle();
    parentCategory = data?.name ?? null;
  }

  const fields = (
    [
      ["Fabric", row.fabric],
      ["GSM", row.gsm],
      ["Colour", row.colour],
      ["Sizes", row.sizes],
      ["Waist sizes", row.waist_sizes],
      ["Lengths", row.lengths],
      ["Fit", row.fit_type],
      ["Gender", row.gender],
      ["Pattern", row.pattern],
      ["Occasion", row.occasion],
      ["Neck type", row.neck_type],
      ["Sleeve type", row.sleeve_type],
      ["Collar type", row.collar_type],
      ["Country of origin", row.country_of_origin],
      ["Location / origin", row.location],
      ["Customization available", row.customization_available],
    ] as [string, unknown][]
  )
    .map(([label, v]) => ({ label, value: show(v) }))
    .filter((f): f is { label: string; value: string } => f.value !== null);

  const attrs = (row.attributes ?? {}) as Record<string, unknown>;
  const answers = Object.keys(attrs)
    .sort((a, b) => fieldLabel(a).localeCompare(fieldLabel(b)))
    .map((k) => ({ label: fieldLabel(k), value: show(attrs[k]) }))
    .filter((f): f is { label: string; value: string } => f.value !== null);

  const price =
    row.price_value != null ? `${(row.currency as string) ?? "₹"}${row.price_value}${row.unit ? ` / ${row.unit}` : ""}` : null;

  return {
    id,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    price,
    unit: (row.unit as string | null) ?? null,
    moq: (row.moq as string | null) ?? null,
    category: row.category?.name ?? null,
    parentCategory,
    fields,
    answers,
    images: (imgs.data ?? []).map((i) => safeHttpUrl(i.url)).filter((u): u is string => u !== null),
    videos: (vids.data ?? []).map((v) => ({
      id: v.id,
      status: v.status as string,
      url: safeHttpUrl(v.video_url),
      poster: safeHttpUrl(v.thumbnail_url),
      durationSeconds: v.duration_seconds,
    })),
    documents: (docs.data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      sizeBytes: d.size_bytes,
      url: supabase.storage.from("product-files").getPublicUrl(d.path).data.publicUrl,
    })),
  };
}
