import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ExternalLink, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  ErrorNote,
  Field,
  Input,
  Modal,
  Note,
  Page,
  PageHeader,
  ReadOnlyBanner,
  SectionTitle,
  Select,
  SkeletonList,
  Table,
  Tabs,
  Textarea,
} from "@/components/ui";
import { BlockEditor } from "@/components/blog/BlockEditor";
import { BlogImageField } from "@/components/blog/BlogImageField";
import { useRole } from "@/hooks/useAdminSession";
import { canWrite, readOnlyReason } from "@/lib/roles";
import {
  blocksToText,
  charCount,
  renderedDescription,
  renderedTitle,
  SEO_DESC_MAX,
  SEO_DESC_MIN,
  SEO_TITLE_MAX,
  SUFFIX_LABEL,
  TITLE_ROOM,
  TITLE_SUFFIX,
} from "@/lib/blogSeo";
import {
  removeBlogImage,
  useBlogCategories,
  useBlogPost,
  useBlogPosts,
  useBlogSettings,
  useDeleteBlogCategory,
  useDeleteBlogPost,
  useReorderBlogPosts,
  useSaveBlogCategory,
  useSaveBlogPost,
  useSaveBlogSettings,
  useSetBlogPostStatus,
  type BlogBlock,
  type BlogPostFull,
  type BlogStatus,
} from "@/lib/blogs";

const BLOG_URL = "https://www.cosora.in/blogs";

type TabId = "articles" | "categories" | "landing";

export default function Blogs() {
  const role = useRole();
  const writable = canWrite(role, "blogs");
  const [tab, setTab] = useState<TabId>("articles");

  const posts = useBlogPosts();
  const categories = useBlogCategories();

  if (posts.isLoading || categories.isLoading) {
    return (
      <Page>
        <PageHeader title="Blog" subtitle="The Cosora Journal at cosora.in/blogs" />
        <SkeletonList rows={1} height="h-64" />
      </Page>
    );
  }
  if (posts.error) return <ErrorNote message={(posts.error as Error).message} />;
  if (categories.error) return <ErrorNote message={(categories.error as Error).message} />;

  return (
    <Page>
      <PageHeader
        title="Blog"
        subtitle="Articles, categories and the landing page for cosora.in/blogs"
        actions={
          <a href={BLOG_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              View blog <ExternalLink size={14} className="ml-1" />
            </Button>
          </a>
        }
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "blogs")} />}

      <Note className="mb-4">
        A published article appears on the live blog within a minute. Changes are recorded in
        the Admin Log.
      </Note>

      <Tabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "articles", label: "Articles", count: posts.data?.length ?? 0 },
          { id: "categories", label: "Categories", count: categories.data?.length ?? 0 },
          { id: "landing", label: "Landing page" },
        ]}
      />

      {tab === "articles" && <ArticlesTab writable={writable} />}
      {tab === "categories" && <CategoriesTab writable={writable} />}
      {tab === "landing" && <LandingTab writable={writable} />}
    </Page>
  );
}

// ── Articles ────────────────────────────────────────────────────────────────

function statusTone(status: BlogStatus) {
  if (status === "published") return "positive" as const;
  if (status === "scheduled") return "info" as const;
  return "neutral" as const;
}

