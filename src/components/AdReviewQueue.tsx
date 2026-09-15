import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { fetchVendorsByIds, type VendorSummary } from "@/lib/vendors";
import {
  Attr, AttrGrid, Badge, Button, Card, Empty, ErrorNote, Field, Modal, Note,
  Notice, ReadOnlyBanner, Select, SkeletonList, Stat, StatusBadge, Tabs, Textarea,
} from "./ui";

/**
 * Phase 4 — the ad-campaign review surface.
 *
 * This is the half of the system that did not exist. Ads.tsx was a POST-publish
 * takedown tool and said so in its own banner ("No pre-publish gate. Ads still
 * auto-publish on payment"). They now do not: the payment path lands a campaign
 * on `pending_review` and it reaches no buyer until someone here approves it.
 *
 * Every action calls a SECURITY DEFINER RPC that checks authorization inside
 * itself and RAISES on refusal. That is not a style preference — a bare
 * client-side UPDATE that RLS denies matches zero rows and PostgREST reports
 * SUCCESS, so a moderator would be told "Campaign rejected" while it kept
 * serving. `assertWrote` exists in this codebase for exactly that failure mode;
 * with the RPCs it is unnecessary, because refusal arrives as a thrown error.
 */

type QueueTab = "pending_review" | "changes_requested" | "scheduled" | "suspended";

const TABS: { id: QueueTab; label: string }[] = [
  { id: "pending_review", label: "Waiting for review" },
  { id: "changes_requested", label: "Changes requested" },
  { id: "scheduled", label: "Scheduled" },
  { id: "suspended", label: "Suspended" },
];

/**
 * Canonical reason codes. A fixed vocabulary rather than free text, because
 * Phase 8.3 reports a rejection-reason breakdown off ad_review_log and two
 * moderators typing "misleading" and "Misleading claims" would split one
 * reason into two rows. The note carries the detail.
 */
const REASON_CODES: { id: string; label: string }[] = [
  { id: "misleading_claims", label: "Misleading or unverifiable claims" },
  { id: "prohibited_content", label: "Prohibited content" },
  { id: "poor_creative", label: "Image or copy quality" },
  { id: "wrong_category", label: "Targeting does not match the product" },
  { id: "product_unavailable", label: "Promoted product is not live" },
  { id: "trademark", label: "Trademark or brand misuse" },
  { id: "fraud_review", label: "Suspected invalid traffic / fraud" },
  { id: "policy_other", label: "Other policy breach" },
];

interface QueueAd {
  id: string;
  title: string;
  placement: string | null;
  status: string;
  daily_budget: number | null;
  impressions: number;
  clicks: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  vendor_id: string;
  product_id: string | null;
  image_url: string | null;
  target_categories: unknown;
  target_cities: unknown;
  moderation_reason: string | null;
  moderated_at: string | null;
}

interface LogRow {
  id: string;
  ad_id: string;
  decision: string;
  reason_code: string | null;
  note: string | null;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
}

interface ReviewMetrics {
  window_days: number;
  queue_depth: Record<string, number>;
  oldest_waiting_hours: number | null;
  decisions: number;
  avg_hours_to_decision: number | null;
  decision_breakdown: Record<string, number>;
  rejection_reasons: Record<string, number>;
  fraud_flagged: number;
}

type ActionKind = "reject" | "changes" | "suspend";

const ACTION_COPY: Record<ActionKind, { title: string; confirm: string; blurb: string }> = {
  reject: {
    title: "Reject campaign",
    confirm: "Reject campaign",
    blurb: "The campaign will not run. The vendor is notified and cannot reactivate it themselves.",
  },
  changes: {
    title: "Request changes",
    confirm: "Request changes",
    blurb: "The vendor can edit the campaign and resubmit it for review. Say what needs to change.",
  },
  suspend: {
    title: "Suspend campaign",
    confirm: "Suspend campaign",
    blurb:
      "Stops serving immediately and marks the campaign as under investigation. Use this for a policy breach or suspected invalid traffic — not for a routine pause.",
  },
};

