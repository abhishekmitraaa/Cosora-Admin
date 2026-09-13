import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
// assertWrote is no longer imported here: every write on this page now goes
// through a review RPC that raises on refusal, so there is no silent zero-row
// UPDATE left to assert against.
import { supabase } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { fetchVendorsByIds, type VendorSummary } from "@/lib/vendors";
import FlagLog from "@/components/FlagLog";
import AdsMonitoring from "@/components/AdsMonitoring";
import AdReviewQueue from "@/components/AdReviewQueue";
import {
  Attr,
  AttrGrid,
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Modal,
  Note,
  Notice,
  Page,
  PageHeader,
  ReadOnlyBanner,
  SkeletonList,
  StatusBadge,
  Tabs,
  Textarea,
} from "@/components/ui";

type AdStatus = "active" | "paused" | "rejected" | "expired";

interface AdRow {
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
  moderation_reason: string | null;
  moderated_at: string | null;
}

const TABS: { id: AdStatus; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "rejected", label: "Rejected" },
  { id: "expired", label: "Finished" },
];

/**
 * One tab can cover several stored statuses. "Paused" covers both pauses and
 * the legacy single 'paused' value — an admin looking for paused campaigns
 * means all of them, even though only they can lift `paused_by_admin`.
 * "Finished" covers 'expired' and the legacy 'ended'.
 */
const TAB_STATUSES: Record<AdStatus, string[]> = {
  active: ["active"],
  paused: ["paused_by_admin", "paused_by_vendor", "paused"],
  rejected: ["rejected"],
  expired: ["expired", "ended"],
};

/**
 * Two views of the same section, not two sections.
 *
 * Monitoring is aggregate and read-only; moderation is per-campaign and writes.
 * They share the `ads` role gate exactly, because they read the same table -
 * nothing was added to roles.ts for this. The switch is a segmented control
 * above the page rather than a nav entry, so the rail does not grow an item
 * that leads to the same place.
 */
type View = "review" | "moderation" | "monitoring";

const SUBTITLE = "Post-publish moderation. Take down a live campaign and record why.";
const REVIEW_SUBTITLE = "Approve or reject campaigns before they reach buyers.";

