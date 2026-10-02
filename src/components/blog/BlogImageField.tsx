import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Field } from "../ui";
import { blogImageUrl, IMAGE_TYPES, uploadBlogImage } from "@/lib/blogs";

/**
 * Picks and uploads one blog image.
 *
 * Uploads immediately rather than on save, because a block image has to be
 * referenced by path inside the blocks array before the post can be saved at
 * all. The trade is that abandoning an edit can leave an orphaned object; the
 * post save sweeps those by diffing image paths.
 *
 * The bucket caps at 2 MB and the storage policy only accepts
 * blog/<uuid>.(jpg|jpeg|png|webp), so a wrong file is refused by the database
 * as well as here.
 */
export function BlogImageField({
  label,
  hint,
  path,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  path: string | null;
  onChange: (path: string | null) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const remoteUrl = useMemo(() => blogImageUrl(path), [path]);

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  async function pick(file: File | null) {
    if (!file) return;
    setBusy(true);
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    try {
      const next = await uploadBlogImage(file);
      onChange(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The upload failed.");
      URL.revokeObjectURL(preview);
      setLocalPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const shown = localPreview ?? remoteUrl;

  return (
    <Field
      label={label}
      hint={hint ?? "JPEG, PNG or WebP, up to 2 MB. WebP keeps a large image inside the limit."}
    >
      <div className="flex flex-wrap items-start gap-3">
        {shown ? (
          <img
            src={shown}
            alt=""
            className="h-20 w-32 rounded-lg border border-line object-cover"
          />
        ) : (
          <div className="flex h-20 w-32 items-center justify-center rounded-lg border border-dashed border-line text-2xs text-ink-muted">
            No image
          </div>
        )}
        <div className="flex flex-col gap-2">
          <input
            type="file"
            accept={Object.keys(IMAGE_TYPES).join(",")}
            disabled={disabled || busy}
            onChange={(e) => void pick(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
          />
          {path ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={disabled || busy}
              onClick={() => {
                onChange(null);
                setLocalPreview(null);
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </Field>
  );
}
