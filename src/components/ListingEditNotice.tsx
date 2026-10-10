import { Badge, Notice } from "@/components/ui";
import { describeChanges, WAS_STATUS_TEXT, type ListingEdit, type ListingEntity } from "@/lib/listingEdits";

const WHEN = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
});

/** The badge next to an item's status: it was approved or rejected, and its seller changed it since. */
export function EditedBadge({ edit }: { edit: ListingEdit | undefined }) {
  if (!edit) return null;
  return <Badge tone="caution" dot>Edited</Badge>;
}

/**
 * What the seller changed since Cosora's last decision on the item, read from the open edit
 * record. Values are as saved: the price "before" is the price buyers last saw.
 */
export function ListingEditNotice({ entity, edit }: { entity: ListingEntity; edit: ListingEdit | undefined }) {
  if (!edit) return null;
  const lines = describeChanges(entity, edit.changes);
  const noun = entity === "product" ? "listing" : entity === "product_video" ? "video" : "catalogue";
  return (
    <Notice tone="caution" className="mt-2.5 text-xs" marker="listing-edit-notice">
      <span className="font-semibold">
        Edited by the seller {WAS_STATUS_TEXT[edit.wasStatus] ?? ""}.
      </span>{" "}
      {edit.edits === 1 ? "1 save" : `${edit.edits} saves`}, last {WHEN.format(new Date(edit.lastEditedAt))} IST.
      {lines.length === 0 ? (
        <span> Sent back for review with nothing changed.</span>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {lines.map((l) => (
            <li key={l.field} className="break-words">
              <span className="font-medium text-ink">{l.label}:</span> {l.text}
            </li>
          ))}
        </ul>
      )}
      <span className="mt-1.5 block text-ink-muted">Approving puts this {noun} live as it is now.</span>
    </Notice>
  );
}
