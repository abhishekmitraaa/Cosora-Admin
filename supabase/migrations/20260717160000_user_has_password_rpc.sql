-- ─────────────────────────────────────────────────────────────
-- user_has_password(target_email): does this email have a usable password?
--
-- The admin-invite function must not confuse "account exists" with "can log in
-- with a password". Every existing Cosora account today is OTP-only — created
-- through the main app's email-OTP flow — so auth.users.encrypted_password is
-- NULL for them. Promoting such a user to admin without also sending a
-- set-password link would make them an admin who literally cannot sign in to a
-- panel that authenticates with email + password.
--
-- So the invite flow branches on PASSWORD PRESENCE, not existence, and this is
-- the check it uses. SECURITY DEFINER because auth.users is not readable by the
-- authenticated/anon roles; only the service role (the edge function) may call
-- it — exposing "does this email have a password" to clients would be a user /
-- credential-state enumeration vector.
--
-- Treats both NULL and '' as "no password" (GoTrue has used empty string in some
-- versions; this project stores NULL — handle both so the check can't silently
-- misfire after an upgrade).
-- ─────────────────────────────────────────────────────────────

create or replace function public.user_has_password(target_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(target_email)
      and u.encrypted_password is not null
      and u.encrypted_password <> ''
  );
$$;

-- service_role only. Never anon/authenticated — see the enumeration note above.
revoke all on function public.user_has_password(text) from public, anon, authenticated;
grant execute on function public.user_has_password(text) to service_role;
