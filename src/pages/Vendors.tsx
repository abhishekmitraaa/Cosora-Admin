import { useEffect, useState } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import { useDebounced } from "@/hooks/useDebounced";
import { sealSources } from "@/lib/trustSeal";
import { AccountStatusBadge } from "@/components/AccountStatus";
import {
  Badge,
  Button,
  Empty,
  ErrorNote,
  Field,
  Input,
  Note,
  Page,
  PageHeader,
  ReadOnlyBanner,
  ROW_HOVER,
  Select,
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
  /** The keyset the next page starts after (lower-cased brand name, then id). */
  sort_key: string;
}

type Onboarding = "all" | "complete" | "incomplete";
const PAGE = 50;

const SUBTITLE = "Accounts, verification and suspension. Open a vendor to review business documents.";

/** Live dates read at full weight, lapsed ones drop back. Two states, one rule. */
const dateTone = (live: boolean) => (live ? "tabular-nums text-ink-muted" : "tabular-nums text-ink-ghost");

export default function Vendors() {
  const role = useRole();
  const writable = canWrite(role, "vendors");

  // The search and the filter live in the address (replaced, not pushed), so Back from a vendor, a refresh or a shared
  // link brings the same list back (AR-M04).
  const [params, setParams] = useSearchParams();
  const onboarding = (["complete", "incomplete"].includes(params.get("onboarding") ?? "") ? params.get("onboarding") : "all") as Onboarding;
  const [typed, setTyped] = useState(params.get("q") ?? "");
  const search = useDebounced(typed.trim(), 300);
  useEffect(() => {
    if ((params.get("q") ?? "") === search) return;
    const next = new URLSearchParams(params);
    if (search) next.set("q", search);
    else next.delete("q");
    setParams(next, { replace: true });
  }, [search, params, setParams]);
  const setOnboarding = (v: Onboarding) => {
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("onboarding");
    else next.set("onboarding", v);
    setParams(next, { replace: true });
  };

  // Pages of 50 from the database, with the account's status in the same call (AR-H09). It used to read every vendor
  // into the browser, 1,000 at a time, and then ask for statuses 100 at a time: 82 requests for 6,779 vendors, a
  // 272,708 px page, and all of it again on every Back.
  const vendors = useInfiniteQuery({
    queryKey: ["vendors", search, onboarding],
    initialPageParam: null as { key: string; id: string } | null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: async ({ pageParam }): Promise<VendorListRow[]> => {
      const { data, error } = await supabase.rpc("admin_vendor_list" as never, {
        p_search: search || null,
        p_onboarding: onboarding,
        p_after_brand: pageParam?.key ?? null,
        p_after_id: pageParam?.id ?? null,
        p_limit: PAGE,
      } as never);
      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as unknown as VendorListRow[];
    },
    getNextPageParam: (last) => {
      const row = last[last.length - 1];
      return last.length === PAGE && row ? { key: row.sort_key, id: row.id } : undefined;
    },
  });

  if (vendors.isPending && !vendors.data) {
    return (
      <Page width="wide">
        <PageHeader title="Vendors" subtitle={SUBTITLE} />
        <SkeletonList rows={1} height="h-96" />
      </Page>
    );
  }
  const rows = vendors.data?.pages.flat() ?? [];

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

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="vendor-search" className="w-72 max-w-full">
          <Input
            id="vendor-search"
            type="search"
            maxLength={100}
            placeholder="Brand, city or GSTIN"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </Field>
        <Field label="Onboarding" htmlFor="vendor-onboarding" className="w-44">
          <Select id="vendor-onboarding" value={onboarding} onChange={(e) => setOnboarding(e.target.value as Onboarding)}>
            <option value="all">All</option>
            <option value="complete">Complete</option>
            <option value="incomplete">Incomplete</option>
          </Select>
        </Field>
      </div>

      {vendors.error ? (
        <ErrorNote message={(vendors.error as Error).message} />
      ) : rows.length === 0 ? (
        <Empty>{search || onboarding !== "all" ? "No vendor matches." : "No vendors."}</Empty>
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
      {vendors.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" disabled={vendors.isFetchingNextPage} onClick={() => void vendors.fetchNextPage()}>
            {vendors.isFetchingNextPage ? "Loading…" : "Load more vendors"}
          </Button>
        </div>
      )}
    </Page>
  );
}
