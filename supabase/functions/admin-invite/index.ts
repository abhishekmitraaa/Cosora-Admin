// Supabase Edge Function: admin-invite
//
// Brings a person into the admin panel by email. The panel authenticates with
// email + PASSWORD, but every existing Cosora account today is OTP-only
// (encrypted_password IS NULL). So the branch that matters is NOT "does this
// user exist" - it's "does this user have a password they could log in with".
//
// Three branches, keyed on password presence:
//
//   1. no auth user at all      -> create the user AND email an invite link
//                                  (POST /auth/v1/invite does both).
//   2. exists, NO password       -> the common case: an OTP-only account. Grant
//      (encrypted_password NULL)    the admin role AND email a set-password
//                                  (recovery) link - they need it exactly as
//                                  much as a brand-new user, or they can't log in.
//   3. exists, HAS a password    -> grant the admin role only. They already have
//                                  a way to sign in; no email, no new credential.
//
// Password presence is decided by the user_has_password() SECURITY DEFINER
// function (auth.users is not client-readable), called via the service role.
//
// NO PASSWORD IS EVER GENERATED OR EMAILED. Both the invite and the recovery
// email carry a Supabase-generated secure link; the recipient sets their own
// password at /reset-password (the redirectTo below).
//
// Authorization mirrors admin-refund-payment: verify_jwt=true validated the
// token signature, so `sub` is trustworthy; we then ask admin_status_of() for
// that user (service role) and require admin_role = 'super_admin'. Hiding the
// form in React is irrelevant to this path - the service role bypasses RLS, so
// this check IS the gate.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional:
// ADMIN_INVITE_REDIRECT_URL (overrides the client-supplied redirect).

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

// Interpolated into a PostgREST filter and handed to GoTrue - reject anything
// exotic rather than trying to escape it.
const EMAIL_RE = /^[^\s@,()<>]+@[^\s@,()<>]+\.[^\s@,()<>]+$/;

interface AuthUser {
  id: string;
  email?: string;
}

