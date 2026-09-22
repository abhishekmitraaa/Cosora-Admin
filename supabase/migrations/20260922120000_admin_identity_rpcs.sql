-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN SCHEMA SEPARATION — PHASE 5a: RPCs OVER admin.admin_users FOR EVERY
-- ADMIN-IDENTITY READ AND WRITE. ADDITIVE; THE profiles COLUMNS AND THE MIRROR
-- ARE UNTOUCHED.
--
-- Phase 5 retires public.profiles.is_admin / public.profiles.admin_role and makes
-- admin.admin_users the only source of truth, expand-then-contract:
--   5a (this file)  add the RPCs below; admin-invite's grant write moves onto
--                   admin_grant
--   5b              repoint every remaining reader and writer (both repos) onto
--                   the RPCs
--   5c              rewrite enforce_admin_grants / record_embedding_pipeline_health,
--                   drop the mirror trigger, the CHECK constraint and both columns
--
-- Who reads the columns today (Step 0, 2026-09-22):
--   Cosora-Admin  useAdminSession.tsx, Admins.tsx, admin-invite, admin-refund-payment
--   textile-spark-net  AuthContext.tsx, bunny-delete-video, bunny-reconcile
--   DB  enforce_admin_grants(), admin.sync_from_profiles(),
--       record_embedding_pipeline_health()
-- is_admin() / admin_role() / admin.is_admin() / admin.role_of() already read
-- admin.admin_users.
--
-- THE TRANSITIONAL SHADOW WRITE. admin.sync_from_profiles() mirrors profiles →
-- admin_users only. A write RPC that updated admin_users alone would leave the
-- profiles columns stale while 5b's readers still read them. For example, an admin
-- granted by admin-invite would be refused by the panel's own login gate, and
-- the 5c pre-flight would see only_in_au > 0. So admin_grant / admin_set_role /
-- admin_revoke write admin_users FIRST (the truth), then call
-- admin.shadow_admin_columns(), which copies the same values onto profiles IF
-- AND ONLY IF the columns still exist. The mirror trigger then re-upserts
-- identical values, which is harmless and never touches created_by. After 5c drops
-- the columns, the shadow write is a no-op, so none of these functions need
-- redefining in 5c. enforce_admin_grants() lets the shadow UPDATE through because
-- inside a SECURITY DEFINER function current_user is postgres, not authenticated.
--
-- AUTHORIZATION. Inside SECURITY DEFINER, current_user is always the owner, so
-- it cannot identify the caller. The caller's JWT role can: auth.role() is
-- 'service_role' for the edge functions' service key, 'authenticated' for a
-- signed-in admin, and null for a direct postgres session.
--   whoami                 any signed-in caller, own row only
--   list_admins            is_admin()   (any active admin; matches today's page)
--   search_candidates      super_admin
--   set_role/grant/revoke  service_role OR super_admin; everyone else 42501
--   status_of              service_role only (EXECUTE and an in-body check)
--
-- HARDENING, strictly safer than today. set_role, revoke, and a grant that would
-- downgrade an existing super_admin refuse (42501) to leave zero active
-- super_admins. Today only React guards that, and losing the last one locks
-- everyone out of the RPC path. The escape hatch is intact: direct SQL as
-- postgres on admin.admin_users bypasses every function here.
--
-- All functions: SECURITY DEFINER, owner postgres, search_path = '' with every
-- name schema-qualified. EXECUTE is revoked from PUBLIC, anon, authenticated and
-- service_role (Supabase grants all four independently; revoking PUBLIC alone is
-- a no-op), then granted only as listed. The assertion block at the end proves
-- the resulting privileges with has_function_privilege.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Transitional shadow write (private; no client role may execute it) ───────
create or replace function admin.shadow_admin_columns(
  p_user_id  uuid,
  p_is_admin boolean,
  p_role     public.admin_role_type
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Phase 5 transitional: keeps public.profiles.is_admin / admin_role equal to
  -- admin.admin_users until 5c drops them, then becomes a no-op. Dynamic SQL so
  -- that this body stays valid after the columns are gone.
  if exists (
    select 1 from pg_catalog.pg_attribute
     where attrelid = 'public.profiles'::regclass
       and attname = 'is_admin' and not attisdropped
  ) then
    execute 'update public.profiles set is_admin = $2, admin_role = $3 where id = $1'
      using p_user_id, p_is_admin, case when p_is_admin then p_role end;
  end if;
end
$$;

-- ── 1. The caller's own admin identity ───────────────────────────────────────
create or replace function public.admin_whoami()
returns table (id uuid, email text, full_name text, is_admin boolean, role public.admin_role_type)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, p.full_name, (au.id is not null), au.admin_role
    from public.profiles p
    left join admin.admin_users au on au.id = p.id and au.is_active
   where p.id = auth.uid()
$$;

-- ── 2. Active-admin roster ───────────────────────────────────────────────────
create or replace function public.admin_list_admins()
returns table (id uuid, email text, full_name text, admin_role public.admin_role_type)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'not authorized: admins only' using errcode = '42501';
  end if;
  return query
    select au.id, p.email, p.full_name, au.admin_role
      from admin.admin_users au
      join public.profiles p on p.id = au.id
     where au.is_active
     order by au.admin_role, p.email;
end
$$;

-- ── 3. Promote candidates: non-admins by email ───────────────────────────────
create or replace function public.admin_search_candidates(p_query text)
returns table (id uuid, email text, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := btrim(coalesce(p_query, ''));
begin
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin', false) then
    raise exception 'not authorized: super_admin only' using errcode = '42501';
  end if;
  if length(v_q) < 3 then
    return;
  end if;
  return query
    select p.id, p.email, p.full_name
      from public.profiles p
     where p.email ilike '%' || v_q || '%'
       and not exists (select 1 from admin.admin_users au where au.id = p.id and au.is_active)
     order by p.email
     limit 10;
end
$$;

-- ── 4. Change an active admin's role ─────────────────────────────────────────
create or replace function public.admin_set_role(p_user_id uuid, p_role public.admin_role_type)
returns table (id uuid, admin_role public.admin_role_type, is_active boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_prev public.admin_role_type;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or coalesce(public.is_admin() and public.admin_role() = 'super_admin', false)) then
    raise exception 'not authorized: only a super_admin may change admin roles' using errcode = '42501';
  end if;
  if p_user_id is null or p_role is null then
    raise exception 'p_user_id and p_role are required' using errcode = '22004';
  end if;

  -- Serialise against concurrent super_admin changes before counting them.
  perform 1 from admin.admin_users u where u.admin_role = 'super_admin' and u.is_active for update;
  select u.admin_role into v_prev from admin.admin_users u where u.id = p_user_id and u.is_active for update;
  if not found then
    raise exception 'not an active admin: %', p_user_id using errcode = 'P0002';
  end if;
  if v_prev = 'super_admin' and p_role <> 'super_admin'
     and not exists (select 1 from admin.admin_users u
                      where u.admin_role = 'super_admin' and u.is_active and u.id <> p_user_id) then
    raise exception 'refused: this would leave no active super_admin' using errcode = '42501';
  end if;

  update admin.admin_users u set admin_role = p_role where u.id = p_user_id;
  perform admin.shadow_admin_columns(p_user_id, true, p_role);

  return query select u.id, u.admin_role, u.is_active from admin.admin_users u where u.id = p_user_id;
end
$$;

-- ── 5. Grant admin access (or re-activate / change role) ─────────────────────
create or replace function public.admin_grant(p_user_id uuid, p_role public.admin_role_type)
returns table (id uuid, admin_role public.admin_role_type, is_active boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_prev        public.admin_role_type;
  v_prev_active boolean;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or coalesce(public.is_admin() and public.admin_role() = 'super_admin', false)) then
    raise exception 'not authorized: only a super_admin may grant admin access' using errcode = '42501';
  end if;
  if p_user_id is null or p_role is null then
    raise exception 'p_user_id and p_role are required' using errcode = '22004';
  end if;
  if not exists (select 1 from auth.users au where au.id = p_user_id) then
    raise exception 'no such user: %', p_user_id using errcode = 'P0002';
  end if;

  perform 1 from admin.admin_users u where u.admin_role = 'super_admin' and u.is_active for update;
  select u.admin_role, u.is_active into v_prev, v_prev_active
    from admin.admin_users u where u.id = p_user_id for update;
  if coalesce(v_prev_active, false) and v_prev = 'super_admin' and p_role <> 'super_admin'
     and not exists (select 1 from admin.admin_users u
                      where u.admin_role = 'super_admin' and u.is_active and u.id <> p_user_id) then
    raise exception 'refused: this would leave no active super_admin' using errcode = '42501';
  end if;

  insert into admin.admin_users as u (id, admin_role, is_active, created_by)
  values (p_user_id, p_role, true, auth.uid())
  on conflict on constraint admin_users_pkey do update
    set admin_role = excluded.admin_role,
        is_active  = true,
        created_by = coalesce(auth.uid(), u.created_by);
  perform admin.shadow_admin_columns(p_user_id, true, p_role);

  return query select u.id, u.admin_role, u.is_active from admin.admin_users u where u.id = p_user_id;
end
$$;

-- ── 6. Revoke admin access ───────────────────────────────────────────────────
create or replace function public.admin_revoke(p_user_id uuid)
returns table (id uuid, admin_role public.admin_role_type, is_active boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_prev        public.admin_role_type;
  v_prev_active boolean;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or coalesce(public.is_admin() and public.admin_role() = 'super_admin', false)) then
    raise exception 'not authorized: only a super_admin may revoke admin access' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22004';
  end if;

  perform 1 from admin.admin_users u where u.admin_role = 'super_admin' and u.is_active for update;
  select u.admin_role, u.is_active into v_prev, v_prev_active
    from admin.admin_users u where u.id = p_user_id for update;
  if coalesce(v_prev_active, false) and v_prev = 'super_admin'
     and not exists (select 1 from admin.admin_users u
                      where u.admin_role = 'super_admin' and u.is_active and u.id <> p_user_id) then
    raise exception 'refused: this would leave no active super_admin' using errcode = '42501';
  end if;

  -- Idempotent: revoking a non-admin changes nothing and returns no row.
  update admin.admin_users u set is_active = false where u.id = p_user_id;
  perform admin.shadow_admin_columns(p_user_id, false, null);

  return query select u.id, u.admin_role, u.is_active from admin.admin_users u where u.id = p_user_id;
end
$$;

-- ── 7. Any user's admin status — for the service-role edge functions ─────────
create or replace function public.admin_status_of(p_user_id uuid)
returns table (is_admin boolean, admin_role public.admin_role_type)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Belt and braces on top of the EXECUTE grant: a client JWT may never ask
  -- about another user's admin status.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'not authorized: service role only' using errcode = '42501';
  end if;
  return query
    select exists (select 1 from admin.admin_users u where u.id = p_user_id and u.is_active),
           (select u.admin_role from admin.admin_users u where u.id = p_user_id and u.is_active);
end
$$;

-- ── Comments ─────────────────────────────────────────────────────────────────
comment on function admin.shadow_admin_columns(uuid, boolean, public.admin_role_type) is 'Admin-schema separation 5a, TRANSITIONAL. Copies admin_users state onto public.profiles.is_admin/admin_role while those columns exist; no-op once 5c drops them. Private: no client role may execute it.';
comment on function public.admin_whoami()                                 is 'Admin-schema separation 5a. The caller''s own (id, email, full_name, is_admin, role) from profiles + admin.admin_users. is_admin=false / role=null when there is no active admin_users row; no row at all when there is no profile.';
comment on function public.admin_list_admins()                            is 'Admin-schema separation 5a. Active-admin roster. Gate: is_admin(). Raises 42501 otherwise.';
comment on function public.admin_search_candidates(text)                  is 'Admin-schema separation 5a. Up to 10 non-admin profiles whose email ilike-matches p_query (min 3 chars). Gate: super_admin. Raises 42501 otherwise.';
comment on function public.admin_set_role(uuid, public.admin_role_type)   is 'Admin-schema separation 5a. Change an active admin''s role. Gate: service_role or super_admin. Refuses to leave zero active super_admins. Raises 42501 otherwise.';
comment on function public.admin_grant(uuid, public.admin_role_type)      is 'Admin-schema separation 5a. Upsert an active admin_users row. Gate: service_role (admin-invite) or super_admin. Refuses to leave zero active super_admins. Raises 42501 otherwise.';
comment on function public.admin_revoke(uuid)                             is 'Admin-schema separation 5a. Deactivate an admin_users row. Gate: service_role or super_admin. Refuses to leave zero active super_admins. Raises 42501 otherwise.';
comment on function public.admin_status_of(uuid)                          is 'Admin-schema separation 5a. (is_admin, admin_role) for any user, from admin.admin_users. service_role only: for edge functions that authorize a decoded caller id.';

-- ── Ownership and grants ─────────────────────────────────────────────────────
do $grants$
declare
  r record;
begin
  for r in
    select * from (values
      ('admin.shadow_admin_columns(uuid, boolean, public.admin_role_type)', array[]::text[]),
      ('public.admin_whoami()',                               array['authenticated']),
      ('public.admin_list_admins()',                          array['authenticated']),
      ('public.admin_search_candidates(text)',                array['authenticated']),
      ('public.admin_set_role(uuid, public.admin_role_type)', array['authenticated', 'service_role']),
      ('public.admin_grant(uuid, public.admin_role_type)',    array['authenticated', 'service_role']),
      ('public.admin_revoke(uuid)',                           array['authenticated', 'service_role']),
      ('public.admin_status_of(uuid)',                        array['service_role'])
    ) as t(fn, grantees)
  loop
    execute format('alter function %s owner to postgres', r.fn);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.fn);
    if cardinality(r.grantees) > 0 then
      execute format('grant execute on function %s to %s', r.fn, array_to_string(r.grantees, ', '));
    end if;
  end loop;
end
$grants$;

-- ── Post-assertions: prove the privileges, don't trust the revokes ───────────
do $assert$
declare
  r record;
  v_has boolean;
begin
  for r in
    select * from (values
      ('admin.shadow_admin_columns(uuid, boolean, public.admin_role_type)', false, false, false),
      ('public.admin_whoami()',                               false, true,  false),
      ('public.admin_list_admins()',                          false, true,  false),
      ('public.admin_search_candidates(text)',                false, true,  false),
      ('public.admin_set_role(uuid, public.admin_role_type)', false, true,  true),
      ('public.admin_grant(uuid, public.admin_role_type)',    false, true,  true),
      ('public.admin_revoke(uuid)',                           false, true,  true),
      ('public.admin_status_of(uuid)',                        false, false, true)
    ) as t(fn, want_anon, want_auth, want_service)
  loop
    if has_function_privilege('anon', r.fn, 'execute') <> r.want_anon
       or has_function_privilege('authenticated', r.fn, 'execute') <> r.want_auth
       or has_function_privilege('service_role', r.fn, 'execute') <> r.want_service then
      raise exception 'privilege assertion failed for %', r.fn;
    end if;
    select p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
           and p.proconfig @> array['search_path=""']
      into v_has
      from pg_proc p where p.oid = r.fn::regprocedure;
    if not v_has then
      raise exception 'definer/owner/search_path assertion failed for %', r.fn;
    end if;
  end loop;
end
$assert$;