export default function Ads() {
  const role = useRole();
  // `identity` is gone: moderated_by is written inside the RPCs from auth.uid(),
  // which the client cannot forge.
  const qc = useQueryClient();
  const writable = canWrite(role, "ads");
  // Review is the default landing view: it is the one that has campaigns
  // waiting on a person, and a paid vendor is waiting on each of them.
  const [view, setView] = useState<View>("review");
  const [tab, setTab] = useState<AdStatus>("active");
  const [action, setAction] = useState<{ ad: AdRow; next: "paused" | "rejected" } | null>(null);
  const [reason, setReason] = useState("");

  const ads = useQuery({
    queryKey: ["ads", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisements")
        .select(
          `id, title, placement, status, daily_budget, impressions, clicks,
           starts_at, ends_at, created_at, vendor_id, moderation_reason, moderated_at`,
        )
        .in("status", TAB_STATUSES[tab])
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as AdRow[];
      const vendors = await fetchVendorsByIds(rows.map((r) => r.vendor_id));
      return { rows, vendors };
    },
  });

  /**
   * Takedown goes through the review RPCs, not a bare UPDATE.
   *
   * The old version wrote status + moderation_reason + moderated_* in one
   * UPDATE and leaned on `assertWrote` to catch a silent RLS denial. That
   * worked, but it could not write the ad_review_log row in the same
   * transaction, so the decision history had a hole exactly where a takedown
   * happened. pause_ad_campaign_by_admin / reject_ad_campaign check
   * authorization inside themselves, RAISE on refusal, and log atomically.
   *
   * The buyer-side effect is real and immediate: active_ads() gates on
   * is_ad_eligible(), which requires status='active'.
   */
  const moderate = useMutation({
    mutationFn: async ({ id, next, why }: { id: string; next: "paused" | "rejected"; why: string }) => {
      const { error } =
        next === "paused"
          ? await supabase.rpc("pause_ad_campaign_by_admin", { p_ad_id: id, p_reason_code: why })
          : await supabase.rpc("reject_ad_campaign", { p_ad_id: id, p_reason_code: why });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.next === "paused" ? "Campaign paused" : "Campaign rejected");
      setAction(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["ads"] });
      void qc.invalidateQueries({ queryKey: ["ad-review"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("resume_ad_campaign", { p_ad_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      // resume_ad_campaign re-checks the schedule, so a campaign resumed before
      // its start date lands on 'scheduled' and a campaign that ended while
      // paused is refused outright rather than silently republished.
      toast.success("Campaign resumed");
      void qc.invalidateQueries({ queryKey: ["ads"] });
      void qc.invalidateQueries({ queryKey: ["ad-review"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const header = (
    <PageHeader
      title="Ads"
      subtitle={
        view === "review" ? REVIEW_SUBTITLE
          : view === "moderation" ? SUBTITLE
          : "Delivery and revenue across every campaign."
      }
      actions={<ViewSwitch value={view} onChange={setView} />}
    />
  );

  if (view === "monitoring") {
    return (
      <Page width="wide">
        {header}
        <AdsMonitoring />
      </Page>
    );
  }

  if (view === "review") {
    return (
      <Page>
        {header}
        <AdReviewQueue />
      </Page>
    );
  }

  if (ads.isLoading) {
    return (
      <Page>
        {header}
        <SkeletonList rows={3} height="h-40" />
      </Page>
    );
  }
  if (ads.error) return <ErrorNote message={(ads.error as Error).message} />;

  const { rows, vendors } = ads.data!;

  return (
    <Page>
      {header}

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "ads")} />}

      {/*
        This banner used to say "No pre-publish gate — ads still auto-publish on
        payment". That is no longer true, and leaving it would have been the
        most misleading sentence in the panel: a moderator would believe live
        campaigns had never been reviewed.
      */}
      <Note className="mb-4">
        <span className="font-semibold text-ink">Campaigns are reviewed before they run.</span> Paid
        campaigns land in the <span className="font-medium text-ink">Review</span> tab and reach no
        buyer until approved. This screen handles campaigns that are already live.{" "}
        <span className="font-medium text-ink">Pausing</span> stops serving immediately and, because
        it is an <span className="font-medium text-ink">admin</span> pause, the vendor{" "}
        <span className="font-medium text-ink">cannot</span> lift it themselves.{" "}
        <span className="font-medium text-ink">Rejecting</span> also stops serving and cannot be
        reactivated by the vendor. Both are recorded on{" "}
        <span className="font-mono text-2xs">ad_review_log</span>.
      </Note>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {rows.length === 0 ? (
        <Empty>No {tab} campaigns.</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <AdCard
              key={a.id}
              ad={a}
              vendor={vendors.get(a.vendor_id)}
              writable={writable}
              busy={moderate.isPending || restore.isPending}
              onAct={(next) => {
                setAction({ ad: a, next });
                setReason("");
              }}
              onRestore={() => restore.mutate(a.id)}
            />
          ))}
        </div>
      )}

      <Modal
        open={action !== null}
        title={action?.next === "paused" ? `Pause "${action?.ad.title}"` : `Reject "${action?.ad.title}"`}
        onClose={() => setAction(null)}
      >
        <p className="mb-3 text-sm text-ink-muted">
          {action?.next === "paused"
            ? "Pausing stops serving now. The vendor can resume this campaign themselves."
            : "Rejecting stops serving now. The vendor cannot reactivate it."}{" "}
          A reason is required and is recorded on the campaign.
        </p>
        <Textarea
          rows={4}
          autoFocus
          value={reason}
          placeholder="Why is this campaign being taken down?"
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setAction(null)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={!reason.trim() || moderate.isPending}
            onClick={() =>
              action && moderate.mutate({ id: action.ad.id, next: action.next, why: reason.trim() })
            }
          >
            {action?.next === "paused" ? "Pause campaign" : "Reject campaign"}
          </Button>
        </div>
      </Modal>
    </Page>
  );
}

/** Segmented control. Same shape as the theme toggle, so it reads as a switch. */
function ViewSwitch({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const options: { id: View; label: string }[] = [
    { id: "review", label: "Review" },
    { id: "moderation", label: "Moderation" },
    { id: "monitoring", label: "Monitoring" },
  ];
  return (
    <div role="radiogroup" aria-label="Ads view" className="flex gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={
            value === o.id
              ? "rounded-md bg-surface px-3 py-1 text-xs font-medium text-ink shadow-xs"
              : "rounded-md px-3 py-1 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AdCard({
  ad: a,
  vendor,
  writable,
  busy,
  onAct,
  onRestore,
}: {
  ad: AdRow;
  vendor: VendorSummary | undefined;
  writable: boolean;
  busy: boolean;
  onAct: (next: "paused" | "rejected") => void;
  onRestore: () => void;
}) {
  const [showLog, setShowLog] = useState(false);

  return (
    <Card className="transition-shadow hover:shadow-card-hover">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-section font-bold text-ink">{a.title}</h3>
            <StatusBadge status={a.status} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <span className="font-medium text-ink">{vendor?.brand_name ?? "Unknown vendor"}</span>
            {vendor?.city && <span>{vendor.city}</span>}
            {vendor?.account_status === "suspended" && (
              <Badge tone="critical">vendor suspended</Badge>
            )}
          </div>

          <AttrGrid cols={4}>
            <Attr label="Placement" value={a.placement} />
            <Attr label="Daily budget" value={a.daily_budget != null ? `₹${a.daily_budget}` : null} />
            <Attr label="Impressions" value={a.impressions.toLocaleString("en-IN")} />
            <Attr label="Clicks" value={a.clicks.toLocaleString("en-IN")} />
            <Attr label="Starts" value={a.starts_at ? format(new Date(a.starts_at), "d MMM yyyy") : null} />
            <Attr label="Ends" value={a.ends_at ? format(new Date(a.ends_at), "d MMM yyyy") : null} />
          </AttrGrid>

          {a.moderation_reason && (
            <Notice tone="critical" className="mt-2.5 text-xs">
              <span className="font-semibold">Takedown reason.</span> {a.moderation_reason}
              {a.moderated_at && (
                <span className="opacity-80">
                  {" "}
                  ({format(new Date(a.moderated_at), "d MMM yyyy, HH:mm")})
                </span>
              )}
            </Notice>
          )}
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-40">
          {(a.status === "active" || a.status === "scheduled") && (
            <>
              <Button disabled={!writable || busy} onClick={() => onAct("paused")}>
                Pause
              </Button>
              <Button variant="danger" disabled={!writable || busy} onClick={() => onAct("rejected")}>
                Reject
              </Button>
            </>
          )}
          {(a.status === "paused_by_admin" || a.status === "paused_by_vendor" || a.status === "paused") && (
            <>
              <Button variant="primary" disabled={!writable || busy} onClick={onRestore}>
                Resume
              </Button>
              <Button variant="danger" disabled={!writable || busy} onClick={() => onAct("rejected")}>
                Reject
              </Button>
            </>
          )}
          {/*
            "Restore to active" was here for rejected campaigns. It is gone on
            purpose: reject is a REVIEW DECISION, and undoing it by forcing the
            status back to 'active' would skip review entirely and leave the
            decision log saying the campaign is rejected while it served. A
            rejected campaign that should run is resubmitted by the vendor and
            re-approved in the Review tab, which records both steps.
          */}
          {a.status === "rejected" && (
            <p className="text-2xs text-ink-faint">
              Rejected. The vendor can edit and resubmit it for review.
            </p>
          )}
          <Button variant="ghost" onClick={() => setShowLog((s) => !s)}>
            {showLog ? "Hide log" : "Flag / log"}
          </Button>
        </div>
      </div>

      {showLog && (
        <div className="mt-3">
          <FlagLog entityType="ad" entityId={a.id} />
        </div>
      )}
    </Card>
  );
}
