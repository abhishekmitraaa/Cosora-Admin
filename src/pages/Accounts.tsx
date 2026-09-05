import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { canWrite, readOnlyReason } from "@/lib/roles";
import { useRole } from "@/hooks/useAdminSession";
import AccountStatus from "@/components/AccountStatus";
import {
  Badge,
  Card,
  Empty,
  ErrorNote,
  Input,
  Note,
  PageHeader,
  ReadOnlyBanner,
  Spinner,
  Table,
} from "@/components/ui";

interface AccountRow {
  id: string;
  full_name: string | null;
  email: string | null;
  account_status: string;
  active_role: string;
  created_at: string;
  isVendor: boolean;
  brand_name: string | null;
  /** Open suspensions. >0 means the ledger and the flag agree it is in force. */
  openSuspensions: number;
}

const MIN_QUERY = 2;
const LIMIT = 50;

/**
 * Accounts — search anyone, see their suspension state and history, act on it.
 *
 * This is the GENERALISED version of what VendorDetail does for one vendor.
 * Both screens mount the same <AccountStatus>, which calls the same
 * set_account_status() with source='admin_manual'; the review queue calls it
 * with source='chat_review' and a review id. One RPC, one ledger, three entry
 * points — not three code paths.
 *
 * It exists because suspension is not a vendor fact. `profiles.account_status`
 * covers buyers too (20260801095820 dropped the vendor-scoped column precisely
 * because the same human toggles between the two roles), and until now a buyer
 * could only be reached through a chat thread they happened to appear in. An
 * account with no chat history was unreachable.
 *
 * Deliberately search-first rather than a full listing: `profiles_select` is
 * `true`, so an unfiltered query would page the entire user table for no
 * operational reason. Nothing here needs a roster; it needs one person.
 */
export default function Accounts() {
  const role = useRole();
  const writable = canWrite(role, "accounts");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<AccountRow | null>(null);

  const trimmed = term.trim();

  const results = useQuery({
    queryKey: ["accounts", trimmed],
    enabled: trimmed.length >= MIN_QUERY,
    queryFn: async (): Promise<AccountRow[]> => {
      // `or` with two ilike filters rather than a text-search index: the table
      // is small, and adding an index is a migration this screen does not need.
      const pattern = `%${trimmed}%`;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, account_status, active_role, created_at")
        .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (error) throw new Error(error.message);

      const rows = data ?? [];
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return [];

      // Brand names and open-suspension counts, merged client-side. Both reach
      // profiles by more than one path, so a PostgREST embed is ambiguous —
      // the same reason lib/vendors.ts and lib/accounts.ts resolve by id.
      const [vendors, suspensions] = await Promise.all([
        supabase.from("vendor_profiles").select("id, brand_name").in("id", ids),
        supabase.from("account_suspensions").select("profile_id").in("profile_id", ids).eq("active", true),
      ]);
      if (vendors.error) throw new Error(vendors.error.message);
      // A support/super_admin caller can read this; anyone else gets nothing
      // back rather than an error, which would read as "never suspended".
      // openSuspensions is therefore only rendered for roles that may write.
      const brands = new Map((vendors.data ?? []).map((v) => [v.id, v.brand_name]));
      const open = new Map<string, number>();
      for (const s of suspensions.data ?? []) {
        open.set(s.profile_id, (open.get(s.profile_id) ?? 0) + 1);
      }

      return rows.map((r) => ({
        ...r,
        isVendor: brands.has(r.id),
        brand_name: brands.get(r.id) ?? null,
        openSuspensions: open.get(r.id) ?? 0,
      }));
    },
  });

  const rows = results.data ?? [];

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Accounts"
        subtitle="Suspend or reinstate any buyer or vendor account, and read the full suspension history behind it."
      />

      {!writable && <ReadOnlyBanner reason={readOnlyReason(role, "accounts")} />}

      <Note className="mb-4">
        Suspension is <span className="font-mono text-[11px]">profiles.account_status</span> and it
        is account-level: the same person sells and buys, so there is one flag, not one per role.
        Every change goes through <span className="font-mono text-[11px]">set_account_status()</span>
        , which is the only writer of the{" "}
        <span className="font-mono text-[11px]">account_suspensions</span> ledger — a direct UPDATE
        is rejected by a trigger, for every role including super admin.
      </Note>

      <Card className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-ink-muted" htmlFor="account-search">
          Search by name or email
        </label>
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <Input
            id="account-search"
            className="pl-8"
            value={term}
            autoFocus
            placeholder="e.g. anaya, or buyer@example.com"
            onChange={(e) => {
              setTerm(e.target.value);
              setSelected(null);
            }}
          />
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          At least {MIN_QUERY} characters. Shows the {LIMIT} most recent matches — narrow the term if
          what you want is not here, rather than paging.
        </p>
      </Card>

      {trimmed.length < MIN_QUERY ? (
        <Empty>Type a name or email to find an account.</Empty>
      ) : results.isLoading ? (
        <Spinner label="Searching…" />
      ) : results.error ? (
        <ErrorNote message={(results.error as Error).message} />
      ) : rows.length === 0 ? (
        <Empty>No account matches “{trimmed}”.</Empty>
      ) : (
        <Card className="mb-4">
          <Table head={["Name", "Email", "Kind", "Status", "Joined", ""]}>
            {rows.map((r) => (
              <tr key={r.id} className={selected?.id === r.id ? "bg-canvas" : undefined}>
                <td className="px-3 py-2 font-medium text-ink">
                  {r.brand_name || r.full_name || "—"}
                </td>
                <td className="px-3 py-2 text-ink-muted">{r.email ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.isVendor ? <Badge tone="blue">vendor</Badge> : <Badge>buyer</Badge>}
                </td>
                <td className="px-3 py-2">
                  {r.account_status === "suspended" ? (
                    <Badge tone="red" dot>
                      suspended
                    </Badge>
                  ) : (
                    <Badge tone="green" dot>
                      active
                    </Badge>
                  )}
                  {/*
                    A mismatch here is a real signal, not noise: the flag and the
                    ledger are written in the same function, so if they disagree
                    something wrote one without the other.
                  */}
                  {writable && r.account_status === "suspended" && r.openSuspensions === 0 && (
                    <span className="ml-1.5 text-[11px] text-amber-700">no open ledger row</span>
                  )}
                  {writable && r.account_status === "active" && r.openSuspensions > 0 && (
                    <span className="ml-1.5 text-[11px] text-amber-700">
                      {r.openSuspensions} ledger row(s) still open
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-muted">
                  {format(new Date(r.created_at), "d MMM yyyy")}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    className="text-xs text-ink-muted underline hover:text-ink"
                    onClick={() => setSelected(selected?.id === r.id ? null : r)}
                  >
                    {selected?.id === r.id ? "Hide" : "Manage"}
                  </button>
                  {r.isVendor && (
                    <Link
                      to={`/vendors/${r.id}`}
                      className="ml-3 text-xs text-ink-muted underline hover:text-ink"
                    >
                      Vendor page
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {selected && (
        <AccountStatus
          profileId={selected.id}
          name={selected.brand_name || selected.full_name || selected.email || "this account"}
          kind={selected.isVendor ? "vendor" : "buyer"}
        />
      )}
    </div>
  );
}
