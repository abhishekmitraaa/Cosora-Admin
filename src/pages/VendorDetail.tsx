import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase, assertWrote } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { sealSources } from "@/lib/trustSeal";
import AccountStatus from "@/components/AccountStatus";
import FlagLog from "@/components/FlagLog";
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  PageHeader,
  ReadOnlyBanner,
  Spinner,
} from "@/components/ui";

interface VendorDetailRow {
  id: string;
  brand_name: string | null;
  about: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  business_type: string | null;
  owner_name: string | null;
  owner_email: string | null;
  phone: string | null;
  website: string | null;
  address_line: string | null;
  area: string | null;
  postal_code: string | null;
  landmark: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  is_verified: boolean;
  account_status: string;
  onboarding_complete: boolean;
  plan_id: string | null;
  plan_expires_at: string | null;
  ad_verified_until: string | null;
}

export default function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const role = useRole();
  const qc = useQueryClient();
  const writable = canWrite(role, "vendors");

  const vendor = useQuery({
    queryKey: ["vendor", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<VendorDetailRow | null> => {
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select(
          `id, brand_name, about, city, state, country, business_type, owner_name, owner_email,
           phone, website, address_line, area, postal_code, landmark, gstin, pan, cin,
           is_verified, account_status, onboarding_complete, plan_id, plan_expires_at, ad_verified_until`,
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  /**
   * Both the verification toggle and the suspension flag are `vendor_profiles`
   * UPDATEs. The `enforce_vendor_profile_admin_fields` trigger raises 42501
   * unless the caller is super_admin/vendor_ops, so a support session that
   * reaches this write is refused by Postgres, not by the disabled button.
   */
  const update = useMutation({
    mutationFn: async (patch: { is_verified?: boolean; account_status?: string }) => {
      assertWrote(
        await supabase.from("vendor_profiles").update(patch).eq("id", id!).select("id"),
        "update vendor",
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor", id] });
      void qc.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (vendor.isLoading) return <Spinner />;
  if (vendor.error) return <ErrorNote message={(vendor.error as Error).message} />;
  if (!vendor.data) return <ErrorNote message="Vendor not found." />;

  const v = vendor.data;
  const s = sealSources(v.is_verified, v.plan_expires_at, v.ad_verified_until);
  const suspended = v.account_status === "suspended";

  return (
    <div className="max-w-4xl">
      <Link to="/vendors" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft size={14} /> All vendors
      </Link>

      <PageHeader
        title={v.brand_name || "Unnamed vendor"}
        subtitle={[v.city, v.state, v.country].filter(Boolean).join(", ") || undefined}
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "vendors")} />}

      <div className="mb-4 flex flex-wrap gap-2">
        {v.onboarding_complete ? <Badge tone="green">onboarding complete</Badge> : <Badge tone="amber">onboarding incomplete</Badge>}
        {suspended ? <Badge tone="red" dot>suspended</Badge> : <Badge tone="green" dot>active</Badge>}
        {s.any ? <Badge tone="blue">trust seal shown</Badge> : <Badge>no seal</Badge>}
      </div>

      {/* Business documents — the actual material for a manual verification call. */}
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Business documents</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Field label="GSTIN" value={v.gstin} mono />
          <Field label="PAN" value={v.pan} mono />
          <Field label="CIN" value={v.cin} mono />
          <Field label="Business type" value={v.business_type} />
          <Field label="Owner" value={v.owner_name} />
          <Field label="Owner email" value={v.owner_email} />
          <Field label="Phone" value={v.phone} />
          <Field label="Website" value={v.website} />
        </dl>

        <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Registered address
        </h3>
        <p className="text-sm text-slate-700">
          {[v.address_line, v.area, v.landmark, v.city, v.state, v.postal_code, v.country]
            .filter(Boolean)
            .join(", ") || <span className="text-slate-400">No address on file</span>}
        </p>
      </Card>

      {/* Verification — explicitly framed as one of three seal sources. */}
      <Card className="mb-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Manual verification</h2>
        <p className="mb-3 text-xs text-slate-500">
          This toggles the admin <span className="font-mono text-[11px]">is_verified</span> flag only.
          It's <span className="font-medium">additive</span> — it does not replace or remove a seal
          granted by a subscription or an ad purchase.
        </p>

        <div className="mb-3 space-y-1 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
          <SealRow label="Admin flag (is_verified)" on={s.admin} detail={s.admin ? "granted" : "not set"} />
          <SealRow
            label="Paid subscription"
            on={s.subscription}
            detail={
              v.plan_expires_at
                ? `${v.plan_id ?? "plan"} — ${s.subscription ? "expires" : "expired"} ${format(new Date(v.plan_expires_at), "d MMM yyyy")}`
                : "no plan"
            }
          />
          <SealRow
            label="Ad-purchased seal"
            on={s.ad}
            detail={
              v.ad_verified_until
                ? `${s.ad ? "until" : "expired"} ${format(new Date(v.ad_verified_until), "d MMM yyyy")}`
                : "none"
            }
          />
        </div>

        <Button
          variant={v.is_verified ? "outline" : "primary"}
          disabled={!writable || update.isPending}
          onClick={() =>
            update.mutate(
              { is_verified: !v.is_verified },
              { onSuccess: () => toast.success(v.is_verified ? "Admin verification removed" : "Vendor verified") },
            )
          }
        >
          {v.is_verified ? "Remove admin verification" : "Mark as verified"}
        </Button>

        {v.is_verified && (s.subscription || s.ad) && (
          <p className="mt-2 text-xs text-amber-700">
            Removing the admin flag will not hide this vendor's seal — their{" "}
            {s.subscription && s.ad ? "subscription and ad purchase" : s.subscription ? "active subscription" : "ad purchase"}{" "}
            still grants it.
          </p>
        )}
      </Card>

      {/*
        THE ACCOUNT-LEVEL suspension: profiles.account_status, written only by
        set_account_status(), gated to support/super_admin, audited in
        account_suspensions. This is the one that also covers buyers and that the
        chat review queue drives.

        It sits ABOVE the vendor_profiles flag below deliberately — this is the
        one to reach for. The two are genuinely different columns with different
        role gates, so they are shown separately and each says which it is.
      */}
      <div className="mb-4">
        <AccountStatus profileId={v.id} name={v.brand_name || "this vendor"} kind="vendor" />
      </div>

      {/* Suspension — scope-limited, and said so plainly. */}
      <Card className="mb-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">
          Vendor listing flag (separate from the account status above)
        </h2>

        {/*
          Honesty guard: this write is real, but it is ONLY a flag. Nothing in
          textile-spark-net reads account_status yet, so a suspended vendor's
          products and ads remain visible to buyers and an open session keeps
          working. Do not soften this copy without shipping the buyer-side change.
        */}
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">This sets a flag only, and it is not the account status.</span>{" "}
          It writes <span className="font-mono text-[11px]">vendor_profiles.account_status</span> —
          a different column from the{" "}
          <span className="font-mono text-[11px]">profiles.account_status</span> above, with a
          different role gate (vendor ops writes this one; support does not). It does{" "}
          <span className="font-medium">not</span> yet hide their products or ads from buyers, and it
          does not end an in-progress session — both require a follow-up change in textile-spark-net
          that reads this flag. Until then, treat this as a record of the decision, not as
          enforcement.
        </div>

        <Button
          variant={suspended ? "outline" : "danger"}
          disabled={!writable || update.isPending}
          onClick={() => {
            const next = suspended ? "active" : "suspended";
            if (!confirm(`Set ${v.brand_name ?? "this vendor"} to ${next}?`)) return;
            update.mutate(
              { account_status: next },
              { onSuccess: () => toast.success(`Account marked ${next}`) },
            );
          }}
        >
          {suspended ? "Reinstate account" : "Suspend account"}
        </Button>
      </Card>

      <FlagLog entityType="vendor" entityId={v.id} />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`text-sm text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>
        {value || <span className="font-sans text-slate-400">—</span>}
      </dd>
    </div>
  );
}

function SealRow({ label, on, detail }: { label: string; on: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-slate-400">{detail}</span>
        {on ? <Badge tone="green">granting</Badge> : <Badge>no</Badge>}
      </span>
    </div>
  );
}
