import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { sealSources } from "@/lib/trustSeal";
import { Badge, Card, Empty, ErrorNote, PageHeader, ReadOnlyBanner, Spinner, Table } from "@/components/ui";

interface VendorListRow {
  id: string;
  brand_name: string | null;
  city: string | null;
  business_type: string | null;
  onboarding_complete: boolean;
  is_verified: boolean;
  account_status: string;
  plan_id: string | null;
  plan_expires_at: string | null;
  ad_verified_until: string | null;
}

export default function Vendors() {
  const role = useRole();
  const writable = canWrite(role, "vendors");

  const vendors = useQuery({
    queryKey: ["vendors"],
    queryFn: async (): Promise<VendorListRow[]> => {
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select(
          "id, brand_name, city, business_type, onboarding_complete, is_verified, account_status, plan_id, plan_expires_at, ad_verified_until",
        )
        .order("brand_name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (vendors.isLoading) return <Spinner />;
  if (vendors.error) return <ErrorNote message={(vendors.error as Error).message} />;

  const rows = vendors.data ?? [];

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Vendors"
        subtitle="Accounts, verification and suspension. Open a vendor to review business documents."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "vendors")} />}

      {/*
        The three seal sources are shown side by side on purpose: a vendor can
        display a trust seal for reasons that have nothing to do with the admin
        flag, and "why is this one verified?" is the question this table exists
        to answer.
      */}
      <Card className="mb-4 border-slate-200 bg-slate-50">
        <p className="text-xs text-slate-600">
          <span className="font-semibold">Trust seal</span> shows when{" "}
          <span className="font-medium">any</span> of these is true: the admin flag{" "}
          <span className="font-mono text-[11px]">is_verified</span>, an active paid subscription (
          <span className="font-mono text-[11px]">plan_expires_at</span> in the future), or an
          ad-purchased seal (<span className="font-mono text-[11px]">ad_verified_until</span> in the
          future). They're independent — clearing the admin flag won't remove a seal the other two
          are granting.
        </p>
      </Card>

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
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link to={`/vendors/${v.id}`} className="font-medium text-slate-900 hover:underline">
                    {v.brand_name || "Unnamed vendor"}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-600">{v.city || "—"}</td>
                <td className="px-3 py-2 text-slate-600">{v.business_type || "—"}</td>
                <td className="px-3 py-2">
                  {v.onboarding_complete ? (
                    <Badge tone="green">complete</Badge>
                  ) : (
                    <Badge tone="amber">incomplete</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  {v.account_status === "suspended" ? (
                    <Badge tone="red">suspended</Badge>
                  ) : (
                    <Badge tone="green">active</Badge>
                  )}
                </td>
                <td className="px-3 py-2">{s.any ? <Badge tone="blue">seal</Badge> : <Badge>none</Badge>}</td>
                <td className="px-3 py-2 text-xs">
                  {s.admin ? <Badge tone="blue">verified</Badge> : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {v.plan_id ? (
                    <span className={s.subscription ? "text-slate-700" : "text-slate-400"}>
                      {v.plan_id}
                      {v.plan_expires_at && (
                        <span className="block text-[11px]">
                          {s.subscription ? "expires " : "expired "}
                          {format(new Date(v.plan_expires_at), "d MMM yyyy")}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-400">no plan</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {v.ad_verified_until ? (
                    <span className={s.ad ? "text-slate-700" : "text-slate-400"}>
                      {s.ad ? "until " : "expired "}
                      {format(new Date(v.ad_verified_until), "d MMM yyyy")}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
