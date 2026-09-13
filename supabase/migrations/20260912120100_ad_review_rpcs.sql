-- Phase 2 — Review RPCs.
--
-- Shape copied from approve_vendor_content/reject_vendor_content, which are the
-- functions this project already uses for product/video/catalogue moderation:
--   * SECURITY DEFINER, search_path pinned to public
--   * authorization checked INSIDE the function, raising on refusal
--   * `get diagnostics affected = row_count` and a raise when zero rows matched
--
-- That last point is the whole reason these exist. The documented trap in this
-- codebase is that a client UPDATE which RLS denies matches zero rows and
-- PostgREST reports SUCCESS — so a moderator would see "Campaign rejected" and
-- the campaign would still be live. Every function below raises instead.
--
-- These run as postgres, so:
--   * enforce_ads_moderation() short-circuits on `current_user <> 'authenticated'`
--     and never sees them — intended, authorization is here instead;
--   * guard_ad_activation() IS SECURITY DEFINER and reads auth.role()/auth.uid()
--     from the JWT, which does NOT change inside a definer function, so it would
--     still refuse a legitimate resume. Hence the `cosora.ad_review` transaction
--     flag, set only by ad_apply_decision below.

-- ── Internal applier. No authorization: every caller checks first. ──────────
create or replace function public.ad_apply_decision(
  p_ad_id       uuid,
  p_new_status  text,
  p_decision    text,
  p_reason_code text default null,
  p_note        text default null,
  p_reviewer    uuid default null,
  p_notify_title text default null,
  p_notify_body  text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prev   text;
  v_vendor uuid;
  affected int;
begin
  select status, vendor_id into v_prev, v_vendor
    from public.advertisements where id = p_ad_id;
  if v_prev is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;

  perform set_config('cosora.ad_review', 'on', true);

  update public.advertisements
     set status            = p_new_status,
         moderation_reason = case
                               when p_reason_code is null and p_note is null then moderation_reason
                               else nullif(trim(both ' ' from
                                      coalesce(p_reason_code, '') || ' ' || coalesce(p_note, '')), '')
                             end,
         moderated_at      = case when p_reviewer is null then moderated_at else now() end,
         moderated_by      = coalesce(p_reviewer, moderated_by)
   where id = p_ad_id;

  get diagnostics affected = row_count;
  perform set_config('cosora.ad_review', '', true);

  if affected = 0 then
    raise exception 'campaign % could not be moved to %', p_ad_id, p_new_status
      using errcode = 'P0002';
  end if;

  insert into public.ad_review_log
    (ad_id, reviewer_id, decision, reason_code, note, previous_status, new_status)
  values
    (p_ad_id, p_reviewer, p_decision, p_reason_code, p_note, v_prev, p_new_status);

  -- Interim vendor notification. Cosora's own messaging service (separate repo)
  -- will later deliver these over its API; this is the real in-app channel the
  -- project already uses everywhere else (see set_account_status). See ToDo.md.
  if p_notify_title is not null then
    perform public.notify(v_vendor, 'ad_' || p_decision, p_notify_title, p_notify_body);
  end if;
end;
$$;

revoke all on function public.ad_apply_decision(uuid, text, text, text, text, uuid, text, text)
  from public, anon, authenticated;

-- ── Shared predicates ───────────────────────────────────────────────────────
create or replace function public.ad_moderator()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select coalesce(public.is_admin() and public.admin_role()
              in ('super_admin', 'ads_moderator'), false); $$;

create or replace function public.ad_owner(p_ad_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
-- coalesce to false: auth.uid() is null for an anonymous caller, and
-- `null = vendor_id` is NULL, which `if not (...)` would skip entirely. That
-- NULL-guard mistake is how an authorization check silently becomes a no-op.
as $$ select coalesce((select vendor_id = auth.uid()
                       from public.advertisements where id = p_ad_id), false); $$;

-- Where an approved campaign should land, given its schedule (Phase 1.3).
create or replace function public.ad_target_live_status(p_ad_id uuid)
returns text language sql stable security definer set search_path to 'public'
as $$
  select case
           when a.ends_at is not null and a.ends_at <= now() then 'expired'
           when a.starts_at is not null and a.starts_at > now() then 'scheduled'
           else 'active'
         end
  from public.advertisements a where a.id = p_ad_id;
$$;

-- ── approve ─────────────────────────────────────────────────────────────────
create or replace function public.approve_ad_campaign(p_ad_id uuid, p_note text default null)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare v_cur text; v_target text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: approving a campaign requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur <> 'pending_review' then
    raise exception 'campaign % is %, only a pending_review campaign can be approved', p_ad_id, v_cur
      using errcode = 'P0001';
  end if;

  v_target := public.ad_target_live_status(p_ad_id);
  if v_target = 'expired' then
    raise exception 'campaign % has already ended; approving it would publish nothing', p_ad_id
      using errcode = 'P0001';
  end if;

  perform public.ad_apply_decision(
    p_ad_id, v_target, 'approved', null, p_note, auth.uid(),
    case when v_target = 'scheduled'
         then 'Your campaign was approved and is scheduled'
         else 'Your campaign was approved and is now live' end,
    p_note);
  return v_target;
end $$;

-- ── reject ──────────────────────────────────────────────────────────────────
create or replace function public.reject_ad_campaign(p_ad_id uuid, p_reason_code text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_cur text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: rejecting a campaign requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_reason_code), '') = '' then
    raise exception 'a reason_code is required to reject a campaign' using errcode = '22023';
  end if;

  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur in ('rejected', 'archived') then
    raise exception 'campaign % is already %', p_ad_id, v_cur using errcode = 'P0001';
  end if;

  perform public.ad_apply_decision(
    p_ad_id, 'rejected', 'rejected', p_reason_code, p_note, auth.uid(),
    'Your campaign was not approved', coalesce(p_note, p_reason_code));
end $$;

-- ── request changes ─────────────────────────────────────────────────────────
create or replace function public.request_ad_changes(p_ad_id uuid, p_reason_code text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_cur text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: requesting changes requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_reason_code), '') = '' then
    raise exception 'a reason_code is required to request changes' using errcode = '22023';
  end if;

  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur <> 'pending_review' then
    raise exception 'campaign % is %, changes can only be requested on a pending_review campaign', p_ad_id, v_cur
      using errcode = 'P0001';
  end if;

  perform public.ad_apply_decision(
    p_ad_id, 'changes_requested', 'changes_requested', p_reason_code, p_note, auth.uid(),
    'Your campaign needs changes before it can run', coalesce(p_note, p_reason_code));
