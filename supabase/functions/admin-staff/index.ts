// Supabase Edge Function: admin-staff
//
// Registers Cosora staff from the admin panel and manages their temporary
// passwords (Andy, 2026-10-01; textile-spark-net documentation/help-feature-plan.md
// D-10). Three actions, POST JSON:
//
//   { action: "register", full_name, personal_email, phone, admin_role }
//       super_admin, or a manager for the team roles. Creates the admin-panel
//       account: a generated employee ID and work email (the sign-in name), a
//       temporary password, the role. The password goes to the PERSONAL email by
//       Resend. If Resend isn't configured or the send fails, the response carries
//       the password once (delivery "shown") so the registrar can hand it over,
//       and the panel says so. It is never stored or logged.
//   { action: "reset_password", user_id }
//       Same callers. A new temporary password for a registered staff member, by
//       the same route. A manager can't reset a super admin's, another manager's
//       or their own.
//   { action: "set_password", password }
//       The signed-in staff member, at first sign-in: replaces the temporary
//       password and clears app_metadata.must_change_password. Refused when no
//       temporary password is pending.
//
// How this differs from admin-invite: that function emails a Supabase set-password
// link to the account's own address. A registered staff member's work email is
// generated and has no mailbox yet (ToDo.md, "Settle the staff work-email and
// employee-ID formats"), so the credential has to go to their personal address.
//
// The work email and employee ID come from admin_staff_identifiers() (formats in
// the staff-registry migration). The directory row is admin.staff_members. No
// phone number is set on the auth user, so phone sign-in (and the dummy OTP, which
// never opens admin accounts) can't reach these accounts.
//
// Authorization mirrors admin-invite: verify_jwt=true has checked the token, so
// `sub` is trustworthy; admin_status_of() (service role) gives the caller's role.
// The role grant runs admin_grant() with the CALLER's token, so the database's
// manager rule is the final gate. If the grant fails, the new auth user is
// deleted again: no half-registered staff.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (set by
// Supabase). Optional: RESEND_API_KEY and RESEND_FROM (project-wide, shared with
// account-deletion and support-receipt), ADMIN_PANEL_URL (the sign-in address in
// the email; default https://cosora-admin.vercel.app).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function callerIdFromJwt(req: Request): string | null {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

const REST = (key: string) => ({
  apikey: key,
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
});

// The roles a manager may give: admin.is_team_role() in migration 20260925210601.
const TEAM_ROLES = ["product_moderator", "vendor_ops", "ads_moderator", "finance_admin", "support", "account_manager"];

