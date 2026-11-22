import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, assertWrote } from "./supabase";
import { assertJpeg } from "./jpeg";

/**
 * Data layer for the public Cosora Journal at www.cosora.in/blogs.
 *
 * Every write goes through an admin_blog_* RPC gated on
 * admin.require_content_admin(); this app holds no write grant on the blog
 * tables. Shaped after siteContent.ts, which is the current convention for a
 * feature with its own images, ordering and drafts.
 */

export const BLOG_BUCKET = "site-content";
/** The bucket itself caps at 2 MB. */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export type BlogStatus = "draft" | "published" | "scheduled";

/**
 * A publish time in the editor's datetime-local field, in India time (Cosora-Admin review 2026-11-22, AR-H04).
 * The database answers in UTC; the field used to show that UTC clock as if it were local and save it back as local,
 * so every save moved the article 5 h 30 min earlier. Both directions are pinned to IST, whatever the browser's zone.
 */
export function istInputFromIso(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** The datetime-local value, read as India time, as an ISO instant; null when empty or unreadable. */
export function isoFromIstInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value.length === 16 ? `${value}:00` : value}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type BlogBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "rich_text"; html: string }
  | { type: "list"; style: "bullet" | "number"; items: string[] }
  | { type: "image"; path: string; alt: string; caption?: string | null }
  | { type: "table"; caption?: string | null; columns: string[]; rows: string[][] }
  | { type: "faq"; items: { q: string; a: string }[] }
  | { type: "quote"; text: string; attribution?: string | null }
  | { type: "cta"; heading?: string | null; body?: string | null; label: string; href: string }
  | { type: "divider" };

export type BlogPostRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: BlogStatus;
  is_featured: boolean;
  sort_order: number;
  published_at: string | null;
  category_id: string | null;
  category_name: string | null;
  thumbnail: string | null;
  hero_image: string | null;
  noindex: boolean;
  has_blocks: boolean;
  tags: string[] | null;
  updated_at: string;
};

export type BlogPostFull = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  blocks: BlogBlock[] | null;
  hero_image: string | null;
  hero_image_alt: string | null;
  thumbnail: string | null;
  thumbnail_alt: string | null;
  author_id: string | null;
  category_id: string | null;
  is_featured: boolean;
  sort_order: number;
  status: BlogStatus;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_image: string | null;
  read_time: string | null;
  tags: string[] | null;
  canonical_url: string | null;
  noindex: boolean;
  created_at: string;
  updated_at: string;
};

export type BlogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  sort_order: number;
  posts: number;
};

/**
 * A byline: one of the named people, or Cosora itself. Rows are seeded by
 * migration (textile-spark-net 20260929221659_blog_authors) and this app only
 * reads them, to fill the post editor's Author dropdown.
 */
export type BlogAuthor = {
  id: string;
  slug: string;
  name: string;
  entity_type: "person" | "organization";
  role: string | null;
};

export type BlogSettings = {
  hero_enabled: boolean;
  hero_image: string | null;
  hero_image_alt: string | null;
  hero_eyebrow: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_cta_label: string | null;
  hero_cta_href: string | null;
  updated_at: string | null;
};