end $$;

-- ── resubmit (vendor) ───────────────────────────────────────────────────────
create or replace function public.resubmit_ad_campaign(p_ad_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_cur text;
begin
  if not (public.ad_owner(p_ad_id) or public.ad_moderator()) then
    raise exception 'not authorized: only the campaign owner can resubmit it' using errcode = '42501';
  end if;

  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur <> 'changes_requested' then
    raise exception 'campaign % is %, only a changes_requested campaign can be resubmitted', p_ad_id, v_cur
      using errcode = 'P0001';
  end if;

  -- p_reviewer is null on purpose: the vendor is not a reviewer, and
  -- moderated_by means "who decided". The log row still records the action.
  perform public.ad_apply_decision(
    p_ad_id, 'pending_review', 'resubmitted', null, null, null, null, null);
end $$;

-- ── pause / resume ──────────────────────────────────────────────────────────
create or replace function public.pause_ad_campaign_by_vendor(p_ad_id uuid, p_reason_code text default null)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_cur text;
begin
  if not public.ad_owner(p_ad_id) then
    raise exception 'not authorized: only the campaign owner can pause it' using errcode = '42501';
  end if;
  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur not in ('active', 'scheduled') then
    raise exception 'campaign % is %, only a running or scheduled campaign can be paused', p_ad_id, v_cur
      using errcode = 'P0001';
  end if;
  perform public.ad_apply_decision(p_ad_id, 'paused_by_vendor', 'paused', p_reason_code, null, null, null, null);
end $$;

create or replace function public.pause_ad_campaign_by_admin(p_ad_id uuid, p_reason_code text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_cur text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: pausing a campaign requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_reason_code), '') = '' then
    raise exception 'a reason_code is required when an admin pauses a campaign' using errcode = '22023';
  end if;
  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur not in ('active', 'scheduled', 'paused_by_vendor', 'paused') then
    raise exception 'campaign % is %, it is not running', p_ad_id, v_cur using errcode = 'P0001';
  end if;
  perform public.ad_apply_decision(
    p_ad_id, 'paused_by_admin', 'paused', p_reason_code, null, auth.uid(),
    'Your campaign was paused by Cosora', p_reason_code);
