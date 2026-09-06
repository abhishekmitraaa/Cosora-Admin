import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase, assertWrote } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useAdminSession, useRole } from "@/hooks/useAdminSession";
import { fetchVendorsByIds, type VendorSummary } from "@/lib/vendors";
import FlagLog from "@/components/FlagLog";
import AdsMonitoring from "@/components/AdsMonitoring";
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

type AdStatus = "active" | "paused" | "rejected";

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
];

/**
 * Two views of the same section, not two sections.
 *
 * Monitoring is aggregate and read-only; moderation is per-campaign and writes.
 * They share the `ads` role gate exactly, because they read the same table -
 * nothing was added to roles.ts for this. The switch is a segmented control
 * above the page rather than a nav entry, so the rail does not grow an item
 * that leads to the same place.
 */
type View = "moderation" | "monitoring";

const SUBTITLE = "Post-publish moderation. Take down a live campaign and record why.";

export default function Ads() {
  const role = useRole();
  const { identity } = useAdminSession();
  const qc = useQueryClient();
  const writable = canWrite(role, "ads");
  const [view, setView] = useState<View>("moderation");
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
        .eq("status", tab)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as AdRow[];
      const vendors = await fetchVendorsByIds(rows.map((r) => r.vendor_id));
      return { rows, vendors };
    },
  });

  /**
   * Takedown = a status change plus the recorded reason, in one UPDATE.
   * `enforce_ads_moderation` raises 42501 unless the caller is
   * super_admin/ads_moderator (for both the status AND the reason columns), so
   * the DB is the gate here too.
   *
   * The buyer-side effect is real and immediate: the `active_ads` RPC serves
   * only status='active', and ad_impression/ad_click no-op on anything else.
   */
  const moderate = useMutation({
    mutationFn: async ({ id, next, why }: { id: string; next: "paused" | "rejected"; why: string }) => {
      assertWrote(
        await supabase
          .from("advertisements")
          .update({
            status: next,
            moderation_reason: why,
            moderated_at: new Date().toISOString(),
            moderated_by: identity?.id ?? null,
          })
          .eq("id", id)
          .select("id"),
        `${next === "paused" ? "pause" : "reject"} campaign`,
      );
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.next === "paused" ? "Campaign paused" : "Campaign rejected");
      setAction(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["ads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      assertWrote(
        await supabase.from("advertisements").update({ status: "active" }).eq("id", id).select("id"),
        "restore campaign",
      );
    },
    onSuccess: () => {
      toast.success("Campaign restored to active");
      void qc.invalidateQueries({ queryKey: ["ads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const header = (
    <PageHeader
      title="Ads"
      subtitle={view === "moderation" ? SUBTITLE : "Delivery and revenue across every campaign."}
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
        Stated up front because it's a deliberate product decision, not an
        oversight: money has already changed hands by the time an ad exists, so
        there is no pre-publish approval step and none was added here.
      */}
      <Note className="mb-4">
        <span className="font-semibold text-ink">No pre-publish gate.</span> Ads still auto-publish on
        payment, exactly as before. This screen is a takedown tool for campaigns that are already
        live. <span className="font-medium text-ink">Pausing</span> stops serving immediately, but the
        vendor can resume it themselves from their dashboard.{" "}
        <span className="font-medium text-ink">Rejecting</span> also stops serving and the vendor{" "}
        <span className="font-medium text-ink">cannot</span> reactivate it (the{" "}
        <span className="font-mono text-2xs">guard_ad_activation</span> trigger only allows
        reactivation from <span className="font-mono text-2xs">paused</span>). Use reject for anything
        that must stay down.
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
          {a.status === "active" && (
            <>
              <Button disabled={!writable || busy} onClick={() => onAct("paused")}>
                Pause
              </Button>
              <Button variant="danger" disabled={!writable || busy} onClick={() => onAct("rejected")}>
                Reject
              </Button>
            </>
          )}
          {a.status === "paused" && (
            <>
              <Button variant="primary" disabled={!writable || busy} onClick={onRestore}>
                Resume
              </Button>
              <Button variant="danger" disabled={!writable || busy} onClick={() => onAct("rejected")}>
                Reject
              </Button>
            </>
          )}
          {a.status === "rejected" && (
            <Button variant="primary" disabled={!writable || busy} onClick={onRestore}>
              Restore to active
            </Button>
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
