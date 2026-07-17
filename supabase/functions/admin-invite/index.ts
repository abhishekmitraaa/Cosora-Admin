// Supabase Edge Function: admin-invite
//
// Brings a person into the admin panel by email. Two branches, and the caller is
// told which one happened so the UI never claims an email was sent when it
// wasn't:
//
//   existing auth user  -> "promoted": flip profiles.is_admin/admin_role. They
//                          already have a way to sign in; no credential needed
//                          and no email is sent.
//   no auth user yet    -> "invited": create the user AND send a Supabase invite
//                          link in one call (POST /auth/v1/invite), then stamp
//                          the role on the profiles row the handle_new_user
//                          trigger just created.
//
// NO PASSWORD IS EVER GENERATED OR EMAILED. The invite is a Supabase-generated
// secure link; the recipient sets their own password on arrival.
//
// Authorization mirrors admin-refund-payment: verify_jwt=true means the platform
// already validated the token signature, so `sub` is trustworthy; we then read
// that user's profiles row with the service role and require
// admin_role = 'super_admin'. Hiding the form in React is irrelevant to this
// path — the service role bypasses RLS, so this check IS the gate.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both platform-provided).
// Optional: ADMIN_INVITE_REDIRECT_URL — where the invite link lands. See the
// redirect notes below.

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

// Deliberately conservative: this string is interpolated into a PostgREST filter
// and handed to GoTrue, so anything exotic is rejected rather than escaped.
const EMAIL_RE = /^[^\s@,()<>]+@[^\s@,()<>]+\.[^\s@,()<>]+$/;

interface AuthUser {
  id: string;
  email?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  // ── 1. Authorize: super_admin only ────────────────────────────────────────
  const callerId = callerIdFromJwt(req);
  if (!callerId) return json({ error: "unauthenticated" }, 401);

  const profResp = await fetch(`${url}/rest/v1/profiles?id=eq.${callerId}&select=is_admin,admin_role`, {
    headers: REST(serviceKey),
  });
  const profRows = profResp.ok ? await profResp.json() : [];
  const caller = Array.isArray(profRows) && profRows.length ? profRows[0] : null;
  if (!caller?.is_admin || caller?.admin_role !== "super_admin") {
    return json(
      { error: "forbidden", detail: "Inviting or promoting admins requires the super_admin role" },
      403,
    );
  }

  // ── 2. Validate input ─────────────────────────────────────────────────────
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

  // Validate against the REAL enum, not a copy that could drift. Must happen
  // before any user is created, or a bad role would leave an orphaned auth user.
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
    return json(
      { error: "bad_role", detail: `admin_role must be one of: ${validRoles.join(", ")}` },
      400,
    );
  }

  // ── 3. Does an auth user already exist for this email? ────────────────────
  // GoTrue's admin list endpoint filters server-side; we still compare exactly,
  // since `filter` is a partial match and could return a near-miss address.
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

  // Shared: stamp admin fields on the profiles row (service role -> bypasses
  // enforce_admin_grants, which only gates `authenticated` callers. That bypass
  // is the intended design: this function did its own super_admin check above).
  async function grantAdmin(userId: string): Promise<string | null> {
    const patch = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { ...REST(serviceKey), prefer: "return=representation" },
      body: JSON.stringify({ is_admin: true, admin_role: role, email }),
    });
    if (!patch.ok) return (await patch.text()).slice(0, 200);
    const rows = await patch.json();
    if (!Array.isArray(rows) || rows.length === 0) return "no profiles row matched";
    return null;
  }

  // ── 4a. Existing user -> promote only. No email, no credential. ───────────
  if (existing) {
    const err = await grantAdmin(existing.id);
    if (err) return json({ error: "grant_failed", detail: err }, 500);
    return json({
      ok: true,
      outcome: "promoted",
      email,
      admin_role: role,
      userId: existing.id,
      emailSent: false,
      detail:
        "This person already had a Cosora account, so they were granted admin access directly. " +
        "No invite email was sent — they sign in the way they already do.",
    });
  }

  // ── 4b. New user -> invite (creates the user AND sends the link) ──────────
  // POST /auth/v1/invite both creates the auth user and emails the secure link.
  // If email delivery is not configured (or rate-limited) this call FAILS, which
  // is what we want: no half-made user, and the UI reports the real reason
  // instead of a success that never arrives.
  const redirectTo = Deno.env.get("ADMIN_INVITE_REDIRECT_URL") || payload.redirectTo || undefined;

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
    let detail = inviteText.slice(0, 300);
    try {
      const parsed = JSON.parse(inviteText);
      detail = parsed.msg || parsed.message || parsed.error_description || parsed.error || detail;
    } catch {
      /* keep raw text */
    }
    // Surfaced verbatim on purpose. The most likely causes are email sending not
    // being configured on the project, the built-in service refusing a non-team
    // address, or its hourly rate limit — all of which the admin must see.
    return json(
      {
        error: "invite_failed",
        detail,
        hint:
          "The invite email could not be sent, so no account was created. This project uses " +
          "Supabase's built-in email service, which is rate-limited and may refuse addresses " +
          "outside the project team. Configure custom SMTP in Supabase → Auth → SMTP Settings " +
          "to invite arbitrary addresses reliably.",
      },
      502,
    );
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

  // handle_new_user() created the profiles row on insert; stamp the role on it.
  const grantErr = await grantAdmin(invited.id);
  if (grantErr) {
    // The user + invite email are already real, so don't claim total failure —
    // say precisely what is and isn't done.
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
    email,
    admin_role: role,
    userId: invited.id,
    emailSent: true,
    redirectTo: redirectTo ?? null,
    detail:
      "A new account was created and a secure invite link was emailed. They set their own " +
      "password from that link — no password was generated or sent.",
  });
});