end $$;

create or replace function public.resume_ad_campaign(p_ad_id uuid)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare v_cur text; v_target text; v_is_admin boolean := public.ad_moderator();
begin
  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;

  -- Whoever's pause it was, or an admin regardless. A vendor may NOT lift an
  -- admin's pause — that is the difference between the two paused states, and
  -- collapsing them into one 'paused' value is exactly what would lose it.
  if v_cur = 'paused_by_admin' then
    if not v_is_admin then
      raise exception 'not authorized: this campaign was paused by Cosora and only an admin can resume it'
        using errcode = '42501';
    end if;
  elsif v_cur in ('paused_by_vendor', 'paused') then
    if not (public.ad_owner(p_ad_id) or v_is_admin) then
      raise exception 'not authorized: only the campaign owner or an admin can resume it' using errcode = '42501';
    end if;
  else
    raise exception 'campaign % is %, only a paused campaign can be resumed', p_ad_id, v_cur
      using errcode = 'P0001';
  end if;

  v_target := public.ad_target_live_status(p_ad_id);
  if v_target = 'expired' then
    raise exception 'campaign % ended while it was paused; it cannot be resumed', p_ad_id
      using errcode = 'P0001';
  end if;

  perform public.ad_apply_decision(
    p_ad_id, v_target, 'resumed', null, null,
    case when v_is_admin then auth.uid() else null end, null, null);
  return v_target;
end $$;

-- ── suspend / archive ───────────────────────────────────────────────────────
create or replace function public.suspend_ad_campaign(p_ad_id uuid, p_reason_code text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_cur text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: suspending a campaign requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_reason_code), '') = '' then
    raise exception 'a reason_code is required to suspend a campaign' using errcode = '22023';
  end if;
  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur in ('suspended', 'archived') then
    raise exception 'campaign % is already %', p_ad_id, v_cur using errcode = 'P0001';
  end if;
  perform public.ad_apply_decision(
    p_ad_id, 'suspended', 'suspended', p_reason_code, p_note, auth.uid(),
    'Your campaign was suspended pending review', coalesce(p_note, p_reason_code));
end $$;

create or replace function public.archive_ad_campaign(p_ad_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_cur text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: archiving a campaign requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;
  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur not in ('rejected', 'expired', 'suspended', 'ended') then
    raise exception 'campaign % is %, only a terminal campaign can be archived', p_ad_id, v_cur
      using errcode = 'P0001';
  end if;
  perform public.ad_apply_decision(p_ad_id, 'archived', 'archived', null, null, auth.uid(), null, null);
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Supabase grants EXECUTE to PUBLIC by default, and revoking PUBLIC alone is a
-- no-op because anon/authenticated/service_role hold the privilege in their own
-- right. Every one of them has to be named. Verified with has_function_privilege
-- after apply, not assumed.
do $$
declare f text;
begin
  foreach f in array array[
    'approve_ad_campaign(uuid, text)',
    'reject_ad_campaign(uuid, text, text)',
    'request_ad_changes(uuid, text, text)',
    'resubmit_ad_campaign(uuid)',
    'pause_ad_campaign_by_vendor(uuid, text)',
    'pause_ad_campaign_by_admin(uuid, text)',
    'resume_ad_campaign(uuid)',
    'suspend_ad_campaign(uuid, text, text)',
    'archive_ad_campaign(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
