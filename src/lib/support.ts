import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, describeWriteError } from "@/lib/supabase";
import type { Database, Json } from "@/lib/database.types";

/**
 * HELP & SUPPORT (textile-spark-net documentation/help-feature-plan.md, 2026-09-30).
 *
 * Every request a buyer or vendor makes is one support ticket with a channel: a chat,
 * a callback request, a fraud report or app feedback. This panel answers them. The
 * data is public.support_*, read and written only through the admin_support_*
 * functions (migrations 20260930120000-120200 in textile-spark-net):
 *   read  super_admin, support, manager   (admin.support_can_read)
 *   act   super_admin, support            (admin.support_can_write)
 *   settings: super_admin only
 * The requester always sees "Cosora Support", never a person (D-06). Internal notes
 * never reach them; the database's RLS guarantees that, not this file.
 *
 * Live updates: Postgres Changes on support_tickets, support_ticket_staff and
 * support_messages. An event means "refetch", never "here is the data".
 */

export type SupportChannel = "chat" | "callback" | "fraud_report" | "feedback";
export type SupportStatus = "new" | "open" | "resolved" | "closed";
export type SupportView = "awaiting" | "active" | "mine" | "unassigned" | "resolved" | "closed" | "all";
export type Lang = "en" | "hi" | "gu";
export type LangText = Partial<Record<Lang, string>>;

export const CHANNEL_LABELS: Record<SupportChannel, string> = {
  chat: "Chat",
  callback: "Callback",
  fraud_report: "Fraud report",
  feedback: "Feedback",
};

export const STATUS_LABELS: Record<SupportStatus, string> = {
  new: "New",
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
};

export const LANGUAGE_LABELS: Record<Lang, string> = { en: "English", hi: "Hindi", gu: "Gujarati" };

export const VIEW_LABELS: Record<SupportView, string> = {
  awaiting: "Waiting on us",
  active: "Open",
  mine: "Mine",
  unassigned: "Unassigned",
  resolved: "Resolved",
  closed: "Closed",
  all: "All",
};

export const FRAUD_OUTCOMES: { id: string; label: string; hint: string }[] = [
  { id: "no_action", label: "No action", hint: "Looked into it; nothing to act on." },
  { id: "warned", label: "Warned", hint: "The reported party was warned." },
  { id: "suspended", label: "Suspended", hint: "The reported account was suspended (do that from its account first)." },
  { id: "escalated_legal", label: "Escalated to legal", hint: "Passed to counsel or the police." },
];

export const CALLBACK_OUTCOMES: { id: "completed" | "no_answer" | "wrong_number" | "cancelled"; label: string }[] = [
  { id: "completed", label: "Completed" },
  { id: "no_answer", label: "No answer" },
  { id: "wrong_number", label: "Wrong number" },
  { id: "cancelled", label: "Cancelled" },
];

/** The English text of a {en, hi, gu} label, falling back to whichever exists. */
export function labelText(label: Json | null | undefined): string {
  if (!label || typeof label !== "object" || Array.isArray(label)) return "";
  const l = label as Record<string, unknown>;
  return String(l.en ?? l.hi ?? l.gu ?? "");
}

