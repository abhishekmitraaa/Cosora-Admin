import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase, assertWrote } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useAdminSession, useRole } from "@/hooks/useAdminSession";
import { fetchVendorsByIds, type VendorSummary } from "@/lib/vendors";
import FlagLog from "@/components/FlagLog";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Modal,
  PageHeader,
  ReadOnlyBanner,
  Spinner,
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

export default function Ads() {
  const role = useRole();
  const { identity } = useAdminSession();
  const qc = useQueryClient();
  const writable = canWrite(role, "ads");
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

  if (ads.isLoading) return <Spinner />;
  if (ads.error) return <ErrorNote message={(ads.error as Error).message} />;

  const { rows, vendors } = ads.data!;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Ads"
        subtitle="Post-publish moderation. Take down a live campaign and record why."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "ads")} />}

      {/*
        Stated up front because it's a deliberate product decision, not an
        oversight: money has already changed hands by the time an ad exists, so
        there is no pre-publish approval step and none was added here.
      */}
      <Card className="mb-4 border-slate-200 bg-slate-50">
        <p className="text-xs text-slate-600">
          <span className="font-semibold">No pre-publish gate.</span> Ads still auto-publish on
          payment, exactly as before — this screen is a takedown tool for campaigns that are already
          live. <span className="font-medium">Pausing</span> stops serving immediately, but the
          vendor can resume it themselves from their dashboard.{" "}
          <span className="font-medium">Rejecting</span> also stops serving and the vendor{" "}
          <span className="font-medium">cannot</span> reactivate it (the{" "}
          <span className="font-mono text-[11px]">guard_ad_activation</span> trigger only allows
          reactivation from <span className="font-mono text-[11px]">paused</span>). Use reject for
          anything that must stay down.
        </p>
      </Card>

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
        <p className="mb-2 text-sm text-slate-600">
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
        <div className="mt-3 flex justify-end gap-2">
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
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[260px] flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-900">{a.title}</h3>
            {a.status === "active" && <Badge tone="green" dot>active</Badge>}
            {a.status === "paused" && <Badge tone="amber" dot>paused</Badge>}
            {a.status === "rejected" && <Badge tone="red" dot>rejected</Badge>}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            <span className="font-medium text-slate-800">{vendor?.brand_name ?? "Unknown vendor"}</span>
            {vendor?.city && <span>· {vendor.city}</span>}
            {vendor?.account_status === "suspended" && <Badge tone="red">vendor suspended</Badge>}
          </div>

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-4">
            <Attr label="Placement" value={a.placement} />
            <Attr label="Daily budget" value={a.daily_budget != null ? `₹${a.daily_budget}` : null} />
            <Attr label="Impressions" value={String(a.impressions)} />
            <Attr label="Clicks" value={String(a.clicks)} />
            <Attr label="Starts" value={a.starts_at ? format(new Date(a.starts_at), "d MMM yyyy") : null} />
            <Attr label="Ends" value={a.ends_at ? format(new Date(a.ends_at), "d MMM yyyy") : null} />
          </dl>

          {a.moderation_reason && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              <span className="font-medium">Takedown reason:</span> {a.moderation_reason}
              {a.moderated_at && (
                <span className="text-red-600"> · {format(new Date(a.moderated_at), "d MMM yyyy, HH:mm")}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
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
          <Button onClick={() => setShowLog((s) => !s)}>{showLog ? "Hide log" : "Flag / log"}</Button>
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

function Attr({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="inline text-slate-400">{label}: </dt>
      <dd className="inline text-slate-700">{value || "—"}</dd>
    </div>
  );
}
