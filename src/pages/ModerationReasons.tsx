import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  useProductReasons,
  useSaveReason,
  type ProductReason,
  type ReasonDraft,
  type ReasonUse, useSwapReasons } from "@/lib/productModeration";
import {
  Badge,
  Button,
  Checkbox,
  Empty,
  ErrorNote,
  Field,
  Input,
  Modal,
  Note,
  Page,
  PageHeader,
  ReadOnlyBanner,
  ROW_HOVER,
  SkeletonList,
  Table,
  Textarea,
} from "@/components/ui";

const SUBTITLE =
  "The reasons a moderator picks when removing or flagging a listing. Super admins and managers edit them.";

const USE_LABEL: Record<ReasonUse, string> = { remove: "Remove", flag: "Flag" };

const EMPTY: ReasonDraft = { id: null, label: "", vendor_message: "", applies_to: ["remove", "flag"], active: true };

/**
 * The vocabulary for product removals and flags (admin.product_moderation_reasons). Every
 * Remove and Flag dialog on Products picks from the active rows here. A reason is never
 * deleted: past removals point at it, so a retired one is switched off, which takes it out
 * of the dialogs and keeps the history readable. Writes go through
 * admin_product_reason_save(), which admits super_admin and manager only; each change is
 * in the Admin Log.
 */
export default function ModerationReasons() {
  const role = useRole();
  const writable = canWrite(role, "moderation-reasons");
  // Switched-off rows are for the editors; a product moderator sees the active list.
  const reasons = useProductReasons(writable);
  const save = useSaveReason();
  const swap = useSwapReasons();
  const [draft, setDraft] = useState<ReasonDraft | null>(null);

  if (reasons.isLoading) {
    return (
      <Page width="narrow">
        <PageHeader title="Moderation reasons" subtitle={SUBTITLE} />
        <SkeletonList rows={1} height="h-64" />
      </Page>
    );
  }
  if (reasons.error) return <ErrorNote message={(reasons.error as Error).message} />;

  const rows = reasons.data ?? [];

  function edit(r: ProductReason) {
    setDraft({ id: r.id, label: r.label, vendor_message: r.vendor_message, applies_to: r.applies_to, active: r.active });
  }

  function toggle(r: ProductReason) {
    save.mutate(
      { id: r.id, label: r.label, vendor_message: r.vendor_message, applies_to: r.applies_to, active: !r.active },
      { onSuccess: () => toast.success(r.active ? `"${r.label}" switched off` : `"${r.label}" switched on`) },
    );
  }

  // Swap two neighbours' places, in one change (AR-L05).
  function move(i: number, dir: -1 | 1) {
    const a = rows[i];
    const b = rows[i + dir];
    if (!a?.id || !b?.id) return;
    swap.mutate({ a: a.id, b: b.id });
  }

  const valid =
    draft !== null &&
    draft.label.trim().length > 0 &&
    draft.label.trim().length <= 80 &&
    draft.vendor_message.trim().length > 0 &&
    draft.vendor_message.trim().length <= 500 &&
    draft.applies_to.length > 0;

  return (
    <Page width="narrow">
      <PageHeader
        title="Moderation reasons"
        subtitle={SUBTITLE}
        actions={
          writable ? (
            <Button variant="primary" onClick={() => setDraft({ ...EMPTY })}>
              Add reason
            </Button>
          ) : undefined
        }
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "moderation-reasons")} />}

      <Note className="mb-4">
        The vendor reads a reason's message, followed by any details the moderator adds. Reasons are never
        deleted, because past removals point at them: <span className="font-medium text-ink">Switch off</span>{" "}
        takes one out of the Remove and Flag dialogs and keeps the history readable. Editing a message changes
        what future notices say, not notices already sent.
      </Note>

      {rows.length === 0 ? (
        <Empty>No reasons yet, so no listing can be removed or flagged until one exists.</Empty>
      ) : (
        <Table head={["Reason", "Used for", "State", ""]}>
          {rows.map((r, i) => (
            <tr key={r.id} className={r.active ? ROW_HOVER : `opacity-60 ${ROW_HOVER}`} data-testid={`reason-${r.label}`}>
              <td className="px-3 py-2">
                <div className="font-medium text-ink">{r.label}</div>
                <div className="mt-0.5 max-w-md text-xs leading-relaxed text-ink-muted">{r.vendor_message}</div>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {r.applies_to.map((u) => (
                    <Badge key={u} tone={u === "remove" ? "critical" : "caution"}>
                      {USE_LABEL[u]}
                    </Badge>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2">
                {r.active ? <Badge tone="positive" dot>on</Badge> : <Badge dot>off</Badge>}
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Move ${r.label} up`}
                    disabled={!writable || i === 0 || save.isPending}
                    onClick={() => void move(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Move ${r.label} down`}
                    disabled={!writable || i === rows.length - 1 || save.isPending}
                    onClick={() => void move(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </Button>
                  <Button size="sm" disabled={!writable} onClick={() => edit(r)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant={r.active ? "danger" : "outline"}
                    disabled={!writable || save.isPending}
                    onClick={() => toggle(r)}
                  >
                    {r.active ? "Switch off" : "Switch on"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal
        open={draft !== null}
        title={draft?.id ? "Edit reason" : "Add reason"}
        onClose={() => setDraft(null)}
        width="lg"
      >
        {draft && (
          <div className="space-y-3">
            <Field label="Name (what moderators pick)" htmlFor="reason-label" hint="Up to 80 characters.">
              <Input
                id="reason-label"
                autoFocus
                maxLength={80}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </Field>
            <Field
              label="Message the vendor reads"
              htmlFor="reason-message"
              hint="Say what is wrong and, where it can be fixed, what to do. Up to 500 characters."
            >
              <Textarea
                id="reason-message"
                rows={4}
                maxLength={500}
                value={draft.vendor_message}
                onChange={(e) => setDraft({ ...draft, vendor_message: e.target.value })}
              />
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["remove", "flag"] as ReasonUse[]).map((u) => (
                <Checkbox
                  key={u}
                  checked={draft.applies_to.includes(u)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      applies_to: e.target.checked
                        ? [...draft.applies_to, u]
                        : draft.applies_to.filter((x) => x !== u),
                    })
                  }
                  label={`Offer when ${u === "remove" ? "removing" : "flagging"}`}
                  hint={
                    u === "remove"
                      ? "Takes the listing down for good."
                      : "Hides a live listing until it is reviewed again."
                  }
                />
              ))}
            </div>
            <Checkbox
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              label="On"
              hint="Only reasons that are on appear in the dialogs."
            />
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setDraft(null)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid || save.isPending}
            onClick={() =>
              draft &&
              save.mutate(draft, {
                onSuccess: () => {
                  toast.success(draft.id ? "Reason saved" : "Reason added");
                  setDraft(null);
                },
              })
            }
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Modal>
    </Page>
  );
}