/** "2 h", "3 d", "12 min": how long something has waited. */
export function ageFrom(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function istTime(iso: string | null | undefined): string {
  return iso ? `${IST.format(new Date(iso))} IST` : "";
}

// ── The inbox ──────────────────────────────────────────────────────────────────
type GeneratedListRow = Database["public"]["Functions"]["admin_support_list"]["Returns"][number];

/** One ticket in the inbox. The generated type calls every column non-null; these can be null. */
export type SupportListRow = Omit<
  GeneratedListRow,
  | "assignee_id" | "assignee_name" | "waiting_since" | "first_staff_reply_at" | "requester_id"
  | "callback_date" | "callback_start" | "callback_end" | "callback_outcome" | "callback_attempts"
> & {
  assignee_id: string | null;
  assignee_name: string | null;
  waiting_since: string | null;
  first_staff_reply_at: string | null;
  requester_id: string | null;
  callback_date: string | null;
  callback_start: string | null;
  callback_end: string | null;
  callback_outcome: string | null;
  callback_attempts: number | null;
};

export interface SupportFilters {
  view: SupportView;
  channel: SupportChannel | "";
  category: string;
  side: "" | "buyer" | "vendor";
  language: "" | Lang;
  search: string;
  includeTest: boolean;
}

export const SUPPORT_PAGE = 50;

export function useSupportList(f: SupportFilters) {
  return useInfiniteQuery({
    queryKey: ["support", "list", f],
    initialPageParam: 0,
    refetchOnWindowFocus: true,
    queryFn: async ({ pageParam }): Promise<SupportListRow[]> => {
      const { data, error } = await supabase.rpc("admin_support_list", {
        p_view: f.view,
        p_channel: f.channel || undefined,
        p_category: f.category || undefined,
        p_side: f.side || undefined,
        p_language: f.language || undefined,
        p_search: f.search.trim() || undefined,
        p_include_test: f.includeTest,
        p_offset: pageParam,
        p_limit: SUPPORT_PAGE,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as SupportListRow[];
    },
    getNextPageParam: (last, all) => (last.length === SUPPORT_PAGE ? all.length * SUPPORT_PAGE : undefined),
  });
}

export interface SupportCounts {
  awaiting: number;
  awaiting_chat: number;
  awaiting_callback: number;
  awaiting_fraud: number;
  awaiting_feedback: number;
  active: number;
  mine: number;
  unassigned: number;
  callbacks_today: number;
  callbacks_overdue: number;
  oldest_waiting_at: string | null;
  open_now: boolean;
  rollout: "off" | "staff" | "all";
}

export function useSupportCounts(enabled = true) {
  return useQuery({
    queryKey: ["support", "counts"],
    enabled,
    // Live updates invalidate this; the interval only catches a dropped socket.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SupportCounts> => {
      const { data, error } = await supabase.rpc("admin_support_counts");
      if (error) throw new Error(error.message);
      return data as unknown as SupportCounts;
    },
  });
}

// ── One ticket ─────────────────────────────────────────────────────────────────
export interface SupportMessage {
  id: string;
  author_kind: "requester" | "staff" | "system";
  author_id: string | null;
  author_name: string | null;
  visibility: "public" | "internal";
  kind: "text" | "attachment" | "event";
  body: string | null;
  event: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface SupportAttachment {
  id: string;
  message_id: string;
  uploader_kind: "requester" | "staff";
  kind: "image" | "pdf" | "audio";
  mime: string;
  bytes: number;
  duration_ms: number | null;
  path: string;
  status: "pending" | "clean" | "rejected";
  requester_can_view: boolean;
  created_at: string;
}

export interface SupportTicketDetail {
  ticket: {
    id: string;
    ticket_no: string;
    requester_id: string | null;
    requester_side: "buyer" | "vendor";
    channel: SupportChannel;
    category: string;
    category_label: Json;
    subject: string;
    status: SupportStatus;
    language: Lang;
    entity_type: string | null;
    entity_id: string | null;
    restricted: boolean;
    is_test: boolean;
    created_at: string;
    last_message_at: string;
    first_staff_reply_at: string | null;
    resolved_at: string | null;
    closed_at: string | null;
    reopen_count: number;
  };
  staff: {
    assignee_id: string | null;
    assignee_name: string | null;
    assigned_at: string | null;
    context: Record<string, unknown>;
    fraud_outcome: string | null;
    reviewed_at: string | null;
    reviewed_by_name: string | null;
  };
  requester: {
    id: string;
    name: string;
    full_name: string | null;
    account_status: string;
    active_role: string | null;
    joined_at: string;
    has_store: boolean;
    is_staff: boolean;
    email: string | null;
    phone_masked: string | null;
  } | null;
  callback: {
    date: string;
    start: string;
    end: string;
    attempts: number;
    last_attempt_at: string | null;
    outcome: string;
    phone_masked: string | null;
  } | null;
  fraud: {
    reported_name: string | null;
    reported_phone_masked: string | null;
    reported_url: string | null;
    reported_entity_type: string | null;
    reported_entity_id: string | null;
    reported_entity_label: string | null;
    amount_inr: number | null;
    incident_date: string | null;
    city: string | null;
  } | null;
  messages: SupportMessage[];
  attachments: SupportAttachment[];
  events: {
    event: string;
    actor_kind: string;
    actor_name: string | null;
    from_status: string | null;
    to_status: string | null;
    detail: Record<string, unknown>;
    at: string;
  }[];
  other_requests: { ticket_no: string; channel: SupportChannel; status: SupportStatus; subject: string; created_at: string }[];
  can_write: boolean;
}

export function useSupportTicket(ticketNo: string | undefined) {
  return useQuery({
    queryKey: ["support", "ticket", ticketNo],
    enabled: Boolean(ticketNo),
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SupportTicketDetail> => {
      const { data, error } = await supabase.rpc("admin_support_get", { p_ticket_no: ticketNo! });
      if (error) throw new Error(error.message);
      return data as unknown as SupportTicketDetail;
    },
  });
}

export function useSupportAssignees() {
  return useQuery({
    queryKey: ["support", "assignees"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_support_assignees");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/**
 * Refetch every support query when a ticket, an assignment or a message changes.
 *
 * Two traps this avoids, both recorded in textile-spark-net
 * (src/lib/queries/notifications.ts):
 *   - `.on()` must be registered BEFORE `.subscribe()`;
 *   - `supabase.channel(name)` returns an EXISTING channel for a name already open, so
 *     each mount gets its own topic, or a second subscriber throws and blanks the page.
 * RLS decides what the socket carries; staff read every row of these tables.
 */
export function useSupportRealtime(enabled = true) {
  const qc = useQueryClient();
  const topic = useRef(`support:${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => void qc.invalidateQueries({ queryKey: ["support"] });
    const channel = supabase
      .channel(topic.current)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_ticket_staff" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}

// ── Actions ────────────────────────────────────────────────────────────────────
function fail(error: { message: string; code?: string } | null): void {
  if (error) throw new Error(describeWriteError(error));
}

export async function claimTicket(ticketId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_support_claim", { p_ticket_id: ticketId });
  fail(error);
}

/** `assigneeId` null unassigns. */
export async function reassignTicket(ticketId: string, assigneeId: string | null): Promise<void> {
  const { error } = await supabase.rpc("admin_support_reassign", {
    p_ticket_id: ticketId,
    // The generated type can't express "uuid or null"; the SQL takes null as "nobody".
    p_assignee_id: assigneeId as string,
  });
  fail(error);
}

export async function setTicketStatus(ticketId: string, status: "open" | "resolved" | "closed", note?: string) {
  const { error } = await supabase.rpc("admin_support_set_status", {
    p_ticket_id: ticketId,
    p_status: status,
    p_note: note?.trim() || undefined,
  });
  fail(error);
}

export type RevealField = "requester_phone" | "callback_phone" | "reported_phone";

/** Returns the full number. The database writes the reveal to the Admin Log first. */
export async function revealContact(ticketId: string, field: RevealField): Promise<string | null> {
  const { data, error } = await supabase.rpc("admin_support_reveal_contact", { p_ticket_id: ticketId, p_field: field });
  fail(error);
  return ((data as { value?: string | null } | null)?.value ?? null) || null;
}

export async function logCallbackAttempt(
  ticketId: string,
  outcome: (typeof CALLBACK_OUTCOMES)[number]["id"],
  note?: string,
): Promise<{ outcome: string; attempts: number; status: string }> {
  const { data, error } = await supabase.rpc("admin_callback_log_attempt", {
    p_ticket_id: ticketId,
    p_outcome: outcome,
    p_note: note?.trim() || undefined,
  });
  fail(error);
  return data as unknown as { outcome: string; attempts: number; status: string };
}

export async function setFraudOutcome(ticketId: string, outcome: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc("admin_fraud_set_outcome", {
    p_ticket_id: ticketId,
    p_outcome: outcome,
    p_note: note?.trim() || undefined,
  });
  fail(error);
}

export async function markFeedbackReviewed(ticketId: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc("admin_feedback_mark_reviewed", {
    p_ticket_id: ticketId,
    p_note: note?.trim() || undefined,
  });
  fail(error);
}

// ── Files ──────────────────────────────────────────────────────────────────────
export const SUPPORT_BUCKET = "support-attachments";
export const ACCEPTED_FILES = "image/jpeg,image/png,image/webp,application/pdf,audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/aac,audio/x-m4a,audio/wav";
const MB = 1024 * 1024;

function kindOf(mime: string): "image" | "pdf" | "audio" | null {
  if (["image/jpeg", "image/png", "image/webp"].includes(mime)) return "image";
  if (mime === "application/pdf") return "pdf";
  if (["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/x-m4a", "audio/wav"].includes(mime)) return "audio";
  return null;
}

/** The limits admin.support_reserve_upload() enforces, checked early for a clear message. */
export function checkFile(file: File): string | null {
  const kind = kindOf(file.type);
  if (!kind) return `${file.name}: send a photo (JPG, PNG, WebP), a PDF or an audio file.`;
  const cap = kind === "pdf" ? 10 * MB : 5 * MB;
  if (file.size > cap) return `${file.name} is larger than ${cap / MB} MB.`;
  return null;
}

/**
 * Reserve a path, upload, then have the edge function check the file's signature.
 * Returns the attachment id to send with the reply. A file the check rejects is
 * deleted by the function and reported here as an error.
 */
export async function uploadStaffFile(ticketId: string, file: File): Promise<string> {
  const problem = checkFile(file);
  if (problem) throw new Error(problem);
  const kind = kindOf(file.type)!;
  const { data, error } = await supabase.rpc("admin_support_prepare_upload", {
    p_ticket_id: ticketId,
    p_kind: kind,
    p_mime: file.type,
    p_bytes: file.size,
  });
  fail(error);
  const reserved = data as unknown as { attachment_id: string; path: string };
  const up = await supabase.storage.from(SUPPORT_BUCKET).upload(reserved.path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (up.error) throw new Error(`Upload failed for ${file.name}: ${up.error.message}`);
  // admin.support_check_files sends only `clean` files, so wait for a verdict. "pending"
  // means storage didn't have the object yet; ask again a couple of times.
  for (let attempt = 0; attempt < 3; attempt++) {
    const check = await supabase.functions.invoke("support-attachment-verify", {
      body: { attachmentId: reserved.attachment_id },
    });
    if (check.error) throw new Error(`Could not check ${file.name}: ${check.error.message}`);
    const status = (check.data as { status?: string; reason?: string } | null)?.status;
    if (status === "clean") return reserved.attachment_id;
    if (status === "rejected") {
      throw new Error(`${file.name} was refused: its contents don't match a ${kind} file.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`${file.name} couldn't be checked. Try sending again.`);
}

export async function sendReply(
  ticketId: string,
  body: string,
  internal: boolean,
  attachmentIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc("admin_support_reply", {
    p_ticket_id: ticketId,
    p_body: body.trim() || (null as unknown as string),
    p_internal: internal,
    p_attachment_ids: attachmentIds.length ? attachmentIds : undefined,
  });
  fail(error);
}

/**
 * A short-lived link to a file. Storage refuses it unless the file is `clean` and the
 * caller may read it (support_attachment_read_allowed()). PDFs download, never render
 * inline in the panel (plan A4).
 */
export async function attachmentUrl(a: Pick<SupportAttachment, "path" | "kind" | "id">): Promise<string> {
  const { data, error } = await supabase.storage
    .from(SUPPORT_BUCKET)
    .createSignedUrl(a.path, 300, a.kind === "pdf" ? { download: `support-${a.id.slice(0, 8)}.pdf` } : undefined);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not open the file.");
  return data.signedUrl;
}

// ── Settings ───────────────────────────────────────────────────────────────────
export interface SupportHoursRow {
  weekday: number;
  is_open: boolean;
  open: string | null;
  close: string | null;
}

export interface SupportCategory {
  code: string;
  audience: "buyer" | "vendor" | "both";
  channels: SupportChannel[];
  label: LangText;
  restricted: boolean;
  position: number;
  active: boolean;
}

export interface SupportSettings {
  rollout: "off" | "staff" | "all";
  test_profiles: { id: string; name: string }[];
  phone: string;
  email: string;
  updated_at: string;
  updated_by_name: string | null;
  hours: SupportHoursRow[];
  holidays: { day: string; label: string }[];
  categories: SupportCategory[];
  open_now: boolean;
  next_open_at: string | null;
  can_edit: boolean;
}

export function useSupportSettings() {
  return useQuery({
    queryKey: ["support", "settings"],
    queryFn: async (): Promise<SupportSettings> => {
      const { data, error } = await supabase.rpc("admin_support_settings");
      if (error) throw new Error(error.message);
      return data as unknown as SupportSettings;
    },
  });
}

export async function saveHours(hours: SupportHoursRow[]): Promise<void> {
  const { error } = await supabase.rpc("admin_support_set_hours", { p_hours: hours as unknown as Json });
  fail(error);
}

export async function addHoliday(day: string, label: string): Promise<void> {
  const { error } = await supabase.rpc("admin_support_holiday_add", { p_day: day, p_label: label });
  fail(error);
}

export async function removeHoliday(day: string): Promise<void> {
  const { error } = await supabase.rpc("admin_support_holiday_remove", { p_day: day });
  fail(error);
}

export async function saveRollout(rollout: SupportSettings["rollout"], testProfileIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("admin_support_set_rollout", {
    p_rollout: rollout,
    p_test_profile_ids: testProfileIds,
  });
  fail(error);
}

export async function saveContact(phone: string, email: string): Promise<void> {
  const { error } = await supabase.rpc("admin_support_set_contact", { p_phone: phone, p_email: email });
  fail(error);
}

export async function setCategoryActive(code: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc("admin_support_category_set_active", { p_code: code, p_active: active });
  fail(error);
}

// ── Quick Guides ───────────────────────────────────────────────────────────────
export interface HelpGuide {
  id: string;
  slug: string;
  audience: "buyer" | "vendor" | "both";
  title: LangText;
  body: LangText;
  position: number;
  active: boolean;
  verified_at: string | null;
  updated_at: string;
  updated_by_name: string | null;
}

export function useHelpGuides() {
  return useQuery({
    queryKey: ["help-guides"],
    queryFn: async (): Promise<HelpGuide[]> => {
      const { data, error } = await supabase.rpc("admin_help_guide_list");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as HelpGuide[];
    },
  });
}

export async function saveHelpGuide(g: {
  id: string | null;
  slug: string;
  audience: HelpGuide["audience"];
  title: LangText;
  body: LangText;
  position: number;
  active: boolean;
  verified: boolean;
}): Promise<string> {
  const clean = (t: LangText) =>
    Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v === "string" && v.trim() !== "")) as Json;
  const { data, error } = await supabase.rpc("admin_help_guide_save", {
    p_id: g.id as string, // null creates a new guide
    p_slug: g.slug,
    p_audience: g.audience,
    p_title: clean(g.title),
    p_body: clean(g.body),
    p_position: g.position,
    p_active: g.active,
    p_verified: g.verified,
  });
  fail(error);
  return data as string;
}

export async function deleteHelpGuide(id: string): Promise<void> {
  const { error } = await supabase.rpc("admin_help_guide_delete", { p_id: id });
  fail(error);
}
