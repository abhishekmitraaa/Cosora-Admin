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
export async function moderateFrom(
  table: ModeratedTable,
  id: string,
  from: string,
  patch: { status: string; rejection_reason: string | null },
  action: string,
): Promise<void> {
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
