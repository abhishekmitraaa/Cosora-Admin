import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { fetchProductDetails } from "@/lib/productDetails";
import { Attr, AttrGrid, Badge, Button, ErrorNote, Modal, SkeletonList, StatusBadge } from "@/components/ui";

/**
 * "Review details" on a product in the queue (2026-10-17): everything the vendor entered, so a moderator can
 * approve on the whole listing, not on a name, a price and three pictures. lib/productDetails.ts reads it.
 */
export default function ProductDetailsModal({
  productId,
  title,
  onClose,
  actions,
}: {
  productId: string | null;
  title: string;
  onClose: () => void;
  /** Approve / Reject, the same as on the card. */
  actions?: React.ReactNode;
}) {
  const q = useQuery({
    queryKey: ["product-details", productId],
    queryFn: () => fetchProductDetails(productId as string),
    enabled: Boolean(productId),
  });
  const d = q.data;

  return (
    <Modal open={productId !== null} title={title} onClose={onClose} width="lg">
      {q.isLoading ? (
        <SkeletonList rows={3} height="h-24" />
      ) : q.error ? (
        <ErrorNote message={(q.error as Error).message} />
      ) : d ? (
        <div className="space-y-4 text-sm" data-testid="product-details">
          <section>
            <AttrGrid cols={2}>
              <Attr label="Category" value={[d.parentCategory, d.category].filter(Boolean).join(" › ") || null} />
              <Attr label="Price" value={d.price} />
              <Attr label="MOQ" value={d.moq} />
              <Attr label="Unit" value={d.unit} />
            </AttrGrid>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">Description</h3>
            {d.description ? (
              <p className="whitespace-pre-line text-ink-muted">{d.description}</p>
            ) : (
              <p className="text-ink-ghost">No description.</p>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">Details</h3>
            {d.fields.length === 0 ? (
              <p className="text-ink-ghost">None entered.</p>
            ) : (
              <AttrGrid cols={2}>
                {d.fields.map((f) => <Attr key={f.label} label={f.label} value={f.value} />)}
              </AttrGrid>
            )}
          </section>

          {d.answers.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">Category answers</h3>
              <AttrGrid cols={2}>
                {d.answers.map((f) => <Attr key={f.label} label={f.label} value={f.value} />)}
              </AttrGrid>
            </section>
          )}

          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Pictures <span className="font-normal normal-case tracking-normal">({d.images.length})</span>
            </h3>
            {d.images.length === 0 ? (
              <p className="text-ink-ghost">No pictures.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {d.images.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={url} alt="" className="aspect-square w-full rounded-lg border border-line object-cover" />
                  </a>
                ))}
              </div>
            )}
          </section>

          {d.videos.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                Videos <span className="font-normal normal-case tracking-normal">(moderated under Videos)</span>
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {d.videos.map((v) => (
                  <div key={v.id} className="overflow-hidden rounded-lg border border-line">
                    {v.url ? (
                      <video src={v.url} poster={v.poster ?? undefined} controls preload="metadata" className="aspect-[9/16] w-full bg-black object-cover" />
                    ) : (
                      <div className="flex aspect-[9/16] items-center justify-center text-xs text-ink-faint">No video file</div>
                    )}
                    <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-2xs">
                      <StatusBadge status={v.status} />
                      {v.durationSeconds != null && <span className="text-ink-faint">{v.durationSeconds}s</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {d.documents.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">PDFs</h3>
              <ul className="space-y-1">
                {d.documents.map((doc) => (
                  <li key={doc.id}>
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-ink hover:underline">
                      <FileText size={14} aria-hidden /> {doc.name}
                      {doc.sizeBytes ? <Badge>{Math.max(1, Math.round(doc.sizeBytes / 1024))} KB</Badge> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button onClick={onClose}>Close</Button>
            {actions}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
