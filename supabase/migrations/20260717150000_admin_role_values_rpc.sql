-- ─────────────────────────────────────────────────────────────
-- admin_role_values(): the real labels of the admin_role_type enum.
--
-- The admin-invite edge function must reject a bogus admin_role BEFORE it
-- creates an auth user. Without an up-front check the ordering is unsafe: the
-- Admin API would create the user, then the profiles UPDATE would fail on the
-- invalid enum cast (22P02), leaving an orphaned auth user with no admin access
-- and no way to retry cleanly.
--
-- Reading enum_range() keeps the check honest — a hardcoded list in the function
-- would silently drift the day a role is added or renamed.
-- ─────────────────────────────────────────────────────────────

create or replace function public.admin_role_values()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select array(select unnest(enum_range(null::public.admin_role_type))::text);
$$;

-- Enum labels are not sensitive (the UI already ships them in its bundle), but
-- keep execute off `anon` — nothing unauthenticated has a reason to ask.
revoke all on function public.admin_role_values() from public, anon;
grant execute on function public.admin_role_values() to authenticated, service_role;
