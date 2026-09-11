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
import VendorKycPanel, { useVendorKycDocs, kycSummary } from "@/components/VendorKycPanel";
import VendorContractPanel from "@/components/VendorContractPanel";
import FlagLog from "@/components/FlagLog";
import {
  Badge,
  Button,
  DataField,
  ErrorNote,
  Notice,
  Page,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  SkeletonList,
  Stack,
  SubHeading,
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

  // KYC is read here as well as inside the panel so the seal card can show it
  // as CONTEXT for the human making the verification call. React Query dedupes
  // the two subscriptions to one request.
  const kycDocs = useVendorKycDocs(id);

  const vendor = useQuery({
    queryKey: ["vendor", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<VendorDetailRow | null> => {
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select(
          `id, brand_name, about, city, state, country, business_type, owner_name, owner_email,
           phone, website, address_line, area, postal_code, landmark, gstin, pan, cin,
           is_verified, onboarding_complete, plan_id, plan_expires_at, ad_verified_until`,
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  /**
   * Verification is the ONLY admin field left on `vendor_profiles`.
   * `enforce_vendor_profile_admin_fields` raises 42501 unless the caller is
   * super_admin/vendor_ops, so a support session that reaches this write is
   * refused by Postgres, not by the disabled button.
   *
   * Suspension is NOT here. It lives on `profiles.account_status` and is written
   * only by set_account_status() - see the <AccountStatus> card below.
   */
  const update = useMutation({
    mutationFn: async (patch: { is_verified?: boolean }) => {
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

  if (vendor.isLoading) {
    return (
      <Page>
        <SkeletonList rows={3} height="h-40" />
      </Page>
    );
  }
  if (vendor.error) return <ErrorNote message={(vendor.error as Error).message} />;
  if (!vendor.data) return <ErrorNote message="Vendor not found." />;

  const v = vendor.data;
  const s = sealSources(v.is_verified, v.plan_expires_at, v.ad_verified_until);

  return (
    <Page>
      <Link
        to="/vendors"
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> All vendors
      </Link>

      <PageHeader
        title={v.brand_name || "Unnamed vendor"}
        subtitle={[v.city, v.state, v.country].filter(Boolean).join(", ") || undefined}
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "vendors")} />}

      <div className="mb-4 flex flex-wrap gap-2">
        {v.onboarding_complete ? (
          <Badge tone="positive">onboarding complete</Badge>
        ) : (
          <Badge tone="caution">onboarding incomplete</Badge>
        )}
        {/* Suspension state is NOT badged here. It is not a vendor_profiles fact
            any more, and the <AccountStatus> card below reads and renders it
            from profiles - one query, one badge, no chance of the two disagreeing. */}
        {s.any ? <Badge tone="info">trust seal shown</Badge> : <Badge>no seal</Badge>}
      </div>

      <Stack>
        {/* Business documents - the actual material for a manual verification call. */}
        <Panel title="Business documents">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <DataField label="GSTIN" value={v.gstin} mono />
            <DataField label="PAN" value={v.pan} mono />
            <DataField label="CIN" value={v.cin} mono />
            <DataField label="Business type" value={v.business_type} />
            <DataField label="Owner" value={v.owner_name} />
            <DataField label="Owner email" value={v.owner_email} />
            <DataField label="Phone" value={v.phone} />
            <DataField label="Website" value={v.website} />
          </dl>

          <SubHeading className="mb-1.5 mt-5">Registered address</SubHeading>
          <p className="text-sm text-ink">
            {[v.address_line, v.area, v.landmark, v.city, v.state, v.postal_code, v.country]
              .filter(Boolean)
              .join(", ") || <span className="text-ink-ghost">No address on file</span>}
          </p>
        </Panel>

        <VendorKycPanel vendorId={v.id} />

        <VendorContractPanel vendorId={v.id} />

        {/* Verification - explicitly framed as one of three seal sources. */}
        <Panel
          title="Manual verification"
          description={
            <>
              This toggles the admin <span className="font-mono text-2xs">is_verified</span> flag only.
              It is <span className="font-medium text-ink">additive</span>: it does not replace or
              remove a seal granted by a subscription or an ad purchase.
            </>
          }
        >
          <div className="mb-4 divide-y divide-line rounded-xl border border-line bg-surface-2 px-3">
            <SealRow label="Admin flag (is_verified)" on={s.admin} detail={s.admin ? "granted" : "not set"} />
            <SealRow
              label="Paid subscription"
              on={s.subscription}
              detail={
                v.plan_expires_at
                  ? `${v.plan_id ?? "plan"}, ${s.subscription ? "expires" : "expired"} ${format(new Date(v.plan_expires_at), "d MMM yyyy")}`
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
            {/* CONTEXT, NOT A SOURCE. Approving KYC deliberately does not grant
                the seal: that would make a silent fourth source and this card
                would stop describing what buyers actually see. It sits here
                because "have we seen their PAN?" is the question a human asks
                before pressing the button below. */}
            <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span className="text-ink-muted">KYC documents</span>
              <span className="flex items-center gap-2">
                <span className="text-ink-faint">
                  {kycDocs.isLoading ? "loading…" : "does not grant a seal"}
                </span>
                <Badge tone={kycSummary(kycDocs.data).tone}>{kycSummary(kycDocs.data).label}</Badge>
              </span>
            </div>
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
            <Notice tone="caution" className="mt-3 text-xs">
              Removing the admin flag will not hide this vendor's seal. Their{" "}
              {s.subscription && s.ad
                ? "subscription and ad purchase"
                : s.subscription
                  ? "active subscription"
                  : "ad purchase"}{" "}
              still grants it.
            </Notice>
          )}
        </Panel>

        {/*
          Suspension for this vendor. `profiles.account_status`, written only by
          set_account_status(), gated to support/super_admin, audited in
          account_suspensions.

          There used to be a second control below this one writing
          `vendor_profiles.account_status`. That column was DROPPED by migration
          20260801095820 and this page kept selecting and updating it, so the whole
          screen 400'd. It is gone: there is one suspension, it is account-level,
          and this card is it. Buyers and vendors share it, because the same human
          is both.
        */}
        <AccountStatus profileId={v.id} name={v.brand_name || "this vendor"} kind="vendor" />

        <FlagLog entityType="vendor" entityId={v.id} />
      </Stack>
    </Page>
  );
}

function SealRow({ label, on, detail }: { label: string; on: boolean; detail: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
      <span className="text-ink-muted">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-ink-faint">{detail}</span>
        {on ? <Badge tone="positive">granting</Badge> : <Badge>no</Badge>}
      </span>
    </div>
  );
}