export default function AdReviewQueue() {
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "ads");
  const [tab, setTab] = useState<QueueTab>("pending_review");
  const [action, setAction] = useState<{ ad: QueueAd; kind: ActionKind } | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");

  const queue = useQuery({
    queryKey: ["ad-review", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisements")
        .select(
          `id, title, placement, status, daily_budget, impressions, clicks, starts_at, ends_at,
           created_at, vendor_id, product_id, image_url, target_categories, target_cities,
           moderation_reason, moderated_at`,
        )
        .eq("status", tab)
        // Oldest first. A review queue ordered newest-first starves the
        // campaign that has been waiting longest, which is the one the vendor
        // has already paid for and is most likely to complain about.
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as QueueAd[];
      const vendors = await fetchVendorsByIds(rows.map((r) => r.vendor_id));
      return { rows, vendors };
    },
  });

  /**
   * Phase 8.3 — queue depth, time to decision, rejection-reason breakdown and
   * the invalid-traffic flag count, in one aggregate off ad_review_log.
   * Deliberately computed in the database: counting statuses client-side would
   * mean fetching every campaign row just to bucket it.
   */
  const metrics = useQuery({
    queryKey: ["ad-review", "metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ad_review_metrics", { p_days: 30 });
      if (error) throw new Error(error.message);
      return data as unknown as ReviewMetrics;
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["ad-review"] });
    void qc.invalidateQueries({ queryKey: ["ads"] });
  };

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("approve_ad_campaign", { p_ad_id: id });
      if (error) throw new Error(error.message);
      return (data as string | null) ?? "active";
    },
    onSuccess: (landed) => {
      // approve_ad_campaign returns where it actually landed. A campaign whose
      // starts_at is in the future becomes 'scheduled', not 'active', and
      // saying "now live" there would be a lie the vendor could check.
      toast.success(landed === "scheduled" ? "Approved — scheduled to start" : "Approved — now live");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: async ({ id, kind, code, text }: { id: string; kind: ActionKind; code: string; text: string }) => {
      const fn =
        kind === "reject" ? "reject_ad_campaign" : kind === "changes" ? "request_ad_changes" : "suspend_ad_campaign";
      const { error } = await supabase.rpc(fn, {
        p_ad_id: id,
        p_reason_code: code,
        p_note: text.trim() || undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.kind === "reject" ? "Campaign rejected" : v.kind === "changes" ? "Changes requested" : "Campaign suspended",
      );
      setAction(null);
      setReasonCode("");
      setNote("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAction = (ad: QueueAd, kind: ActionKind) => {
    setAction({ ad, kind });
    setReasonCode("");
    setNote("");
  };

  if (queue.isLoading) return <SkeletonList rows={3} height="h-44" />;
  if (queue.error) return <ErrorNote message={(queue.error as Error).message} />;

  const { rows, vendors } = queue.data!;
  const m = metrics.data;
  const counts = m?.queue_depth ?? {};
  const rejections = Object.entries(m?.rejection_reasons ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <>
      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "ads")} />}

      <Note className="mb-4">
        <span className="font-semibold text-ink">Payment is not approval.</span> A paid campaign lands
        on <span className="font-mono text-2xs">pending_review</span> and is served to nobody until it
        is approved here. Approving a campaign whose start date is in the future lands it on{" "}
        <span className="font-mono text-2xs">scheduled</span>; a sweep promotes it when the date
        arrives. Every decision is recorded on{" "}
        <span className="font-mono text-2xs">ad_review_log</span> and cannot be edited or deleted.
      </Note>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Waiting for review"
          value={String(counts.pending_review ?? 0)}
          // The oldest wait, not the average: an average hides the one campaign
          // that has been sitting for three days behind twenty fresh ones.
          sub={
            m?.oldest_waiting_hours != null
              ? `oldest waiting ${m.oldest_waiting_hours}h`
              : undefined
          }
        />
        <Stat label="Changes requested" value={String(counts.changes_requested ?? 0)} />
        <Stat label="Scheduled" value={String(counts.scheduled ?? 0)} />
        <Stat
          label="Avg time to decision"
          value={m?.avg_hours_to_decision != null ? `${m.avg_hours_to_decision}h` : "—"}
          sub={m ? `${m.decisions} decision(s) in ${m.window_days}d` : undefined}
        />
      </div>

      {(rejections.length > 0 || (m?.fraud_flagged ?? 0) > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          {rejections.length > 0 && (
            <>
              <span className="font-semibold text-ink">Rejections ({m?.window_days}d):</span>
              {rejections.map(([code, n]) => (
                <Badge key={code} tone="neutral">
                  {code.replace(/_/g, " ")} · {n}
                </Badge>
              ))}
            </>
          )}
          {(m?.fraud_flagged ?? 0) > 0 && (
            <Badge tone="critical">{m?.fraud_flagged} campaign(s) flagged for invalid traffic</Badge>
          )}
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {rows.length === 0 ? (
        <Empty>
          {tab === "pending_review"
            ? "Nothing waiting for review."
            : `No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} campaigns.`}
        </Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <ReviewCard
              key={a.id}
              ad={a}
              vendor={vendors.get(a.vendor_id)}
              writable={writable}
              busy={approve.isPending || decide.isPending}
              onApprove={() => approve.mutate(a.id)}
              onAct={(kind) => openAction(a, kind)}
            />
          ))}
        </div>
      )}

      <Modal
        open={action !== null}
        title={action ? `${ACTION_COPY[action.kind].title} — "${action.ad.title}"` : ""}
        onClose={() => setAction(null)}
      >
        {action && (
          <>
            <p className="mb-3 text-sm text-ink-muted">{ACTION_COPY[action.kind].blurb}</p>
            <Field
              label="Reason"
              htmlFor="ad-reason-code"
              hint="A fixed code, not free text — the rejection-reason breakdown counts these, and two spellings of the same reason would split it in two."
            >
              <Select
                id="ad-reason-code"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                autoFocus
              >
                <option value="">Select a reason…</option>
                {REASON_CODES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Note to the vendor"
              htmlFor="ad-reason-note"
              hint="Optional, but this is what the vendor actually reads. Say what to change."
            >
              <Textarea
                id="ad-reason-note"
                rows={4}
                value={note}
                placeholder="What needs to change, specifically?"
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setAction(null)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={!reasonCode || decide.isPending}
                onClick={() =>
                  decide.mutate({ id: action.ad.id, kind: action.kind, code: reasonCode, text: note })
                }
              >
                {decide.isPending ? "Working…" : ACTION_COPY[action.kind].confirm}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

function jsonList(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.map(String).join(", ");
}

function ReviewCard({
  ad: a,
  vendor,
  writable,
  busy,
  onApprove,
  onAct,
}: {
  ad: QueueAd;
  vendor: VendorSummary | undefined;
  writable: boolean;
  busy: boolean;
  onApprove: () => void;
  onAct: (kind: ActionKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const startsFuture = a.starts_at ? new Date(a.starts_at).getTime() > Date.now() : false;
  const alreadyEnded = a.ends_at ? new Date(a.ends_at).getTime() <= Date.now() : false;
  const cities = jsonList(a.target_cities);

  return (
    <Card className="transition-shadow hover:shadow-card-hover">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-section font-bold text-ink">{a.title}</h3>
            <StatusBadge status={a.status} />
            {startsFuture && <Badge tone="info">starts later</Badge>}
            {alreadyEnded && <Badge tone="critical">already ended</Badge>}
            {vendor?.account_status === "suspended" && <Badge tone="critical">vendor suspended</Badge>}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <span className="font-medium text-ink">{vendor?.brand_name ?? "Unknown vendor"}</span>
            {vendor?.city && <span>{vendor.city}</span>}
          </div>

          {alreadyEnded && (
            <Notice tone="caution" className="mt-2.5 text-xs">
              This campaign's end date has already passed, so approving it would publish nothing.
              Approval is refused by the database for this reason — reject it or ask the vendor to
              reschedule.
            </Notice>
          )}

          {a.moderation_reason && (
            <Notice tone="info" className="mt-2.5 text-xs">
              <span className="font-semibold">Last decision.</span> {a.moderation_reason}
              {a.moderated_at && (
                <span className="opacity-80"> ({format(new Date(a.moderated_at), "d MMM yyyy, HH:mm")})</span>
              )}
            </Notice>
          )}

          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-2.5 text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            {open ? "Hide creative, targeting and history" : "Show creative, targeting and history"}
          </button>

          {open && (
            <div className="mt-3 space-y-3">
              {a.image_url && (
                <img
                  src={a.image_url}
                  alt={`Creative for ${a.title}`}
                  className="max-h-48 rounded-lg border border-line object-contain"
                />
              )}
              <AttrGrid cols={3}>
                <Attr label="Ad types" value={a.placement} />
                <Attr label="Daily budget" value={a.daily_budget != null ? `₹${a.daily_budget}` : null} />
                <Attr label="Promoted product" value={a.product_id ? "Linked" : "None"} />
                <Attr label="Starts" value={a.starts_at ? format(new Date(a.starts_at), "d MMM yyyy") : null} />
                <Attr label="Ends" value={a.ends_at ? format(new Date(a.ends_at), "d MMM yyyy") : null} />
                <Attr label="Target cities" value={cities} />
              </AttrGrid>
              {cities && (
                <p className="text-2xs text-ink-faint">
                  City targeting is enforced and fails closed: a buyer whose city Cosora does not know
                  will not see this campaign.
                </p>
              )}
              <DecisionHistory adId={a.id} />
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-44">
          {a.status === "pending_review" && (
            <>
              <Button variant="primary" disabled={!writable || busy || alreadyEnded} onClick={onApprove}>
                {startsFuture ? "Approve & schedule" : "Approve"}
              </Button>
              <Button disabled={!writable || busy} onClick={() => onAct("changes")}>
                Request changes
              </Button>
              <Button variant="danger" disabled={!writable || busy} onClick={() => onAct("reject")}>
                Reject
              </Button>
            </>
          )}
          {(a.status === "scheduled" || a.status === "changes_requested") && (
            <Button variant="danger" disabled={!writable || busy} onClick={() => onAct("reject")}>
              Reject
            </Button>
          )}
          {a.status !== "suspended" && (
            <Button variant="danger" disabled={!writable || busy} onClick={() => onAct("suspend")}>
              Suspend
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Append-only decision history. Read-only by construction: ad_review_log has no
 *  UPDATE or DELETE grant, so there is nothing to edit here even for a super admin.
 *  Read through admin_ad_review_log_list (admin-schema separation, Phase 3b). */
function DecisionHistory({ adId }: { adId: string }) {
  const log = useQuery({
    queryKey: ["ad-review-log", adId],
    queryFn: async () => {
      // Newest first.
      const { data, error } = await supabase.rpc("admin_ad_review_log_list", { p_ad_id: adId });
      if (error) throw new Error(error.message);
      return (data ?? []) as LogRow[];
    },
  });

  if (log.isLoading) return <p className="text-xs text-ink-faint">Loading history…</p>;
  if (log.error) return <ErrorNote message={(log.error as Error).message} />;
  const rows = log.data ?? [];
  if (rows.length === 0) return <p className="text-xs text-ink-faint">No decisions recorded yet.</p>;

  return (
    <div className="rounded-lg border border-line">
      <p className="border-b border-line px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-faint">
        Decision history
      </p>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={r.decision} dot={false} />
              <span className="text-ink-muted">
                {r.previous_status ?? "—"} → {r.new_status ?? "—"}
              </span>
              <span className="ml-auto text-ink-faint">
                {format(new Date(r.created_at), "d MMM yyyy, HH:mm")}
              </span>
            </div>
            {(r.reason_code || r.note) && (
              <p className="mt-1 text-ink-muted">
                {r.reason_code && <span className="font-mono text-2xs">{r.reason_code}</span>}
                {r.reason_code && r.note && " — "}
                {r.note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