export function blogImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(BLOG_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Uploads under the blog/ prefix. Storage policies are pinned per prefix, so an
 * upload outside blog/<uuid>.<ext> is refused by the database, not just here.
 */
export async function uploadBlogImage(file: File): Promise<string> {
  await assertJpeg(file);
  if (file.size > IMAGE_MAX_BYTES) throw new Error("The image must be 2 MB or smaller.");
  const path = `blog/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(BLOG_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** Best effort. Returns the message instead of throwing, as banners do. */
export async function removeBlogImage(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { error } = await supabase.storage.from(BLOG_BUCKET).remove([path]);
  return error ? error.message : null;
}

// ── Authors ─────────────────────────────────────────────────────────────────

/**
 * Cosora first, as the default a new post starts on, then the people by name.
 * Read straight from the table: every author row is public, like the
 * categories, so there is nothing for an RPC gate to add.
 */
export function useBlogAuthors() {
  return useQuery({
    queryKey: ["blogs", "authors"],
    queryFn: async (): Promise<BlogAuthor[]> => {
      const { data, error } = await supabase
        .from("authors")
        .select("id,slug,name,entity_type,role")
        .order("name");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as BlogAuthor[];
      return [
        ...rows.filter((a) => a.entity_type === "organization"),
        ...rows.filter((a) => a.entity_type === "person"),
      ];
    },
  });
}

/** "Anandita Mitra, CEO" for a person; the plain name for Cosora. */
export function authorLabel(a: BlogAuthor): string {
  return a.entity_type === "person" && a.role ? `${a.name}, ${a.role}` : a.name;
}

// ── Posts ───────────────────────────────────────────────────────────────────

export function useBlogPosts() {
  return useQuery({
    queryKey: ["blogs", "posts"],
    queryFn: async (): Promise<BlogPostRow[]> => {
      const { data, error } = await supabase.rpc("admin_blog_post_list");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as BlogPostRow[];
    },
  });
}

export function useBlogPost(id: string | null) {
  return useQuery({
    queryKey: ["blogs", "post", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<BlogPostFull | null> => {
      const { data, error } = await supabase.rpc("admin_blog_post_get", {
        p_id: id as string,
      });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as BlogPostFull[];
      return rows[0] ?? null;
    },
  });
}

export type BlogPostInput = {
  id: string | null;
  title: string;
  slug: string;
  excerpt: string;
  blocks: BlogBlock[];
  hero_image: string | null;
  hero_image_alt: string;
  thumbnail: string | null;
  thumbnail_alt: string;
  author_id: string | null;
  category_id: string | null;
  is_featured: boolean;
  status: BlogStatus;
  published_at: string | null;
  seo_title: string;
  seo_description: string;
  og_image: string | null;
  tags: string[];
  canonical_url: string;
  noindex: boolean;
};

export function useSaveBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BlogPostInput): Promise<string> => {
      const { data, error } = await supabase.rpc("admin_blog_post_save", {
        // undefined, never null: PostgREST omits an undefined key entirely and
        // the SQL default applies. Passing null would also work but the
        // generated types model these params as optional, not nullable.
        p_id: input.id ?? undefined,
        p_title: input.title,
        p_slug: input.slug || undefined,
        p_excerpt: input.excerpt || undefined,
        p_blocks: input.blocks.length ? input.blocks : undefined,
        p_hero_image: input.hero_image ?? undefined,
        p_hero_image_alt: input.hero_image_alt || undefined,
        p_thumbnail: input.thumbnail ?? undefined,
        p_thumbnail_alt: input.thumbnail_alt || undefined,
        p_author_id: input.author_id ?? undefined,
        p_category_id: input.category_id ?? undefined,
        p_is_featured: input.is_featured,
        p_status: input.status,
        p_published_at: input.published_at ?? undefined,
        p_seo_title: input.seo_title || undefined,
        p_seo_description: input.seo_description || undefined,
        p_og_image: input.og_image ?? undefined,
        p_tags: input.tags.length ? input.tags : undefined,
        p_canonical_url: input.canonical_url || undefined,
        p_noindex: input.noindex,
      });
      if (error) throw new Error(error.message);
      return data as unknown as string;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["blogs"] }),
  });
}

export function useDeleteBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string[]> => {
      const res = await supabase.rpc("admin_blog_post_delete", { p_id: id });
      assertWrote(res, "delete the post");
      const rows = (res.data ?? []) as unknown as { images: string[] | null }[];
      return rows[0]?.images ?? [];
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["blogs"] }),
  });
}

export function useSetBlogPostStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: BlogStatus; published_at?: string | null }) => {
      assertWrote(
        await supabase.rpc("admin_blog_post_set_status", {
          p_id: v.id,
          p_status: v.status,
          p_published_at: v.published_at ?? undefined,
        }),
        "change the status",
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["blogs"] }),
  });
}

export function useReorderBlogPosts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("admin_blog_post_reorder", { p_ids: ids });
      if (error) throw new Error(error.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["blogs"] }),
  });
}

// ── Categories ──────────────────────────────────────────────────────────────

export function useBlogCategories() {
  return useQuery({
    queryKey: ["blogs", "categories"],
    queryFn: async (): Promise<BlogCategory[]> => {
      const { data, error } = await supabase.rpc("admin_blog_category_list");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as BlogCategory[];
    },
  });
}

export type BlogCategoryInput = {
  id: string | null;
  name: string;
  slug: string;
  description: string;
  seo_title: string;
  seo_description: string;
};

export function useSaveBlogCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BlogCategoryInput) => {
      const { error } = await supabase.rpc("admin_blog_category_save", {
        p_id: input.id ?? undefined,
        p_name: input.name,
        p_slug: input.slug || undefined,
        p_description: input.description || undefined,
        p_seo_title: input.seo_title || undefined,
        p_seo_description: input.seo_description || undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["blogs"] }),
  });
}

export function useDeleteBlogCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      assertWrote(
        await supabase.rpc("admin_blog_category_delete", { p_id: id }),
        "delete the category",
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["blogs"] }),
  });
}

export function useReorderBlogCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("admin_blog_category_reorder", { p_ids: ids });
      if (error) throw new Error(error.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["blogs"] }),
  });
}

// ── Landing settings ────────────────────────────────────────────────────────

export function useBlogSettings() {
  return useQuery({
    queryKey: ["blogs", "settings"],
    queryFn: async (): Promise<BlogSettings | null> => {
      const { data, error } = await supabase.rpc("admin_blog_settings_get");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as BlogSettings[];
      return rows[0] ?? null;
    },
  });
}

export function useSaveBlogSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Omit<BlogSettings, "updated_at">) => {
      const { error } = await supabase.rpc("admin_blog_settings_save", {
        p_hero_enabled: v.hero_enabled,
        p_hero_image: v.hero_image ?? undefined,
        p_hero_image_alt: v.hero_image_alt || undefined,
        p_hero_eyebrow: v.hero_eyebrow || undefined,
        p_hero_title: v.hero_title || undefined,
        p_hero_subtitle: v.hero_subtitle || undefined,
        p_hero_cta_label: v.hero_cta_label || undefined,
        p_hero_cta_href: v.hero_cta_href || undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["blogs"] }),
  });
}

/** A blog button link: https://…, a path on cosora.in, mailto: or tel: (AR-L18; the database's blog_href_ok()). */
export function blogHrefOk(href: string): boolean {
  return /^(https?:\/\/[^\s<>"]+|\/[^/\\\s][^\s<>"]*|\/|mailto:[^\s<>"]+|tel:\+?[0-9 ()-]+|#[A-Za-z0-9_-]*)$/i.test(href.trim());
}
export const BLOG_HREF_HINT = "Start with https://, / (a page on Cosora), mailto: or tel:.";

/** Every picture path an article holds: hero, thumbnail, share image and image blocks. */
export function blogImagePaths(a: {
  hero_image?: string | null;
  thumbnail?: string | null;
  og_image?: string | null;
  blocks?: { type: string; path?: string }[] | null;
}): string[] {
  const out = [a.hero_image, a.thumbnail, a.og_image, ...(a.blocks ?? []).filter((b) => b.type === "image").map((b) => b.path)];
  return out.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/**
 * Remove pictures this edit put aside: `candidates` minus `kept`, and only those no article and not the blog's hero
 * uses (admin_blog_unused_images). Best effort, after the save (AR-L19: replaced and removed pictures stayed in
 * Storage). Returns the first failure's message, or null.
 */
export async function cleanupBlogImages(candidates: string[], kept: string[]): Promise<string | null> {
  const keep = new Set(kept);
  const maybe = [...new Set(candidates)].filter((x) => !keep.has(x));
  if (maybe.length === 0) return null;
  const { data, error } = await supabase.rpc("admin_blog_unused_images" as never, { p_paths: maybe } as never);
  if (error) return (error as { message: string }).message;
  const unused = (data ?? []) as string[];
  const failures = (await Promise.all(unused.map((x) => removeBlogImage(x)))).filter(Boolean) as string[];
  return failures[0] ?? null;
}
