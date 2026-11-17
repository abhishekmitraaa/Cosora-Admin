import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import {
  Badge, Button, Card, Empty, ErrorNote, Field, Modal, Note, ReadOnlyBanner, SkeletonList, StatusBadge, Tabs, Textarea,
} from "./ui";

/**
 * Ad types the Cosora team does by hand (Mitra, 2026-11-17: "bring back all the ad types except the mobile banner and
 * the website banner … those ads will go to the admin dashboard as they will be done manually").
 *
 * Facebook & Instagram, Google Shopping, the Social Media Combo and direct messages to buyers have no slot in the app.
 * A campaign holding any of them is paid for and reviewed as usual; once approved, it waits here until someone in the
 * ads team has carried it out and marks it done, which tells the seller. Reads through admin_ad_manual_list() (super
 * admins, ads moderators, support); marking goes through admin_ad_manual_done() (super admins, ads moderators), which
 * refuses a campaign that hasn't been approved.
 */

const TYPE_LABELS: Record<string, string> = {
  fbInsta: "Facebook & Instagram",
  googleProduct: "Google Shopping",
  socialCombo: "Social Media Combo",
  directBroadcast: "Message buyers",
};

// Statuses after approval: the work can be done. Anything else is still in review.
const APPROVED = new Set(["active", "scheduled", "paused_by_vendor", "paused_by_admin", "paused", "expired", "ended"]);

type Tab = "todo" | "waiting" | "done";

interface ManualRow {
  ad_id: string;
  vendor_id: string;
  vendor_name: string | null;
  title: string | null;
  placement: string | null;
  manual_types: string[];
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  product_id: string | null;
  product_name: string | null;
  done_at: string | null;
  done_by_name: string | null;
  note: string | null;
  /** Direct Broadcast: messages per listing, as paid for (the order's spec). */
  messages: number | null;
}

function tabOf(r: ManualRow): Tab {
  if (r.done_at) return "done";
  return APPROVED.has(r.status) ? "todo" : "waiting";
}

const day = (iso: string | null) => (iso ? format(new Date(iso), "d MMM yyyy") : "—");

export default function AdManualWork() {
  const role = useRole();
  const writable = canWrite(role, "ads");
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("todo");
  const [marking, setMarking] = useState<ManualRow | null>(null);
  const [note, setNote] = useState("");

  const list = useQuery({
    queryKey: ["ad-manual-work"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_ad_manual_list");
      if (error) throw new Error(error.message);
      return (data ?? []) as ManualRow[];
    },
  });

  const mark = useMutation({
    mutationFn: async ({ id, done, text }: { id: string; done: boolean; text?: string }) => {
      const { error } = await supabase.rpc("admin_ad_manual_done", {
        p_ad: id,
        p_done: done,
        p_note: text?.trim() || undefined,
      });
      if (error) throw new Error(error.message);
      return done;
    },
    onSuccess: (done) => {
      toast.success(done ? "Marked done. The seller has been told." : "Moved back to To do.");
      setMarking(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["ad-manual-work"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (list.isLoading) return <SkeletonList rows={3} height="h-28" />;
  if (list.error) return <ErrorNote message={(list.error as Error).message} />;

  const rows = list.data ?? [];
  const counts = { todo: 0, waiting: 0, done: 0 } as Record<Tab, number>;
  for (const r of rows) counts[tabOf(r)] += 1;
  const shown = rows.filter((r) => tabOf(r) === tab);

  return (
    <div className="space-y-4" data-testid="ad-manual-work">
      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "ads")} />}
      <Note>
        These ad types run outside the app. Once a campaign is approved, set up each listed type for the seller, then
        mark it done: the seller is told and sees the date under Your Campaigns.
      </Note>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "todo", label: "To do", count: counts.todo },
          { id: "waiting", label: "In review", count: counts.waiting },
          { id: "done", label: "Done", count: counts.done },
        ]}
      />

      {shown.length === 0 ? (
        <Empty>
          {tab === "todo"
            ? "Nothing to set up. Approved campaigns with a manual ad type show here."
            : tab === "waiting"
              ? "No campaign with a manual ad type is waiting for review."
              : "Nothing marked done yet."}
        </Empty>
      ) : (
        shown.map((r) => (
          <Card key={r.ad_id}>
            <div className="flex flex-wrap items-start justify-between gap-3" data-testid="manual-row">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-ink">{r.title || "Untitled campaign"}</p>
                <p className="text-xs text-ink-muted">
                  {r.vendor_name || "Seller"}
                  {r.product_name ? ` · ${r.product_name}` : ""}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {r.manual_types.map((t) => (
                    <Badge key={t} tone="caution">
                      {TYPE_LABELS[t] ?? t}
                      {t === "directBroadcast" && r.messages ? ` · ${r.messages.toLocaleString("en-IN")} messages` : ""}
                    </Badge>
                  ))}
                  <StatusBadge status={r.status} />
                </div>
                <p className="pt-1 text-xs text-ink-faint">
                  Runs {day(r.starts_at)} – {day(r.ends_at)} · booked {day(r.created_at)}
                </p>
                {r.done_at && (
                  <p className="text-xs text-ink-muted">
                    Done {day(r.done_at)}
                    {r.done_by_name ? ` by ${r.done_by_name}` : ""}
                    {r.note ? ` — ${r.note}` : ""}
                  </p>
                )}
              </div>
              {writable && tab === "todo" && (
                <Button variant="primary" size="sm" onClick={() => { setMarking(r); setNote(""); }}>
                  Mark done
                </Button>
              )}
              {writable && tab === "done" && (
                <Button
                  size="sm"
                  disabled={mark.isPending}
                  onClick={() => mark.mutate({ id: r.ad_id, done: false })}
                >
                  Not done
                </Button>
              )}
            </div>
          </Card>
        ))
      )}

      <Modal open={marking !== null} title="Mark as done" onClose={() => setMarking(null)}>
        {marking && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              {marking.manual_types.map((t) => TYPE_LABELS[t] ?? t).join(", ")} for “{marking.title || "Untitled campaign"}”.
              The seller is told it is set up.
            </p>
            <Field label="Note (optional, staff only)" hint="Where it runs, a post link, anything the team should know." htmlFor="manual-note">
              <Textarea id="manual-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setMarking(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={mark.isPending}
                onClick={() => mark.mutate({ id: marking.ad_id, done: true, text: note })}
              >
                Mark done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
