-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN SCHEMA SEPARATION — PHASE 5c: RETIRE public.profiles.is_admin /
-- public.profiles.admin_role. IRREVERSIBLE (column drop).
--
-- After this, admin.admin_users is the ONLY source of truth for who is an admin
-- and in what role. is_admin() / admin_role() / admin.is_admin() /
-- admin.role_of() and the 5a RPCs already read it. This removes the shadow:
--   1) enforce_admin_grants(): drop every is_admin/admin_role branch, keep the
--      account_status guard and the non-authenticated short-circuit.
--   2) record_embedding_pipeline_health(): alert recipients come from
--      admin.admin_users (joined through profiles for the notifications FK).
--      ONLY the recipient FROM/WHERE changes; the post-assertion proves the new
--      body equals the old body with exactly that fragment substituted.
--   3) drop trigger trg_profiles_sync_admin_users (the profiles -> admin_users
--      mirror; it is `UPDATE OF is_admin, admin_role`, so it depends on the
--      columns and must go first)
--   4) drop function admin.sync_from_profiles()
--   5) drop constraint profiles_admin_requires_role (spans both columns; dropped
--      explicitly, not left to CASCADE)
--   6) drop column is_admin, drop column admin_role (is_admin's default goes with it)
--
-- Deliberately KEPT: admin.shadow_admin_columns(). Its profiles write is dynamic
-- SQL behind a pg_attribute existence check, so from here on it is a no-op. The
-- committed dev scripts (seed-test-admins / invite-tests-cleanup) and the 5a
-- write RPCs still call it.
--
-- Preconditions checked here and aborted on: both target functions md5-equal
-- the definitions inspected at Step 0 (2026-09-22); zero admin drift in either
-- direction; nothing depends on the columns beyond the trigger, the CHECK and the
-- is_admin default. Production (both apps and all four admin-gated edge
-- functions) already never reads or writes the columns (verified in the live
-- bundles before applying).
--
-- Rollback: NONE for a successful run; this is a one-way door. A FAILED run
-- rolls back entirely (single transaction). Disaster recovery only: re-add both
-- columns as nullable and backfill from admin.admin_users. That restores the
-- shadow but not the mirror. Fix any missed reader FORWARD instead.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Pre-guards ───────────────────────────────────────────────────────────────
do $pre$
declare
  v_bad text;
begin
  if md5(pg_get_functiondef('public.enforce_admin_grants()'::regprocedure)) <> '449affdf69d311e443caededa5a2a896' then
    raise exception 'enforce_admin_grants() changed since Step 0; re-inspect before dropping';
  end if;
  if md5(pg_get_functiondef('public.record_embedding_pipeline_health()'::regprocedure)) <> 'fd348f7a597024b9728ad733ae5d9ce6' then
    raise exception 'record_embedding_pipeline_health() changed since Step 0; re-inspect before dropping';
  end if;

  if (select count(*) from information_schema.columns where table_schema = 'public'
        and table_name = 'profiles' and column_name in ('is_admin', 'admin_role')) <> 2 then
    raise exception 'expected both columns present';
  end if;
  if exists (select 1 from public.profiles p where p.is_admin
               and not exists (select 1 from admin.admin_users au where au.id = p.id and au.is_active))
     or exists (select 1 from admin.admin_users au where au.is_active
               and not exists (select 1 from public.profiles p where p.id = au.id and p.is_admin))
     or exists (select 1 from public.profiles p join admin.admin_users au on au.id = p.id and au.is_active
               where p.is_admin and p.admin_role is distinct from au.admin_role) then
    raise exception 'admin drift between profiles and admin_users; never drop with drift';
  end if;

  -- Only the known dependents may reference the columns.
  select string_agg(distinct d.classid::regclass::text || ':' || d.objid::text, ', ') into v_bad
    from pg_depend d
    join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
   where d.refobjid = 'public.profiles'::regclass
     and a.attname in ('is_admin', 'admin_role')
     and not (d.classid = 'pg_trigger'::regclass
              and d.objid = (select oid from pg_trigger where tgname = 'trg_profiles_sync_admin_users'))
     and not (d.classid = 'pg_constraint'::regclass
              and d.objid = (select oid from pg_constraint where conname = 'profiles_admin_requires_role'))
     and not (d.classid = 'pg_attrdef'::regclass);
  if v_bad is not null then
    raise exception 'unexpected dependents on the admin columns: %', v_bad;
  end if;
end
$pre$;

-- Keep the pre-change health function body for the post-assertion.
create temp table _p5c_before on commit drop as
  select pg_get_functiondef('public.record_embedding_pipeline_health()'::regprocedure) as health_def;

-- ── 1. enforce_admin_grants: account_status guard only ───────────────────────
create or replace function public.enforce_admin_grants()
returns trigger language plpgsql set search_path to 'public' as $fn$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not coalesce(public.is_admin() and public.admin_role() = 'super_admin', false) then
      new.account_status := 'active';
    end if;
    return new;
  end if;
  -- UPDATE
  if new.account_status is distinct from old.account_status then
    raise exception 'account_status is set only via set_account_status()' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

-- ── 2. record_embedding_pipeline_health: recipients from admin.admin_users ───
-- Body is the live definition verbatim, except the recipient FROM/WHERE.
create or replace function public.record_embedding_pipeline_health()
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  h          record;
  v_previous text;
begin
  select * into h from public.embedding_pipeline_health();

  select status into v_previous
  from public.embedding_pipeline_health_log
  order by checked_at desc limit 1;

  insert into public.embedding_pipeline_health_log
    (status, reason, queue_depth, products_missing, rfqs_missing, videos_missing, vault_secret_ok)
  values
    (h.status, h.reason, h.queue_depth, h.products_missing, h.rfqs_missing, h.videos_missing, h.vault_secret_ok);

  if h.status <> 'OK' and (v_previous is null or v_previous = 'OK') then
    insert into public.notifications (profile_id, kind, title, body)
    select p.id,
           'system',
           'Embedding pipeline: ' || h.status,
           coalesce(h.reason, 'no reason reported')
             || ' (queue ' || coalesce(h.queue_depth, 0)
             || ', missing: ' || coalesce(h.products_missing, 0) || ' products / '
             || coalesce(h.rfqs_missing, 0) || ' RFQs / '
             || coalesce(h.videos_missing, 0) || ' videos)'
    from admin.admin_users au
    join public.profiles p on p.id = au.id
    where au.is_active;

    perform public.notify_embedding_alert_webhook(h.status, h.reason, h.queue_depth);
  end if;

  delete from public.embedding_pipeline_health_log
  where checked_at < now() - interval '90 days';

  return h.status;
end
$function$;

-- ── 3–6. Remove the mirror, the CHECK and the columns ────────────────────────
drop trigger trg_profiles_sync_admin_users on public.profiles;
drop function admin.sync_from_profiles();
alter table public.profiles drop constraint profiles_admin_requires_role;
alter table public.profiles drop column is_admin;
alter table public.profiles drop column admin_role;

comment on function public.enforce_admin_grants() is
  'Guards profiles.account_status: only set_account_status() may change it; a non-super_admin client INSERT is forced to active. Admin identity lives in admin.admin_users (admin-schema separation Phase 5c removed the is_admin/admin_role columns and their guards).';

-- ── Post-assertions ──────────────────────────────────────────────────────────
do $post$
declare
  v_old text := (select health_def from _p5c_before);
  v_new text := pg_get_functiondef('public.record_embedding_pipeline_health()'::regprocedure);
  v_expected text;
begin
  -- A. Everything that was retired is gone.
  if exists (select 1 from information_schema.columns where table_schema = 'public'
               and table_name = 'profiles' and column_name in ('is_admin', 'admin_role')) then
    raise exception 'columns still present';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'trg_profiles_sync_admin_users') then
    raise exception 'mirror trigger still present';
  end if;
  if to_regprocedure('admin.sync_from_profiles()') is not null then
    raise exception 'admin.sync_from_profiles still present';
  end if;
  if exists (select 1 from pg_constraint where conname = 'profiles_admin_requires_role') then
    raise exception 'CHECK still present';
  end if;

  -- B. The health function changed ONLY in the recipient FROM/WHERE.
  v_expected := replace(v_old,
    E'    from public.profiles p\n    where p.is_admin;\n',
    E'    from admin.admin_users au\n    join public.profiles p on p.id = au.id\n    where au.is_active;\n');
  if v_expected = v_old then
    raise exception 'recipient fragment not found in the pre-change body';
  end if;
  if v_new <> v_expected then
    raise exception 'record_embedding_pipeline_health() differs from the pre-change body by more than the recipient block';
  end if;

  -- C. Security properties preserved.
  if not exists (select 1 from pg_proc where oid = 'public.record_embedding_pipeline_health()'::regprocedure
                   and prosecdef and pg_get_userbyid(proowner) = 'postgres'
                   and proconfig = array['search_path=public, extensions']
                   and proacl::text = '{postgres=X/postgres,service_role=X/postgres}') then
    raise exception 'record_embedding_pipeline_health() lost definer/owner/search_path/ACL';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.enforce_admin_grants()'::regprocedure
                   and not prosecdef and pg_get_userbyid(proowner) = 'postgres'
                   and proconfig = array['search_path=public']) then
    raise exception 'enforce_admin_grants() lost invoker/owner/search_path';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_profiles_admin_grants'
                   and tgrelid = 'public.profiles'::regclass
                   and tgfoid = 'public.enforce_admin_grants()'::regprocedure) then
    raise exception 'trg_profiles_admin_grants no longer calls enforce_admin_grants()';
  end if;

  -- D. No function body anywhere still names the columns outside helper calls,
  --    except shadow_admin_columns' guarded dynamic SQL string.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'admin') and p.prokind = 'f'
       and p.oid <> 'admin.shadow_admin_columns(uuid, boolean, public.admin_role_type)'::regprocedure
       and regexp_replace(regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
             '(new|old|p|profiles)\.(is_admin|admin_role)\M', 'X', 'gi') <> regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')
       and pg_get_functiondef(p.oid) ~* 'profiles') then
    raise exception 'a function still reads profiles.is_admin/admin_role';
  end if;

  -- E. Admin identity intact: same active admins as before the drop.
  if (select count(*) from admin.admin_users where is_active) <> 3 then
    raise exception 'active admin count changed';
  end if;
end
$post$;
