import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { fetchParticipants, participantLabel, resolveSides, type Participant } from "@/lib/chat";
import {
  Badge,
  Empty,
  ErrorNote,
  Field,
  Input,
  Note,
  Page,
  PageHeader,
  ROW_HOVER,
  SkeletonList,
  Table,
  Tabs,
} from "@/components/ui";

interface ConversationRow {
  id: string;
  status: string;
  last_message: string | null;
  last_message_at: string;
  user_a: string;
  user_b: string;
}

type Filter = "all" | "under_review" | "active";

const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "All chats" },
  { id: "under_review", label: "Under review" },
  { id: "active", label: "Active" },
];

const PAGE_LIMIT = 200;

const SUBTITLE =
  "Every buyer and vendor conversation on Cosora. Open one to read the thread; it is read-only here.";

/**
 * `.or()` takes a comma-separated filter string, so a comma, paren or quote in
 * the search term would change the meaning of the query rather than be searched
 * for. Stripped rather than escaped — none of them appear in a name or an email
 * anyone is realistically looking for.
 */
function safeTerm(raw: string): string {
  return raw.replace(/[,()"]/g, " ").trim();
}

export default function Chats() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Filter>("all");
  const term = safeTerm(search);

  const chats = useQuery({
    queryKey: ["chats", term, tab],
    // conversations IS in the realtime publication now, but this repo has no
    // realtime subscriptions anywhere and building that for one list would be a
    // new pattern for its own sake. A focus refetch covers the actual need
    // (a chat locked while an admin was in another tab). Note the global default
    // is refetchOnWindowFocus: false — this override is deliberate.
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Search resolves to participant ids first: the searchable identity lives
      // on `profiles`, not on the conversation. admin_profile_search() matches
      // name or email (contains) or an exact id; it is an admin-gated RPC
      // because profiles.email is not client-selectable (MPF-3).
      let matchedIds: string[] | null = null;
      if (term.length >= 2) {
        const { data, error } = await supabase.rpc("admin_profile_search", { p_term: term, p_limit: 500 });
        if (error) throw new Error(error.message);
        matchedIds = (data ?? []).map((p) => p.id);
        if (matchedIds.length === 0) return { rows: [] as ConversationRow[], people: new Map<string, Participant>() };
      }

      let query = supabase
        .from("conversations")
        .select("id, status, last_message, last_message_at, user_a, user_b")
        .order("last_message_at", { ascending: false })
        .limit(PAGE_LIMIT);

      if (tab !== "all") query = query.eq("status", tab);
      if (matchedIds) {
        const list = matchedIds.join(",");
        query = query.or(`user_a.in.(${list}),user_b.in.(${list})`);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as ConversationRow[];
      const people = await fetchParticipants(rows.flatMap((c) => [c.user_a, c.user_b]));
      return { rows, people };
    },
  });

  if (chats.isLoading) {
    return (
      <Page width="wide">
        <PageHeader title="Chats" subtitle={SUBTITLE} />
        <SkeletonList rows={1} height="h-96" />
      </Page>
    );
  }
  if (chats.error) return <ErrorNote message={(chats.error as Error).message} />;

  const { rows, people } = chats.data!;

  return (
    <Page width="wide">
      <PageHeader title="Chats" subtitle={SUBTITLE} />

      <Note className="mb-4">
        Admins can <span className="font-medium text-ink">read</span> conversations and messages.
        Nothing on this screen can send, edit or delete a message, and participants are not told an
        admin opened their chat. A chat marked{" "}
        <span className="font-medium text-ink">under review</span> is locked for its participants
        until the{" "}
        <Link to="/chat-review" className="font-medium underline">
          review queue
        </Link>{" "}
        resolves it.
      </Note>

      <div className="mb-4 max-w-sm">
        <Field
          label="Find a conversation"
          htmlFor="chat-search"
          hint={search.trim().length === 1 ? undefined : "Participant name, email address or profile id."}
          error={search.trim().length === 1 ? "Type at least 2 characters." : null}
        >
          <Input
            id="chat-search"
            placeholder="anaya, buyer@example.com, or a uuid"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {rows.length === 0 ? (
        <Empty>
          {term ? `No conversation involves an account matching "${search}".` : "No conversations yet."}
        </Empty>
      ) : (
        <>
          <Table head={["Participants", "Status", "Last message", "Activity"]}>
            {rows.map((c) => {
              const sides = resolveSides(c.user_a, c.user_b, people);
              const a = people.get(c.user_a);
              const b = people.get(c.user_b);
              return (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/chats/${c.id}`)}
                  className={`cursor-pointer ${ROW_HOVER}`}
                >
                  <td className="px-3 py-2">
                    <Link
                      to={`/chats/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-ink hover:underline"
                    >
                      {participantLabel(a, c.user_a)} ↔ {participantLabel(b, c.user_b)}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
                      {sides.resolved ? (
                        <>
                          <span>buyer: {participantLabel(sides.buyer, sides.buyerId!)}</span>
                          <span>· vendor: {participantLabel(sides.vendor, sides.vendorId!)}</span>
                        </>
                      ) : (
                        <span>sides unresolved: neither or both hold a vendor profile</span>
                      )}
                      {a?.account_status === "suspended" && <Badge tone="critical">A suspended</Badge>}
                      {b?.account_status === "suspended" && <Badge tone="critical">B suspended</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {c.status === "under_review" ? (
                      <Badge tone="caution" dot>under review</Badge>
                    ) : (
                      <Badge tone="positive" dot>active</Badge>
                    )}
                  </td>
                  <td className="max-w-[22rem] px-3 py-2 text-ink-muted">
                    <span className="line-clamp-2">
                      {c.last_message || <span className="text-ink-ghost">no messages</span>}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-faint">
                    {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })}
                  </td>
                </tr>
              );
            })}
          </Table>

          {rows.length === PAGE_LIMIT && (
            <Note className="mt-3">
              Showing the {PAGE_LIMIT} most recently active conversations. Narrow this with the
              search box: older chats are not below, they are not loaded.
            </Note>
          )}
        </>
      )}
    </Page>
  );
}