const EMAIL_RE = /^[^\s@,()<>]+@[^\s@,()<>]+\.[^\s@,()<>]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "98765 43210", "+91 98765-43210", "919876543210" -> "+919876543210"; null if not a number. */
function normalisePhone(raw: string): string | null {
  const s = raw.trim().replace(/[\s().-]/g, "");
  let e164: string;
  if (/^\+\d+$/.test(s)) e164 = s;
  else if (/^[6-9]\d{9}$/.test(s)) e164 = `+91${s}`;
  else if (/^0[6-9]\d{9}$/.test(s)) e164 = `+91${s.slice(1)}`;
  else if (/^91[6-9]\d{9}$/.test(s)) e164 = `+${s}`;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

// No 0/O, 1/l/I: the password may be read aloud or copied by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** 16 random characters in four groups (xxxx-xxxx-xxxx-xxxx), with upper, lower and a digit. */
function temporaryPassword(): string {
  for (;;) {
    const out: string[] = [];
    const buf = new Uint8Array(1);
    while (out.length < 16) {
      crypto.getRandomValues(buf);
      // Rejection sampling keeps every character equally likely.
      if (buf[0] < 256 - (256 % ALPHABET.length)) out.push(ALPHABET[buf[0] % ALPHABET.length]);
    }
    const p = out.join("");
    if (/[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p)) {
      return `${p.slice(0, 4)}-${p.slice(4, 8)}-${p.slice(8, 12)}-${p.slice(12)}`;
    }
  }
}

/** "asha.p@gmail.com" -> "a*****@gmail.com" */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "their email";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Pull the human-readable reason out of a GoTrue or PostgREST error body. */
function reason(text: string): string {
  try {
    const p = JSON.parse(text);
    return p.msg || p.message || p.error_description || p.error || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

interface Credentials {
  fullName: string;
  employeeId: string;
  workEmail: string;
  password: string;
  isReset: boolean;
}

/** Sends the temporary password by Resend. Returns why it didn't go, or null once Resend accepted it. */
async function sendCredentials(to: string, c: Credentials): Promise<string | null> {
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!key) return "not_configured";
  const panel = Deno.env.get("ADMIN_PANEL_URL") || "https://cosora-admin.vercel.app";
  const first = c.fullName.split(/\s+/)[0] || c.fullName;
  const lead = c.isReset
    ? "Here is a new temporary password for your Cosora admin account."
    : "Your Cosora admin account is ready.";
  const text =
    `Hello ${first},\n\n${lead}\n\n` +
    `Sign in at: ${panel}/login\n` +
    `Email: ${c.workEmail}\n` +
    `Temporary password: ${c.password}\n` +
    `Employee ID: ${c.employeeId}\n\n` +
    `When you sign in you'll be asked to choose your own password. The temporary one stops working then.\n\n` +
    `If you weren't expecting this email, ignore it and tell your manager.\n\nCosora`;
  const html =
    `<p>Hello ${escapeHtml(first)},</p><p>${lead}</p>` +
    `<table style="border-collapse:collapse;margin:12px 0">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Sign in at</td><td><a href="${escapeHtml(panel)}/login">${escapeHtml(panel)}/login</a></td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Email</td><td>${escapeHtml(c.workEmail)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Temporary password</td><td style="font-family:monospace;font-size:16px">${escapeHtml(c.password)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Employee ID</td><td>${escapeHtml(c.employeeId)}</td></tr>` +
    `</table>` +
    `<p>When you sign in you'll be asked to choose your own password. The temporary one stops working then.</p>` +
    `<p style="color:#6b7280">If you weren't expecting this email, ignore it and tell your manager.</p><p>Cosora</p>`;
  try {
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM") || "Cosora <onboarding@resend.dev>",
        to: [to],
        subject: c.isReset ? "Your new Cosora admin password" : "Your Cosora admin account",
        text,
        html,
      }),
    });
    if (sent.ok) return null;
    let message = `The email provider answered ${sent.status}.`;
    try {
      const err = await sent.json();
      if (typeof err?.message === "string" && err.message) message = err.message;
    } catch { /* keep the status line */ }
    return message;
  } catch (e) {
    return `The email provider couldn't be reached: ${String(e).slice(0, 120)}`;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) return json({ error: "server_misconfigured" }, 500);

  const callerId = callerIdFromJwt(req);
  if (!callerId) return json({ error: "unauthenticated" }, 401);
  const callerAuth = req.headers.get("Authorization") ?? "";

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const rpc = async (fn: string, body: unknown): Promise<Response> =>
    fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers: REST(serviceKey), body: JSON.stringify(body) });

  const adminStatus = async (userId: string): Promise<{ is_admin?: boolean; admin_role?: string } | null> => {
    const r = await rpc("admin_status_of", { p_user_id: userId });
    const rows = r.ok ? await r.json() : [];
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  };

  // Admin Log (MPF-26): the registrar is the actor. Never the password.
  const record = async (action: "insert" | "update", userId: string, changes: Record<string, unknown>) => {
    try {
      const r = await rpc("admin_audit_record", {
        p_actor: callerId, p_action: action, p_target_table: "admin.staff_members",
        p_target_id: userId, p_changes: changes, p_source: "edge:admin-staff",
      });
      if (!r.ok) console.error("admin-staff: Admin Log record failed", r.status, (await r.text()).slice(0, 200));
    } catch (e) {
      console.error("admin-staff: Admin Log record failed", String(e));
    }
  };

  const passwordEvent = async (userId: string, event: "issued" | "changed", delivery?: "email" | "shown") => {
    const r = await rpc("admin_staff_password_event", { p_user_id: userId, p_event: event, p_delivery: delivery ?? null });
    if (!r.ok) console.error("admin-staff: password event failed", r.status, (await r.text()).slice(0, 200));
  };

  const deleteAuthUser = async (userId: string) => {
    const r = await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: REST(serviceKey) });
    if (!r.ok) console.error("admin-staff: cleanup delete failed", r.status, (await r.text()).slice(0, 200));
  };

  const action = payload.action;

  // ── set_password: the staff member, at first sign-in ─────────────────────────
  if (action === "set_password") {
    const password = typeof payload.password === "string" ? payload.password : "";
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return json({ error: "weak_password", detail: "Use at least 10 characters, with letters and numbers." }, 400);
    }
    if (password.length > 72) {
      return json({ error: "weak_password", detail: "Use 72 characters or fewer." }, 400);
    }
    const userResp = await fetch(`${url}/auth/v1/admin/users/${callerId}`, { headers: REST(serviceKey) });
    if (!userResp.ok) return json({ error: "lookup_failed", detail: reason(await userResp.text()) }, 502);
    const user = await userResp.json();
    if (user?.app_metadata?.must_change_password !== true) {
      return json({ error: "not_required", detail: "There's no temporary password to replace on this account." }, 409);
    }
    const upd = await fetch(`${url}/auth/v1/admin/users/${callerId}`, {
      method: "PUT",
      headers: REST(serviceKey),
      body: JSON.stringify({ password, app_metadata: { must_change_password: false } }),
    });
    if (!upd.ok) return json({ error: "update_failed", detail: reason(await upd.text()) }, 400);
    await passwordEvent(callerId, "changed");
    return json({ ok: true });
  }

  if (action !== "register" && action !== "reset_password") return json({ error: "unknown_action" }, 400);

  // ── register / reset_password: super_admin, or a manager for team roles ──────
  const caller = await adminStatus(callerId);
  const isManager = caller?.is_admin === true && caller.admin_role === "manager";
  if (!caller?.is_admin || (caller.admin_role !== "super_admin" && !isManager)) {
    return json({ error: "forbidden", detail: "Registering staff needs the super admin or manager role." }, 403);
  }

  if (action === "reset_password") {
    const userId = typeof payload.user_id === "string" ? payload.user_id : "";
    if (!UUID_RE.test(userId)) return json({ error: "bad_user", detail: "Choose a staff member." }, 400);
    if (userId === callerId) {
      return json({ error: "forbidden", detail: "You can't reset your own password here. Ask another manager or a super admin." }, 403);
    }
    const got = await rpc("admin_staff_get", { p_user_id: userId });
    const rows = got.ok ? await got.json() : [];
    const staff = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!staff) {
      return json({ error: "not_staff", detail: "This account wasn't registered here, so it signs in with its own email and can use “Forgot password”." }, 404);
    }
    if (isManager && staff.is_active && !TEAM_ROLES.includes(staff.admin_role ?? "")) {
      return json({ error: "forbidden", detail: "This person is a super admin or manager. Only a super admin can reset their password." }, 403);
    }
    const password = temporaryPassword();
    const upd = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      headers: REST(serviceKey),
      body: JSON.stringify({ password, app_metadata: { must_change_password: true } }),
    });
    if (!upd.ok) return json({ error: "update_failed", detail: reason(await upd.text()) }, 502);
    const failure = await sendCredentials(staff.personal_email, {
      fullName: staff.full_name, employeeId: staff.employee_id, workEmail: staff.work_email, password, isReset: true,
    });
    const delivery = failure ? "shown" : "email";
    await passwordEvent(userId, "issued", delivery);
    await record("update", userId, { employee_id: staff.employee_id, temporary_password: "reissued", delivery });
    return json({
      ok: true,
      employee_id: staff.employee_id,
      work_email: staff.work_email,
      delivery,
      sent_to: delivery === "email" ? maskEmail(staff.personal_email) : null,
      email_problem: failure && failure !== "not_configured" ? failure : null,
      email_configured: failure !== "not_configured",
      temporary_password: delivery === "shown" ? password : null,
    });
  }

  // ── register ─────────────────────────────────────────────────────────────────
  const fullName = (typeof payload.full_name === "string" ? payload.full_name : "").trim().replace(/\s+/g, " ");
  const personalEmail = (typeof payload.personal_email === "string" ? payload.personal_email : "").trim();
  const phone = normalisePhone(typeof payload.phone === "string" ? payload.phone : "");
  const role = (typeof payload.admin_role === "string" ? payload.admin_role : "").trim();

  if (fullName.length < 2 || fullName.length > 120) {
    return json({ error: "bad_name", detail: "Give their full name (2 to 120 characters)." }, 400);
  }
  if (!EMAIL_RE.test(personalEmail) || personalEmail.length > 254) {
    return json({ error: "bad_email", detail: "Give a valid personal email address." }, 400);
  }
  if (/@cosora\.in$/i.test(personalEmail)) {
    return json({ error: "bad_email", detail: "Use their personal email, not a cosora.in address: the work email is created for them." }, 400);
  }
  if (!phone) {
    return json({ error: "bad_phone", detail: "Give a mobile number, for example 98765 43210 or +91 98765 43210." }, 400);
  }
  const rolesResp = await rpc("admin_role_values", {});
  if (!rolesResp.ok) return json({ error: "role_lookup_failed", detail: (await rolesResp.text()).slice(0, 200) }, 500);
  const validRoles: string[] = await rolesResp.json();
  if (!validRoles.includes(role)) {
    return json({ error: "bad_role", detail: `The role must be one of: ${validRoles.join(", ")}` }, 400);
  }
  if (isManager && !TEAM_ROLES.includes(role)) {
    return json({ error: "forbidden", detail: `A manager can register people in these roles only: ${TEAM_ROLES.join(", ")}.` }, 403);
  }

  // Identifiers, then the auth user. If the work email was taken between the two
  // (two registrations at once), try once more with fresh identifiers.
  let employeeId = "";
  let workEmail = "";
  let userId = "";
  const password = temporaryPassword();
  for (let attempt = 0; attempt < 2 && !userId; attempt++) {
    const ids = await rpc("admin_staff_identifiers", { p_full_name: fullName, p_personal_email: personalEmail });
    if (!ids.ok) {
      const body = await ids.text();
      if (body.includes("already_registered")) {
        return json({ error: "already_registered", detail: reason(body) }, 409);
      }
      return json({ error: "identifiers_failed", detail: reason(body) }, 500);
    }
    const idRows = await ids.json();
    employeeId = idRows?.[0]?.employee_id ?? "";
    workEmail = idRows?.[0]?.work_email ?? "";
    if (!employeeId || !workEmail) return json({ error: "identifiers_failed", detail: "No identifiers returned." }, 500);

    const created = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: REST(serviceKey),
      body: JSON.stringify({
        email: workEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { created_by: "admin-staff", must_change_password: true },
      }),
    });
    const text = await created.text();
    if (created.ok) {
      try {
        userId = JSON.parse(text)?.id ?? "";
      } catch { /* handled below */ }
      if (!userId) return json({ error: "create_failed", detail: "The auth service returned no user id." }, 502);
    } else if (!/already|exists|registered/i.test(reason(text)) || attempt === 1) {
      return json({ error: "create_failed", detail: reason(text) }, 502);
    }
  }

  // The profile row comes from handle_new_user(); keep its email and name in step.
  await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: REST(serviceKey),
    body: JSON.stringify({ email: workEmail, full_name: fullName }),
  });

  const rec = await rpc("admin_staff_record", {
    p_user_id: userId, p_employee_id: employeeId, p_full_name: fullName, p_work_email: workEmail,
    p_personal_email: personalEmail, p_phone: phone, p_registered_by: callerId,
  });
  if (!rec.ok) {
    const detail = reason(await rec.text());
    await deleteAuthUser(userId);
    return json({ error: "record_failed", detail }, 500);
  }

  const grant = await fetch(`${url}/rest/v1/rpc/admin_grant`, {
    method: "POST",
    headers: { apikey: anonKey, authorization: callerAuth, "content-type": "application/json" },
    body: JSON.stringify({ p_user_id: userId, p_role: role }),
  });
  const granted = grant.ok ? await grant.json() : null;
  if (!grant.ok || !Array.isArray(granted) || granted[0]?.is_active !== true) {
    const detail = grant.ok ? "admin_grant returned no active admin row" : reason(await grant.text());
    // The directory row goes with the user (on delete cascade).
    await deleteAuthUser(userId);
    return json({ error: "grant_failed", detail: `Nothing was created: the role couldn't be given (${detail}).` }, 403);
  }

  const failure = await sendCredentials(personalEmail, {
    fullName, employeeId, workEmail, password, isReset: false,
  });
  const delivery = failure ? "shown" : "email";
  await passwordEvent(userId, "issued", delivery);
  await record("insert", userId, { employee_id: employeeId, work_email: workEmail, full_name: fullName, admin_role: role, delivery });

  return json({
    ok: true,
    user_id: userId,
    employee_id: employeeId,
    work_email: workEmail,
    admin_role: role,
    delivery,
    sent_to: delivery === "email" ? maskEmail(personalEmail) : null,
    email_problem: failure && failure !== "not_configured" ? failure : null,
    email_configured: failure !== "not_configured",
    temporary_password: delivery === "shown" ? password : null,
  });
});