function ArticlesTab({ writable }: { writable: boolean }) {
  const posts = useBlogPosts();
  const reorder = useReorderBlogPosts();
  const setStatus = useSetBlogPostStatus();
  const del = useDeleteBlogPost();
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const rows = posts.data ?? [];
  const busy = reorder.isPending || setStatus.isPending || del.isPending;

  function move(index: number, dir: -1 | 1) {
    const ids = rows.map((r) => r.id);
    [ids[index], ids[index + dir]] = [ids[index + dir], ids[index]];
    reorder.mutate(ids, { onError: (e: Error) => toast.error(e.message) });
  }

  const target = confirmDelete ? rows.find((r) => r.id === confirmDelete) : null;

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" size="sm" disabled={!writable} onClick={() => setEditing(null)}>
          New article
        </Button>
      </div>

      {rows.length === 0 ? (
        <Note>No articles yet. Create one to see it on the blog.</Note>
      ) : (
        <Table head={["Order", "Title", "Category", "Status", "Published", ""]}>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="w-16">
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={!writable || busy || i === 0}
                    onClick={() => move(i, -1)}
                    className="disabled:opacity-40"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={!writable || busy || i === rows.length - 1}
                    onClick={() => move(i, 1)}
                    className="disabled:opacity-40"
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>
              </td>
              <td>
                <button
                  type="button"
                  className="text-left font-medium text-ink hover:underline"
                  onClick={() => setEditing(r.id)}
                >
                  {r.title}
                </button>
                <div className="mt-0.5 flex items-center gap-2 text-2xs text-ink-muted">
                  <span>/{r.slug}</span>
                  {r.is_featured && <Badge tone="info">Featured</Badge>}
                  {r.noindex && <Badge tone="caution">No index</Badge>}
                  {!r.has_blocks && <Badge tone="neutral">Markdown</Badge>}
                </div>
              </td>
              <td className="text-ink-muted">{r.category_name ?? "None"}</td>
              <td>
                <Badge tone={statusTone(r.status)} dot>
                  {r.status}
                </Badge>
              </td>
              <td className="text-ink-muted">
                {r.published_at ? new Date(r.published_at).toLocaleDateString("en-GB") : "Not set"}
              </td>
              <td className="text-right">
                <div className="flex justify-end gap-1">
                  {r.status !== "published" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!writable || busy}
                      onClick={() =>
                        setStatus.mutate(
                          { id: r.id, status: "published" },
                          {
                            onSuccess: () => toast.success("Published"),
                            onError: (e: Error) => toast.error(e.message),
                          },
                        )
                      }
                    >
                      Publish
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!writable || busy}
                      onClick={() =>
                        setStatus.mutate(
                          { id: r.id, status: "draft" },
                          {
                            onSuccess: () => toast.success("Moved to draft"),
                            onError: (e: Error) => toast.error(e.message),
                          },
                        )
                      }
                    >
                      Unpublish
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${r.title}`}
                    disabled={!writable || busy}
                    onClick={() => setConfirmDelete(r.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {editing !== undefined && (
        <ArticleEditor id={editing} writable={writable} onClose={() => setEditing(undefined)} />
      )}

      <Modal
        open={Boolean(confirmDelete)}
        title="Delete this article?"
        onClose={() => setConfirmDelete(null)}
      >
        <p className="text-sm text-ink-muted">
          {target?.title} will be removed from the blog permanently, along with its images. To
          take it off the blog but keep it, use Unpublish instead.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={del.isPending}
            onClick={() => {
              const id = confirmDelete as string;
              del.mutate(id, {
                onSuccess: async (images) => {
                  setConfirmDelete(null);
                  toast.success("Deleted");
                  // Row first, then the objects, so a failed cleanup never
                  // leaves a post pointing at an image that is gone.
                  const failures = (
                    await Promise.all(images.map((p) => removeBlogImage(p)))
                  ).filter(Boolean);
                  if (failures.length) {
                    toast.warning(`The images could not all be removed: ${failures[0]}`);
                  }
                },
                onError: (e: Error) => toast.error(e.message),
              });
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
}

type Draft = {
  title: string;
  slug: string;
  excerpt: string;
  blocks: BlogBlock[];
  hero_image: string | null;
  hero_image_alt: string;
  thumbnail: string | null;
  thumbnail_alt: string;
  author: string;
  category_id: string | null;
  is_featured: boolean;
  status: BlogStatus;
  published_at: string;
  seo_title: string;
  seo_description: string;
  tags: string;
  canonical_url: string;
  noindex: boolean;
};

  /**
   * Not edited in this form, but carried through so a save writes back what
   * was stored. admin_blog_post_save sets og_image = p_og_image, so sending
   * null here erased a custom share image on every save.
   */
  og_image: string | null;
const EMPTY_DRAFT: Draft = {
  title: "",
  slug: "",
  excerpt: "",
  blocks: [],
  hero_image: null,
  hero_image_alt: "",
  thumbnail: null,
  thumbnail_alt: "",
  author: "Cosora Team",
  category_id: null,
  is_featured: false,
  status: "draft",
  published_at: "",
  seo_title: "",
  seo_description: "",
  tags: "",
  canonical_url: "",
  noindex: false,
};

  og_image: null,
function draftFrom(p: BlogPostFull): Draft {
  return {
    title: p.title ?? "",
    slug: p.slug ?? "",
    excerpt: p.excerpt ?? "",
    blocks: p.blocks ?? [],
    hero_image: p.hero_image,
    hero_image_alt: p.hero_image_alt ?? "",
    thumbnail: p.thumbnail,
    thumbnail_alt: p.thumbnail_alt ?? "",
    author: p.author ?? "",
    category_id: p.category_id,
    is_featured: p.is_featured,
    status: p.status,
    published_at: p.published_at ? p.published_at.slice(0, 16) : "",
    seo_title: p.seo_title ?? "",
    seo_description: p.seo_description ?? "",
    tags: (p.tags ?? []).join(", "),
    canonical_url: p.canonical_url ?? "",
    noindex: p.noindex,
  };
}
    og_image: p.og_image,

function validate(d: Draft): Partial<Record<keyof Draft, string>> {
  const e: Partial<Record<keyof Draft, string>> = {};
  if (!d.title.trim()) e.title = "Give the article a title.";
  if (d.status === "scheduled" && !d.published_at) {
    e.published_at = "A scheduled article needs a date.";
  }
  const badImage = d.blocks.find((b) => b.type === "image" && !b.alt.trim());
  if (badImage) e.blocks = "Every image needs alt text.";
  return e;
}

function ArticleEditor({
  id,
  writable,
  onClose,
}: {
  id: string | null;
  writable: boolean;
  onClose: () => void;
}) {
  const existing = useBlogPost(id);
  const categories = useBlogCategories();
  const save = useSaveBlogPost();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loaded, setLoaded] = useState(id === null);

  useEffect(() => {
    if (id && existing.data && !loaded) {
      setDraft(draftFrom(existing.data));
      setLoaded(true);
    }
  }, [id, existing.data, loaded]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const errors = validate(draft);
  const valid = Object.keys(errors).length === 0;

  // What the blog will actually emit, derived by lib/blogSeo exactly as
  // cosora-blogs derives it. The title is measured as the whole <title> tag,
  // site name included: measuring the field alone under-reported every title by
  // the 21 characters of " · The Cosora Journal".
  const pageTitle = renderedTitle(draft.seo_title, draft.title);
  const titleLength = charCount(pageTitle);
  const usingArticleTitle = !draft.seo_title.trim() && Boolean(pageTitle);
  const bodyText = blocksToText(draft.blocks);
  // The stored legacy Markdown body: never edited here, but the blog still falls
  // back to it for a post with no prose blocks.
  const effectiveDesc = renderedDescription(
    draft.seo_description,
    draft.excerpt,
    draft.blocks,
    existing.data?.body ?? null,
  );
  const descLength = charCount(effectiveDesc);
  const words = bodyText ? bodyText.split(/\s+/).length : 0;

  const seoWarnings = useMemo(() => {
    const w: string[] = [];
    if (titleLength > SEO_TITLE_MAX) w.push("The title will be cut short in results.");
    if (descLength < SEO_DESC_MIN) w.push("The description is shorter than ideal.");
    if (descLength > SEO_DESC_MAX) w.push("The description will be cut short in results.");
    if (!draft.blocks.some((b) => b.type === "heading")) w.push("No headings, so no contents list.");
    if (!draft.category_id) w.push("No category, so it will not appear under a section.");
    if (!draft.thumbnail && !draft.hero_image) w.push("No image, so cards will show a placeholder.");
    return w;
  }, [titleLength, descLength, draft]);

  if (id && !loaded) {
    return (
      <Modal open title="Edit article" onClose={onClose} width="lg">
        <SkeletonList rows={1} height="h-64" />
      </Modal>
    );
  }

  return (
    <Modal open title={id ? "Edit article" : "New article"} onClose={onClose} width="lg">
      <div className="flex flex-col gap-4">
        <Field label="Title" error={errors.title}>
          <Input
            value={draft.title}
            disabled={!writable}
            onChange={(e) => set({ title: e.target.value })}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Slug" hint="Leave blank to build one from the title.">
            <Input
              value={draft.slug}
              disabled={!writable}
              onChange={(e) => set({ slug: e.target.value })}
            />
          </Field>
          <Field label="Author">
            <Input
              value={draft.author}
              disabled={!writable}
              onChange={(e) => set({ author: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Excerpt" hint="Two lines on the card, and the fallback meta description.">
          <Textarea
            rows={2}
            value={draft.excerpt}
            disabled={!writable}
            onChange={(e) => set({ excerpt: e.target.value })}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select
              value={draft.category_id ?? ""}
              disabled={!writable}
              onChange={(e) => set({ category_id: e.target.value || null })}
            >
              <option value="">None</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={draft.status}
              disabled={!writable}
              onChange={(e) => set({ status: e.target.value as BlogStatus })}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Publish date"
            hint="Leave blank to publish now. A future date holds it back until then."
            error={errors.published_at}
          >
            <Input
              type="datetime-local"
              value={draft.published_at}
              disabled={!writable}
              onChange={(e) => set({ published_at: e.target.value })}
            />
          </Field>
          <div className="flex items-end pb-1">
            <Checkbox
              label="Feature on the blog home"
              hint="Only one article can be featured."
              checked={draft.is_featured}
              disabled={!writable}
              onChange={(e) => set({ is_featured: e.target.checked })}
            />
          </div>
        </div>

        <SectionTitle>Images</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <BlogImageField
              label="Hero image"
              path={draft.hero_image}
              disabled={!writable}
              onChange={(p) => set({ hero_image: p })}
            />
            <Field label="Hero alt text">
              <Input
                value={draft.hero_image_alt}
                disabled={!writable}
                onChange={(e) => set({ hero_image_alt: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex flex-col gap-3">
            <BlogImageField
              label="Thumbnail"
              hint="Used on cards. Falls back to the hero image."
              path={draft.thumbnail}
              disabled={!writable}
              onChange={(p) => set({ thumbnail: p })}
            />
            <Field label="Thumbnail alt text">
              <Input
                value={draft.thumbnail_alt}
                disabled={!writable}
                onChange={(e) => set({ thumbnail_alt: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <SectionTitle>Article</SectionTitle>
        {errors.blocks ? <ErrorNote message={errors.blocks} /> : null}
        <BlockEditor
          blocks={draft.blocks}
          disabled={!writable}
          onChange={(blocks) => set({ blocks })}
        />

        <SectionTitle>Search appearance</SectionTitle>
        <Note>
          These are filled in automatically from the title and excerpt. Set them only when you
          want something different.
        </Note>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-2xs uppercase tracking-wide text-ink-muted">Preview</p>
          <p className="mt-1 text-sm text-brand">{pageTitle || `Untitled${TITLE_SUFFIX}`}</p>
          <p className="text-2xs text-ink-muted">
            www.cosora.in/blogs/{draft.slug || "article-slug"}
          </p>
          <p className="mt-1 text-sm text-ink-muted">{effectiveDesc || "No description yet."}</p>
        </div>

        <Field
          label="Search title"
          hint={
            !pageTitle
              ? `The site adds "${SUFFIX_LABEL}" (${SEO_TITLE_MAX - TITLE_ROOM} characters with its space), so keep the title to ${TITLE_ROOM}.`
              : `${usingArticleTitle ? "Blank, so the article title is used. " : ""}${titleLength} of ${SEO_TITLE_MAX} characters with "${SUFFIX_LABEL}" added. ${
                  titleLength > SEO_TITLE_MAX
                    ? `${titleLength - SEO_TITLE_MAX} too many.`
                    : `${SEO_TITLE_MAX - titleLength} left.`
                }`
          }
        >
          <Input
            value={draft.seo_title}
            disabled={!writable}
            onChange={(e) => set({ seo_title: e.target.value })}
          />
        </Field>
        <Field
          label="Search description"
          hint={`${descLength} characters. Aim for ${SEO_DESC_MIN} to ${SEO_DESC_MAX}.`}
        >
          <Textarea
            rows={2}
            value={draft.seo_description}
            disabled={!writable}
            onChange={(e) => set({ seo_description: e.target.value })}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tags" hint="Separated by commas.">
            <Input
              value={draft.tags}
              disabled={!writable}
              onChange={(e) => set({ tags: e.target.value })}
            />
          </Field>
          <Field
            label="Canonical link"
            hint="Only if this was first published somewhere else."
          >
            <Input
              value={draft.canonical_url}
              disabled={!writable}
              onChange={(e) => set({ canonical_url: e.target.value })}
            />
          </Field>
        </div>

        <Checkbox
          label="Hide from search engines"
          hint="The article stays readable by anyone with the link."
          checked={draft.noindex}
          disabled={!writable}
          onChange={(e) => set({ noindex: e.target.checked })}
        />

        {seoWarnings.length > 0 && (
          <Note>
            <span className="font-medium">Worth checking</span>
            <ul className="mt-1 list-disc pl-4">
              {seoWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Note>
        )}

        <p className="text-2xs text-ink-muted">
          About {words} words, roughly {Math.max(1, Math.round(words / 200))} min to read.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!writable || !valid || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id,
                  title: draft.title.trim(),
                  slug: draft.slug.trim(),
                  excerpt: draft.excerpt.trim(),
                  blocks: draft.blocks,
                  hero_image: draft.hero_image,
                  hero_image_alt: draft.hero_image_alt.trim(),
                  thumbnail: draft.thumbnail,
                  thumbnail_alt: draft.thumbnail_alt.trim(),
                  author: draft.author.trim(),
                  category_id: draft.category_id,
                  is_featured: draft.is_featured,
                  status: draft.status,
                  published_at: draft.published_at
                    ? new Date(draft.published_at).toISOString()
                    : null,
                  seo_title: draft.seo_title.trim(),
                  seo_description: draft.seo_description.trim(),
                  og_image: draft.og_image,
                  tags: draft.tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                  canonical_url: draft.canonical_url.trim(),
                  noindex: draft.noindex,
                },
                {
                  onSuccess: () => {
                    toast.success(id ? "Saved" : "Article created");
                    onClose();
                  },
                  onError: (e: Error) => toast.error(e.message),
                },
              )
            }
          >
            {draft.status === "published" ? "Save and publish" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Categories ──────────────────────────────────────────────────────────────

function CategoriesTab({ writable }: { writable: boolean }) {
  const categories = useBlogCategories();
  const save = useSaveBlogCategory();
  const del = useDeleteBlogCategory();
  const [draft, setDraft] = useState({
    id: null as string | null,
    name: "",
    slug: "",
    description: "",
    seo_title: "",
    seo_description: "",
  });

  const rows = categories.data ?? [];
  const editing = Boolean(draft.id);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div>
        {rows.length === 0 ? (
          <Note>No categories yet.</Note>
        ) : (
          <Table head={["Name", "Slug", "Articles", ""]}>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="font-medium text-ink">{c.name}</td>
                <td className="text-ink-muted">/{c.slug}</td>
                <td className="text-ink-muted">{c.posts}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!writable}
                      onClick={() =>
                        setDraft({
                          id: c.id,
                          name: c.name,
                          slug: c.slug,
                          description: c.description ?? "",
                          seo_title: c.seo_title ?? "",
                          seo_description: c.seo_description ?? "",
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${c.name}`}
                      disabled={!writable || del.isPending}
                      onClick={() =>
                        del.mutate(c.id, {
                          onSuccess: () => toast.success("Category deleted"),
                          onError: (e: Error) => toast.error(e.message),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <SectionTitle>{editing ? "Edit category" : "New category"}</SectionTitle>
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Name">
            <Input
              value={draft.name}
              disabled={!writable}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>
          <Field label="Slug" hint="Leave blank to build one from the name.">
            <Input
              value={draft.slug}
              disabled={!writable}
              onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
            />
          </Field>
          <Field
            label="Description"
            hint="Shown on the category page. Blank lines start new paragraphs. Search results use the category's search description when one is set, otherwise the start of this."
          >
            <Textarea
              rows={2}
              value={draft.description}
              disabled={!writable}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={!writable || !draft.name.trim() || save.isPending}
              onClick={() =>
                save.mutate(draft, {
                  onSuccess: () => {
                    toast.success(editing ? "Category saved" : "Category created");
                    setDraft({
                      id: null,
                      name: "",
                      slug: "",
                      description: "",
                      seo_title: "",
                      seo_description: "",
                    });
                  },
                  onError: (e: Error) => toast.error(e.message),
                })
              }
            >
              {editing ? "Save" : "Create"}
            </Button>
            {editing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft({
                    id: null,
                    name: "",
                    slug: "",
                    description: "",
                    seo_title: "",
                    seo_description: "",
                  })
                }
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Landing page ────────────────────────────────────────────────────────────

function LandingTab({ writable }: { writable: boolean }) {
  const settings = useBlogSettings();
  const save = useSaveBlogSettings();
  const [draft, setDraft] = useState({
    hero_enabled: false,
    hero_image: null as string | null,
    hero_image_alt: "",
    hero_eyebrow: "",
    hero_title: "",
    hero_subtitle: "",
    hero_cta_label: "",
    hero_cta_href: "",
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (settings.data && !loaded) {
      setDraft({
        hero_enabled: settings.data.hero_enabled,
        hero_image: settings.data.hero_image,
        hero_image_alt: settings.data.hero_image_alt ?? "",
        hero_eyebrow: settings.data.hero_eyebrow ?? "",
        hero_title: settings.data.hero_title ?? "",
        hero_subtitle: settings.data.hero_subtitle ?? "",
        hero_cta_label: settings.data.hero_cta_label ?? "",
        hero_cta_href: settings.data.hero_cta_href ?? "",
      });
      setLoaded(true);
    }
  }, [settings.data, loaded]);

  if (settings.isLoading) return <SkeletonList rows={1} height="h-48" />;

  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="max-w-2xl">
      <Note className="mb-4">
        The banner sits above the masthead on the blog home page. It is hidden until it is
        turned on and has an image.
      </Note>

      <div className="flex flex-col gap-3">
        <Checkbox
          label="Show the banner"
          checked={draft.hero_enabled}
          disabled={!writable}
          onChange={(e) => set({ hero_enabled: e.target.checked })}
        />

        <BlogImageField
          label="Banner image"
          hint="Wide crop, around 3:1. JPEG, PNG or WebP up to 2 MB."
          path={draft.hero_image}
          disabled={!writable}
          onChange={(p) => set({ hero_image: p })}
        />
        <Field label="Image alt text">
          <Input
            value={draft.hero_image_alt}
            disabled={!writable}
            onChange={(e) => set({ hero_image_alt: e.target.value })}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Eyebrow" hint="Small label above the headline.">
            <Input
              value={draft.hero_eyebrow}
              disabled={!writable}
              onChange={(e) => set({ hero_eyebrow: e.target.value })}
            />
          </Field>
          <Field label="Headline">
            <Input
              value={draft.hero_title}
              disabled={!writable}
              onChange={(e) => set({ hero_title: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Subtitle">
          <Textarea
            rows={2}
            value={draft.hero_subtitle}
            disabled={!writable}
            onChange={(e) => set({ hero_subtitle: e.target.value })}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Button label">
            <Input
              value={draft.hero_cta_label}
              disabled={!writable}
              onChange={(e) => set({ hero_cta_label: e.target.value })}
            />
          </Field>
          <Field label="Button link" hint="A path on cosora.in, such as /go/post-rfq.">
            <Input
              value={draft.hero_cta_href}
              disabled={!writable}
              onChange={(e) => set({ hero_cta_href: e.target.value })}
            />
          </Field>
        </div>

        <Button
          variant="primary"
          className="self-start"
          disabled={!writable || save.isPending}
          onClick={() =>
            save.mutate(draft, {
              onSuccess: () => toast.success("Saved"),
              onError: (e: Error) => toast.error(e.message),
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}
