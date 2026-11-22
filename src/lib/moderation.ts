import { assertWrote, describeWriteError, supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type ModeratedTable = "products" | "product_videos" | "catalogues";

/** The listing's status moved after the queue loaded (the vendor pulled it back, or another moderator decided). */
export class ListingChangedError extends Error {
  constructor(public readonly now: string) {
    super(`This changed since the list loaded: it is now "${now.replace(/_/g, " ")}". The list has been refreshed; nothing was changed.`);
  }
}

/**
 * Approve or reject a listing only if it still has the status the moderator was shown.
 *
 * The update used to match on id alone, and the moderation triggers let a moderator move a listing from any
 * status, so approving from a stale queue published a listing the vendor had since pulled back to draft, or
 * overrode another moderator's rejection (2026-10-20 audit). Now the update also matches the shown status;
 * when nothing matches, a second read says whether the listing moved on (ListingChangedError) or the role
 * was refused (assertWrote's message).
 */
/** The seller changed the listing (its content, photos or PDFs) after the moderator loaded it (AR-H10). */
export class ListingEditedError extends Error {
  constructor() {
    super("The seller changed this listing after you opened it. The list has been refreshed: look at it again before deciding.");
  }
}

const KIND: Record<ModeratedTable, "product" | "video" | "catalogue"> = {
  products: "product",
  product_videos: "video",
  catalogues: "catalogue",
};

/**
 * Each listing's revision (0 = unchanged since revisions were kept), read with the page that shows it. A decision
 * carries the revision the moderator saw, and the database refuses it when the listing has changed since (AR-H10).
 */
export async function fetchListingRevs(table: ModeratedTable, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase.rpc("admin_listing_revs" as never, { p_kind: KIND[table], p_ids: ids.slice(i, i + 500) } as never);
    if (error) throw new Error((error as { message: string }).message);
    for (const r of (data ?? []) as unknown as { listing_id: string; rev: number }[]) out.set(r.listing_id, Number(r.rev));
  }
  return out;
}

export async function moderateFrom(
  table: ModeratedTable,
  id: string,
  from: string,
  patch: { status: string; rejection_reason: string | null },
  action: string,
  /** The revision the moderator was shown (fetchListingRevs). Given, the decision applies only to that content. */
  rev?: number,
): Promise<void> {
  if (rev !== undefined) {
    const { data, error } = await supabase.rpc("admin_listing_decide" as never, {
      p_kind: KIND[table], p_id: id, p_from: from, p_to: patch.status, p_reason: patch.rejection_reason, p_rev: rev,
    } as never);
    if (error) {
      if ((error as { hint?: string }).hint === "changed_since_loaded") throw new ListingEditedError();
      throw new Error(describeWriteError(error as { message: string; code?: string }));
    }
    const res = data as unknown as { ok: boolean; status: string };
    if (!res?.ok) throw new ListingChangedError(res?.status ?? "changed");
    return;
  }
  // The three tables share these columns, but each types `status` as its own enum; the database checks the
  // value, so the client is told one table's shape.
  const t = table as "products";
  type Status = Database["public"]["Tables"]["products"]["Row"]["status"];
  const res = await supabase
    .from(t)
    .update(patch as { status: Status; rejection_reason: string | null })
    .eq("id", id)
    .eq("status", from as Status)
    .select("id");
  if (res.error) throw new Error(describeWriteError(res.error));
  if (res.data && res.data.length > 0) return;
  const now = await supabase.from(t).select("status").eq("id", id).maybeSingle();
  const current = (now.data as { status: string } | null)?.status;
  if (current && current !== from) throw new ListingChangedError(current);
  assertWrote(res, action);
}