/** Pull the human-readable reason out of a GoTrue error body. */
function reason(text: string): string {
  try {
    const p = JSON.parse(text);
    return p.msg || p.message || p.error_description || p.error || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

const RATE_HINT =
  "This project uses Supabase's built-in email service, which is rate-limited and may refuse " +
  "addresses outside the project team. Configure custom SMTP in Supabase -> Auth -> SMTP Settings " +
  "to send set-password links reliably. The link's redirect must also be allow-listed under " +
  "Auth -> URL Configuration -> Redirect URLs.";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  // 1. Authorize: super_admin only
  const callerId = callerIdFromJwt(req);
  if (!callerId) return json({ error: "unauthenticated" }, 401);

  // admin_status_of() reads admin.admin_users, the source of truth since
  // admin-schema separation Phase 5 (service_role only). Any failure leaves
  // caller null, which is a 403: this fails closed.
  const statusResp = await fetch(`${url}/rest/v1/rpc/admin_status_of`, {
    method: "POST",
    headers: REST(serviceKey),
    body: JSON.stringify({ p_user_id: callerId }),
  });
  const statusRows = statusResp.ok ? await statusResp.json() : [];
  const caller = Array.isArray(statusRows) && statusRows.length ? statusRows[0] : null;
  if (!caller?.is_admin || caller?.admin_role !== "super_admin") {
    return json(
      { error: "forbidden", detail: "Inviting or promoting admins requires the super_admin role" },
      403,
    );
  }

  // 2. Validate input
  let payload: { email?: string; admin_role?: string; redirectTo?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  const role = (payload.admin_role ?? "").trim();

  if (!email || !EMAIL_RE.test(email)) {
    return json({ error: "bad_email", detail: "Provide a valid email address." }, 400);
  }

  // Validate against the REAL enum, before any user is created.
  const rolesResp = await fetch(`${url}/rest/v1/rpc/admin_role_values`, {
    method: "POST",
    headers: REST(serviceKey),
    body: "{}",
  });
  if (!rolesResp.ok) {
    return json({ error: "role_lookup_failed", detail: (await rolesResp.text()).slice(0, 200) }, 500);
  }
  const validRoles: string[] = await rolesResp.json();
  if (!validRoles.includes(role)) {
    return json({ error: "bad_role", detail: `admin_role must be one of: ${validRoles.join(", ")}` }, 400);
  }

  const redirectTo = Deno.env.get("ADMIN_INVITE_REDIRECT_URL") || payload.redirectTo || undefined;

  // 3. Existence (+ id) and password presence - two DIFFERENT questions
  const lookup = await fetch(
    `${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=50`,
    { headers: REST(serviceKey) },
  );
  if (!lookup.ok) {
    return json({ error: "lookup_failed", detail: (await lookup.text()).slice(0, 200) }, 502);
  }
  const lookupBody = await lookup.json();
  const users: AuthUser[] = Array.isArray(lookupBody?.users) ? lookupBody.users : [];
  const existing = users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;

  let hasPassword = false;
  if (existing) {
    const pwResp = await fetch(`${url}/rest/v1/rpc/user_has_password`, {
      method: "POST",
      headers: REST(serviceKey),
      body: JSON.stringify({ target_email: email }),
    });
    if (!pwResp.ok) {
      return json({ error: "password_check_failed", detail: (await pwResp.text()).slice(0, 200) }, 500);
    }
    hasPassword = (await pwResp.json()) === true;
  }

  // Grant through admin_grant(), which writes admin.admin_users (the source of
  // truth). It admits this call because auth.role() is 'service_role'; this
  // function did its own super_admin check above. Admin-schema separation 5a:
  // this used to PATCH profiles {is_admin, admin_role} and rely on the
  // profiles -> admin_users mirror trigger, which Phase 5c removes.
  //
  // Two writes, in this order:
  //   1. profiles.email backfill. This is not an admin field, and the old PATCH
  //      carried it. It also proves the profiles row exists, as the old
  //      "no profiles row matched" check did.
  //   2. admin_grant. If it fails, the only thing left behind is a harmless email
  //      backfill, never a half-granted admin.
  async function grantAdmin(userId: string): Promise<string | null> {
    const patch = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { ...REST(serviceKey), prefer: "return=representation" },
      body: JSON.stringify({ email }),
    });
    if (!patch.ok) return (await patch.text()).slice(0, 200);
    const rows = await patch.json();
    if (!Array.isArray(rows) || rows.length === 0) return "no profiles row matched";

    const grant = await fetch(`${url}/rest/v1/rpc/admin_grant`, {
      method: "POST",
      headers: REST(serviceKey),
      body: JSON.stringify({ p_user_id: userId, p_role: role }),
    });
    if (!grant.ok) return reason(await grant.text()).slice(0, 200);
    const granted = await grant.json();
    if (!Array.isArray(granted) || granted.length === 0 || granted[0]?.is_active !== true) {
      return "admin_grant returned no active admin row";
    }
    return null;
  }

  // Branch 3: exists AND has a password -> grant only, no email
  if (existing && hasPassword) {
    const err = await grantAdmin(existing.id);
    if (err) return json({ error: "grant_failed", detail: err }, 500);
    return json({
      ok: true,
      outcome: "promoted",
      created: false,
      hadPassword: true,
      emailSent: false,
      email,
      admin_role: role,
      userId: existing.id,
      detail:
        "This person already had a Cosora account with a password, so they were granted admin " +
        "access directly. No email was sent - they sign in the way they already do.",
    });
  }

  // Branch 2: exists, NO password (OTP-only) -> grant + recovery link
  if (existing && !hasPassword) {
    // Grant first: it's durable and reversible, and shouldn't be blocked by a
    // transient email rate limit. Then send the set-password (recovery) link.
    const err = await grantAdmin(existing.id);
    if (err) return json({ error: "grant_failed", detail: err }, 500);

    const recoverUrl = `${url}/auth/v1/recover${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ""}`;
    const recoverResp = await fetch(recoverUrl, {
      method: "POST",
      headers: REST(serviceKey),
      body: JSON.stringify({ email }),
    });

    if (!recoverResp.ok) {
      // The admin grant stands (they ARE an admin now), but they still can't log
      // in without the link. Say so plainly - do NOT report a sent email.
      return json({
        ok: true,
        outcome: "invited",
        created: false,
        hadPassword: false,
        emailSent: false,
        email,
        admin_role: role,
        userId: existing.id,
        warning:
          `Admin access was granted, but the set-password email could NOT be sent: ` +
          `${reason(await recoverResp.text())}. This account is OTP-only and has no password, so ` +
          `they cannot sign in until a link reaches them - resend the invite once email works.`,
        hint: RATE_HINT,
        detail: "Existing OTP-only account: admin granted, but the set-password email failed.",
      });
    }

    return json({
      ok: true,
      outcome: "invited",
      created: false,
      hadPassword: false,
      emailSent: true,
      email,
      admin_role: role,
      userId: existing.id,
      detail:
        "This person already had a Cosora account but no password (OTP-only). They were granted " +
        "admin access and emailed a secure link to set a password - no password was generated or sent.",
    });
  }

  // Branch 1: no user at all -> invite (create + send)
  const inviteResp = await fetch(`${url}/auth/v1/invite`, {
    method: "POST",
    headers: REST(serviceKey),
    body: JSON.stringify({
      email,
      data: { invited_as_admin_role: role, invited_by: callerId },
      ...(redirectTo ? { redirect_to: redirectTo } : {}),
    }),
  });

  const inviteText = await inviteResp.text();
  if (!inviteResp.ok) {
    // Invite creates AND sends atomically: on failure nothing was created, so the
    // UI can honestly report no account and no email.
    return json({ error: "invite_failed", detail: reason(inviteText), hint: RATE_HINT }, 502);
  }

  let invited: AuthUser;
  try {
    invited = JSON.parse(inviteText);
  } catch {
    return json({ error: "invite_failed", detail: "Unparseable response from auth service" }, 502);
  }
  if (!invited?.id) {
    return json({ error: "invite_failed", detail: "Auth service returned no user id" }, 502);
  }

  const grantErr = await grantAdmin(invited.id);
  if (grantErr) {
    return json(
      {
        error: "invited_but_grant_failed",
        detail: `The invite email was sent, but setting the admin role failed: ${grantErr}. ` +
          `Set the role manually from the admins list once they sign in.`,
        userId: invited.id,
        emailSent: true,
      },
      500,
    );
  }

  return json({
    ok: true,
    outcome: "invited",
    created: true,
    hadPassword: false,
    emailSent: true,
    email,
    admin_role: role,
    userId: invited.id,
    detail:
      "A new account was created and a secure invite link was emailed. They set their own password " +
      "from that link - no password was generated or sent.",
  });
});
