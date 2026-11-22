/**
 * Paging and order for the moderation queues: Products, Video Closeups, Catalogues
 * (review AR-M12 / AR-M13, 2026-11-22). 50 at a time, keyset on (created_at, id) so rows
 * with the same timestamp are never skipped, and the order is the moderator's choice,
 * kept in the address: oldest first by default on "In review" (first come, first served,
 * so nothing waits past the promised 24–48 h; Mitra, "Toggle on the page"), newest first
 * on the other tabs. Index: (status, created_at, id) on each table.
 */
export const QUEUE_PAGE = 50;

export type QueueCursor = { at: string; id: string } | null;
export type QueueSort = "oldest" | "newest";
export const QUEUE_SORTS: readonly QueueSort[] = ["oldest", "newest"];

/** The default order for a tab: the review queue oldest first, everything else newest first. */
export const defaultQueueSort = (tab: string): QueueSort => (tab === "under_review" ? "oldest" : "newest");

/** The PostgREST `or` filter for rows after `cursor` in `sort` order. */
export function afterCursor(cursor: NonNullable<QueueCursor>, sort: QueueSort): string {
  const op = sort === "oldest" ? "gt" : "lt";
  return `created_at.${op}.${cursor.at},and(created_at.eq.${cursor.at},id.${op}.${cursor.id})`;
}

/** The cursor for the page after `rows`, or null when this page was the last. */
export function nextCursor<R extends { id: string; created_at: string }>(rows: R[]): QueueCursor {
  const last = rows[rows.length - 1];
  return rows.length === QUEUE_PAGE && last ? { at: last.created_at, id: last.id } : null;
}

/** All loaded pages as one list, with their lookups merged. */
export function mergeQueuePages<R, V, E>(pages: { rows: R[]; vendors: Map<string, V>; edits: Map<string, E> }[]) {
  const vendors = new Map<string, V>();
  const edits = new Map<string, E>();
  for (const p of pages) {
    for (const [k, v] of p.vendors) vendors.set(k, v);
    for (const [k, v] of p.edits) edits.set(k, v);
  }
  return { rows: pages.flatMap((p) => p.rows), vendors, edits };
}
