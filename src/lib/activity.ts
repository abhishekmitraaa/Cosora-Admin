import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "./supabase";

/**
 * What each admin looks at (2026-10-13; buyer repo migration 20261013100100_admin_activity_views).
 *
 * The Admin Log records what admins change. This records what they open: every page of the
 * panel (`page`) and every single record (`record`: a vendor, a support request, a chat).
 * Super admins and managers read it on the Admin Log's Activity tab.
 *
 * public.admin_activity_record() takes the admin, role and name from the session, so nothing
 * here can record a view for someone else, and it records the same view once a minute. Page
 * visits are deleted after 180 days by a daily job; record views are kept.
 *
 * Recording must never get in the way of the work: a failure is logged to the console and
 * otherwise ignored. The staff notice (activityNotice.ts) says this is recorded; change the two
 * together.
 */

async function record(args: {
  p_kind: "page" | "record";
  p_path: string;
  p_target_table?: string;
  p_target_id?: string;
  p_label?: string;
}): Promise<void> {
  try {
    const { error } = await supabase.rpc("admin_activity_record", args);
    if (error) console.warn("[activity] not recorded:", error.message);
  } catch (e) {
    console.warn("[activity] not recorded:", e);
  }
}

/** Records each page of the panel as it is opened. Mounted once, in the Shell. */
export function useRecordPageViews(enabled: boolean): void {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!enabled) return;
    void record({ p_kind: "page", p_path: pathname });
  }, [enabled, pathname]);
}

/**
 * Records that one record was opened, once its id is known.
 * `table` is the table the record lives in, as the Admin Log names it (`public.vendor_profiles`).
 */
export function useRecordView(table: string, id: string | null | undefined, label?: string | null): void {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!id) return;
    void record({
      p_kind: "record",
      p_path: pathname,
      p_target_table: table,
      p_target_id: id,
      p_label: label ?? undefined,
    });
    // The label is a caption, not part of what was opened: a late-arriving name must not
    // record the view a second time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, id, pathname]);
}
