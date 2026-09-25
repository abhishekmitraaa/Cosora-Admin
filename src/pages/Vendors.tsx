import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { fetchAccountStatuses } from "@/lib/accounts";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { sealSources } from "@/lib/trustSeal";
import { AccountStatusBadge } from "@/components/AccountStatus";
import {
  Badge,
  Empty,
  ErrorNote,
  Note,
  Page,
  PageHeader,
  ReadOnlyBanner,
  ROW_HOVER,
  SkeletonList,
  Table,
} from "@/components/ui";

interface VendorListRow {
  id: string;
  brand_name: string | null;
  city: string | null;
  business_type: string | null;
  onboarding_complete: boolean;
  is_verified: boolean;
  /**
   * From `profiles`, NOT `vendor_profiles`. Migration 20260801095820 dropped
   * `vendor_profiles.account_status` and moved suspension to
   * `profiles.account_status`, because the same human toggles between buyer and
   * vendor and a vendor-table flag cannot stop them messaging as a buyer.
   */
  account_status: string;
  plan_id: string | null;
  plan_expires_at: string | null;
  ad_verified_until: string | null;
}

const SUBTITLE = "Accounts, verification and suspension. Open a vendor to review business documents.";

/** Live dates read at full weight, lapsed ones drop back. Two states, one rule. */
const dateTone = (live: boolean) => (live ? "tabular-nums text-ink-muted" : "tabular-nums text-ink-ghost");

export default function Vendors() {
  const role = useRole();
  const writable = canWrite(role, "vendors");

  const vendors = useQuery({
    queryKey: ["vendors"],
    queryFn: async (): Promise<VendorListRow[]> => {
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select(
          "id, brand_name, city, business_type, onboarding_complete, is_verified, plan_id, plan_expires_at, ad_verified_until",
        )
        .order("brand_name", { ascending: true });
      if (error) throw new Error(error.message);
      const vendors = data ?? [];

      // Suspension lives on `profiles`, keyed by the same uuid
      // (vendor_profiles.id FKs profiles.id). Two FKs from vendor_profiles to
      // profiles would make a PostgREST embed ambiguous, so this merges
      // client-side, the same approach lib/vendors.ts already takes.
      const statuses = await fetchAccountStatuses(vendors.map((v) => v.id));
      return vendors.map((v) => ({ ...v, account_status: statuses.get(v.id) ?? "active" }));
    },
  });

  if (vendors.isLoading) {
    return (
      <Page width="wide">
        <PageHeader title="Vendors" subtitle={SUBTITLE} />
        <SkeletonList rows={1} height="h-96" />
      </Page>
    );
  }
  if (vendors.error) return <ErrorNote message={(vendors.error as Error).message} />;

  const rows = vendors.data ?? [];

  return (
    <Page width="wide">
      <PageHeader title="Vendors" subtitle={SUBTITLE} />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "vendors")} />}

      {/*
        The three seal sources are shown side by side on purpose: a vendor can
        display a trust seal for reasons that have nothing to do with the admin
        flag, and "why is this one verified?" is the question this table exists
        to answer.
      */}
      <Note className="mb-4">
        <span className="font-semibold text-ink">Trust seal</span> shows when{" "}
        <span className="font-medium text-ink">any</span> of these is true: the admin flag{" "}
        <span className="font-mono text-2xs">is_verified</span>, an active paid subscription (
        <span className="font-mono text-2xs">plan_expires_at</span> in the future), or an ad-purchased
        seal (<span className="font-mono text-2xs">ad_verified_until</span> in the future). They are
        independent, so clearing the admin flag will not remove a seal the other two are granting.
      </Note>

      {rows.length === 0 ? (
        <Empty>No vendors.</Empty>
      ) : (
        <Table
          head={[
            "Brand",
            "City",
            "Business type",
            "Onboarded",
            "Account",
            "Seal shown",
            "Admin flag",
            "Subscription",
            "Ad seal",
          ]}
        >
          {rows.map((v) => {
            const s = sealSources(v.is_verified, v.plan_expires_at, v.ad_verified_until);
            return (
              <tr key={v.id} className={ROW_HOVER}>
                <td className="px-3 py-2">
                  <Link
                    to={`/vendors/${v.id}`}
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {v.brand_name || "Unnamed vendor"}
                  </Link>
                </td>
                <td className="px-3 py-2 text-ink-muted">
                  {v.city || <span className="text-ink-ghost">not set</span>}
                </td>
                <td className="px-3 py-2 text-ink-muted">
                  {v.business_type || <span className="text-ink-ghost">not set</span>}
                </td>
                <td className="px-3 py-2">
                  {v.onboarding_complete ? (
                    <Badge tone="positive">complete</Badge>
                  ) : (
                    <Badge tone="caution">incomplete</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <AccountStatusBadge status={v.account_status} />
                </td>
                <td className="px-3 py-2">{s.any ? <Badge tone="info">seal</Badge> : <Badge>none</Badge>}</td>
                <td className="px-3 py-2 text-xs">
                  {s.admin ? (
                    <Badge tone="info">verified</Badge>
                  ) : (
                    <span className="text-ink-ghost">not set</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {v.plan_id ? (
                    <span className={s.subscription ? "text-ink-muted" : "text-ink-ghost"}>
                      {v.plan_id}
                      {v.plan_expires_at && (
                        <span className="block text-2xs tabular-nums">
                          {s.subscription ? "expires " : "expired "}
                          {format(new Date(v.plan_expires_at), "d MMM yyyy")}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-ink-ghost">no plan</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {v.ad_verified_until ? (
                    <span className={dateTone(s.ad)}>
                      {s.ad ? "until " : "expired "}
                      {format(new Date(v.ad_verified_until), "d MMM yyyy")}
                    </span>
                  ) : (
                    <span className="text-ink-ghost">none</span>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </Page>
  );
}
