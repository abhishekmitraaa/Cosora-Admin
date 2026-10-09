import { useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Badge, Button, Empty, ErrorNote, Field, Modal, Note, Page, PageHeader, Panel, ROW_HOVER, Select, SkeletonList, Stack, Table,
  Tabs, Textarea,
} from "@/components/ui";
import { useRole } from "@/hooks/useAdminSession";
import {
  LEVEL_LABEL, WINDOW_LABEL, amAssign, amCallbackSet, amMarkRead, amNote, amSend, useAmConcierge, useAmManagers,
  useAmRefresh, useAmVendor, useAmVendors, type AmFilter, type AmVendorRow,
} from "@/lib/accountManagers";

/**
 * My vendors (subscriptions P9, 2026-10-09): an account manager's workspace. The vendors the
 * caller looks after (named for them, or the shared team), with their plan, renewal, unread
 * messages, a call they asked for, their CRM pipeline and, on VIP, whether this month's success
 * review is written. Opening one shows the thread, the call requests, the VIP concierge (recent
 * requirements to pick for them) and the reviews, and lets a manager name who looks after them.
 * The database decides who may see and write each vendor (admin_am_*).
 */

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function VendorDetail({ vendorId, onClose }: { vendorId: string; onClose: () => void }) {
  const role = useRole();
  const refresh = useAmRefresh();
  const detail = useAmVendor(vendorId);
  const d = detail.data;
  const vip = d?.level === "vip";
  const concierge = useAmConcierge(vendorId, vip);
  const managers = useAmManagers();
  const canAssign = role === "super_admin" || role === "manager";
  const [body, setBody] = useState("");
  const [review, setReview] = useState("");
  const [pick, setPick] = useState<{ rfqId: string; title: string } | null>(null);
  const [pickNote, setPickNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // Opening the thread reads it.
  const unreadFrom = d?.messages.filter((m) => m.author_kind === "vendor").length ?? 0;
  useEffect(() => {
    if (!vendorId) return;
    amMarkRead(vendorId).then(() => refresh()).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, unreadFrom]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [d?.messages.length]);

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    if (busy) return false;
    setBusy(key);
    try {
      await fn();
      await refresh();
      if (done) toast.success(done);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const month = format(new Date(), "yyyy-MM");
  const reviewDone = d?.notes.some((n) => n.kind === "success_review" && n.period?.startsWith(month));

  return (
    <Modal open title={d?.brand_name ?? "Vendor"} onClose={onClose} width="lg">
      {detail.isPending ? (
        <SkeletonList rows={3} height="h-10" />
      ) : detail.error ? (
        <ErrorNote message={(detail.error as Error).message} />
      ) : d ? (
        <div className="space-y-5 text-sm" data-testid="am-vendor-detail">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            {d.level !== "none" && <Badge tone={vip ? "critical" : d.level === "named" ? "caution" : "info"}>{LEVEL_LABEL[d.level]}</Badge>}
            <span>{d.manager_name ? `Named manager: ${d.manager_name}` : "Shared account team"}</span>
            <span className="text-ink-faint">{`· your replies are signed “${d.you_sign_as}”`}</span>
          </div>

          {/* Messages */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Messages</h3>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-line bg-surface-2 p-3" data-testid="am-thread">
              {d.messages.length === 0 && <p className="text-xs text-ink-faint">No messages yet.</p>}
              {d.messages.map((m) => (
                <div key={m.id} className={m.author_kind === "staff" ? "ml-8" : "mr-8"}>
                  <div className={`rounded-lg px-3 py-2 ${m.author_kind === "staff" ? "bg-brand/10" : "bg-surface"}`}>
                    <p className="whitespace-pre-wrap text-ink" data-no-translate>{m.body}</p>
                  </div>
                  <p className="mt-0.5 text-2xs text-ink-faint">
                    {m.author_kind === "staff" ? `${m.author_name ?? m.author_label} (as “${m.author_label}”)` : m.author_label}
                    {" · "}{format(new Date(m.created_at), "d MMM, HH:mm")}
                  </p>
                </div>
              ))}
              <div ref={end} />
            </div>
            <div className="mt-2 flex gap-2">
              <Textarea aria-label="Reply" rows={2} maxLength={4000} placeholder="Write to the vendor" value={body} onChange={(e) => setBody(e.target.value)} />
              <Button variant="primary" disabled={!body.trim() || busy === "send"} data-testid="am-send"
                onClick={async () => { if (await run("send", () => amSend(vendorId, body.trim()))) setBody(""); }}>
                Send
              </Button>
            </div>
          </section>

          {/* Calls */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Call requests</h3>
            {d.callbacks.length === 0 ? <p className="text-xs text-ink-faint">None.</p> : (
              <ul className="space-y-1.5">
                {d.callbacks.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                    <span className="font-medium text-ink">{format(new Date(`${c.date}T00:00:00`), "EEE d MMM")}</span>
                    <span className="text-xs text-ink-muted">{WINDOW_LABEL[c.window]} IST</span>
                    {c.note && <span className="text-xs text-ink-muted" data-no-translate>· {c.note}</span>}
                    <span className="ml-auto flex items-center gap-1.5">
                      {c.status === "requested" ? (
                        <>
                          <Button size="sm" disabled={busy === c.id} onClick={() => run(c.id, () => amCallbackSet(c.id, "missed"), "Marked missed; the vendor is told")}>Couldn't reach</Button>
                          <Button size="sm" variant="primary" disabled={busy === c.id} data-testid="am-callback-done"
                            onClick={() => run(c.id, () => amCallbackSet(c.id, "done"), "Call marked done")}>Done</Button>
                        </>
                      ) : <Badge tone={c.status === "done" ? "positive" : c.status === "missed" ? "caution" : "neutral"}>{c.status}</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* VIP: concierge and reviews */}
          {vip && (
            <section data-testid="am-concierge">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Sales concierge: new requirements in their categories</h3>
              {concierge.isPending ? <SkeletonList rows={2} height="h-8" /> : (concierge.data ?? []).length === 0 ? (
                <p className="text-xs text-ink-faint">Nothing new in the last 72 hours.</p>
              ) : (
                <ul className="space-y-1.5">
                  {(concierge.data ?? []).map((r) => (
                    <li key={r.rfq_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-ink" data-no-translate>{r.title}</span>
                      <span className="text-xs text-ink-muted">{[r.category, r.quantity ? `${r.quantity} units` : null].filter(Boolean).join(" · ")}</span>
                      {r.overseas && <Badge tone="info">overseas</Badge>}
                      {r.quoted && <Badge tone="positive">quoted</Badge>}
                      {r.noted ? <Badge>picked</Badge> : (
                        <Button size="sm" onClick={() => { setPick({ rfqId: r.rfq_id, title: r.title }); setPickNote(""); }}>Pick for them</Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {pick && (
                <div className="mt-2 rounded-lg border border-line p-3">
                  <p className="mb-1 text-xs text-ink-muted">Why this one suits them (they read it on their Account manager page):</p>
                  <p className="mb-2 truncate text-xs font-medium text-ink" data-no-translate>{pick.title}</p>
                  <Textarea aria-label="Concierge note" rows={2} maxLength={4000} value={pickNote} onChange={(e) => setPickNote(e.target.value)} />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => setPick(null)}>Cancel</Button>
                    <Button size="sm" variant="primary" disabled={!pickNote.trim() || busy === "pick"} data-testid="am-pick-send"
                      onClick={async () => { if (await run("pick", () => amNote(vendorId, "concierge", pickNote.trim(), pick.rfqId), "Sent to the vendor")) setPick(null); }}>
                      Send
                    </Button>
                  </div>
                </div>
              )}

              <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Monthly success review</h3>
              {reviewDone ? <Note>This month's review is written.</Note> : (
                <>
                  <Textarea aria-label="Success review" rows={3} maxLength={4000}
                    placeholder="How the month went (quotes, wins, response time) and what to do next" value={review} onChange={(e) => setReview(e.target.value)} />
                  <Button className="mt-2" size="sm" variant="primary" disabled={!review.trim() || busy === "review"} data-testid="am-review-send"
                    onClick={async () => { if (await run("review", () => amNote(vendorId, "success_review", review.trim()), "Review sent")) setReview(""); }}>
                    Send this month's review
                  </Button>
                </>
              )}
              {d.notes.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs">
                  {d.notes.map((n) => (
                    <li key={n.id} className="rounded-lg bg-surface-2 px-3 py-2">
                      <span className="font-medium text-ink">{n.kind === "concierge" ? "Picked requirement" : `Review ${n.period ? format(new Date(`${n.period}T00:00:00`), "MMM yyyy") : ""}`}</span>
                      <span className="text-ink-faint">{` · ${format(new Date(n.created_at), "d MMM")}`}</span>
                      <p className="mt-0.5 whitespace-pre-wrap text-ink-muted" data-no-translate>{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Who looks after them */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Account manager</h3>
            {canAssign && (
              <Field label="Named manager" htmlFor="am-assign" hint="Gold and VIP vendors see a named manager's first name and photo. Without one, the shared team answers.">
                <Select id="am-assign" value={d.manager_id ?? ""} disabled={busy === "assign"} data-testid="am-assign"
                  onChange={(e) => run("assign", () => amAssign(vendorId, e.target.value || null), "Saved")}>
                  <option value="">Shared account team</option>
                  {(managers.data ?? []).map((m) => <option key={m.id} value={m.id}>{`${m.name} (${m.vendors})`}</option>)}
                </Select>
              </Field>
            )}
            {d.history.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-2xs text-ink-faint">
                {d.history.map((h, i) => (
                  <li key={i}>{`${h.manager}: ${format(new Date(h.from), "d MMM yyyy")} – ${h.to ? format(new Date(h.to), "d MMM yyyy") : "now"}${h.by ? ` (by ${h.by})` : ""}`}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </Modal>
  );
}

function VendorLine({ v, onOpen }: { v: AmVendorRow; onOpen: () => void }) {
  return (
    <tr className={`${ROW_HOVER} cursor-pointer`} onClick={onOpen} data-testid="am-vendor-row">
      <td className="px-3 py-2">
        <span className="font-medium text-ink">{v.brand_name ?? "Unnamed vendor"}</span>
        <span className="block text-2xs text-ink-faint">{v.city ?? ""}</span>
      </td>
      <td className="px-3 py-2">
        <Badge tone={v.level === "vip" ? "critical" : v.level === "named" ? "caution" : "info"}>{LEVEL_LABEL[v.level]}</Badge>
        <span className="mt-0.5 block text-2xs text-ink-faint">
          {v.period_end ? `renews ${format(new Date(v.period_end), "d MMM")}${v.auto_renew ? " · autopay" : ""}` : ""}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-ink-muted">{v.manager_name ?? <span className="text-ink-faint">team</span>}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {v.unread > 0 && <Badge tone="critical">{`${v.unread} unread`}</Badge>}
          {v.callback && <Badge tone="caution">{`call ${format(new Date(`${v.callback.date}T00:00:00`), "d MMM")}`}</Badge>}
          {v.review_due && <Badge>review due</Badge>}
        </div>
        {v.last_message_at && <span className="text-2xs text-ink-faint">{`last ${formatDistanceToNow(new Date(v.last_message_at))} ago`}</span>}
      </td>
      <td className="px-3 py-2 text-xs text-ink-muted">
        {v.pipeline && v.pipeline.open + v.pipeline.won_30d > 0
          ? `${v.pipeline.open} open (${inr.format(v.pipeline.open_value)}), ${v.pipeline.won_30d} won in 30 days`
          : <span className="text-ink-faint">no CRM leads</span>}
      </td>
    </tr>
  );
}

export default function MyVendors() {
  const role = useRole();
  const leader = role === "super_admin" || role === "manager";
  const [filter, setFilter] = useState<AmFilter>(leader ? "unassigned" : "mine");
  const vendors = useAmVendors(filter);
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = vendors.data ?? [];
  const tabs = useMemo(() => [
    ...(role === "account_manager" ? [{ id: "mine" as const, label: "Mine" }] : []),
    { id: "shared" as const, label: "Shared team" },
    { id: "unassigned" as const, label: "Gold and VIP without a manager" },
    ...(leader ? [{ id: "all" as const, label: "All" }] : []),
  ], [role, leader]);

  return (
    <Page>
      <PageHeader title="My vendors"
        subtitle="Vendors on Silver and above, and the account team that looks after them. Messages, call requests and, on VIP, the sales concierge and the monthly review." />
      <Stack>
        <Tabs tabs={tabs} active={filter} onChange={setFilter} />
        <Panel title={`${rows.length} vendor${rows.length === 1 ? "" : "s"}`}
          description="Unread messages first. Open a vendor to reply, close a call request or write to a VIP.">
          {vendors.isPending ? <SkeletonList rows={4} height="h-10" /> : vendors.error ? (
            <ErrorNote message={(vendors.error as Error).message} />
          ) : rows.length === 0 ? (
            <Empty>No vendors here.</Empty>
          ) : (
            <Table head={["Vendor", "Plan", "Manager", "Waiting", "CRM"]}>
              {rows.map((v) => <VendorLine key={v.vendor_id} v={v} onOpen={() => setOpenId(v.vendor_id)} />)}
            </Table>
          )}
        </Panel>
      </Stack>
      {openId && <VendorDetail vendorId={openId} onClose={() => setOpenId(null)} />}
    </Page>
  );
}
