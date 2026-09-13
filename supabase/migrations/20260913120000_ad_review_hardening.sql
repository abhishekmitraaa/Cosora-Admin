-- Review pass on the Advertising v3 work. Four gaps, all introduced by it.
--
-- 1. ADMIN ANALYTICS WERE READABLE BY EVERY SIGNED-IN USER.
--    ad_review_metrics() and ad_fraud_signals() are SECURITY DEFINER and were
--    granted to `authenticated` with NO authorization check inside them. The
--    nine review RPCs each check ad_moderator() and raise; these two do not,
--    and they were written later, so the pattern was not carried across.
--    Confirmed live: signing in as demo-buyer and calling
--    /rest/v1/rpc/ad_review_metrics returned the real queue depth, decision
--    counts and rejection-reason breakdown. ad_fraud_signals returned [] only
--    because nothing is currently flagged — with data it would have handed any
--    buyer a list of vendor ids, click counts and suspected-fraud reasons.
--
-- 2. NEW HELPER FUNCTIONS KEPT SUPABASE'S DEFAULT PUBLIC EXECUTE GRANT.
--    The review RPCs were explicitly revoked from public/anon; the helpers
--    added alongside them were not, so they were exposed on the REST API.
--    Confirmed live as an ANONYMOUS caller:
--      vendor_account_in_good_standing('<vendor uuid>') -> true
--          (probe any account's suspension state, unauthenticated)
--      ad_target_live_status('<ad uuid>')               -> schedule state
--    None of them need to be callable from outside the database: every one is
--    invoked from inside a SECURITY DEFINER function owned by postgres, which
--    executes as the owner and is unaffected by these revokes.
--
-- 3. TIME-TO-DECISION COULD NEVER BE COMPUTED.
--    ad_review_metrics derives `queued_at` from an ad_review_log row whose
--    new_status is 'pending_review'. Nothing wrote one when a campaign FIRST
--    entered the queue — the payment path INSERTs and guard_ad_activation
--    redirects the status, writing no log row — so only resubmissions had a
--    queued_at. Live result: 12 decisions recorded, avg_hours_to_decision null.
--    The decision constraint has always allowed 'submitted'; nothing wrote it.
--
-- 4. DELETING A CAMPAIGN ERASED ITS "APPEND-ONLY" REVIEW HISTORY.
--    ad_review_log has no UPDATE or DELETE grant, so the log itself cannot be
--    edited — but ad_review_log.ad_id is ON DELETE CASCADE and the
--    advertisements DELETE policy admits the row's owner. Confirmed live: a
--    campaign with a decision row, deleted by its owner, left zero log rows.
--    So a vendor rejected for misleading claims could delete the campaign and
--    leave no trace of the rejection before submitting a fresh one.

-- ── 1. Authorization inside the two analytics functions ─────────────────────
-- Both become plpgsql so they can RAISE rather than quietly returning nothing;
-- a moderator reading an empty fraud queue must be able to trust it is empty.

create or replace function public.ad_review_metrics(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: ad review metrics require the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  return (
    with decided as (
      select l.ad_id, l.created_at as decided_at, l.decision,
             (select max(p.created_at) from public.ad_review_log p
               where p.ad_id = l.ad_id
                 and p.new_status = 'pending_review'
                 and p.created_at <= l.created_at) as queued_at
        from public.ad_review_log l
       where l.decision in ('approved', 'rejected', 'changes_requested')
         and l.created_at >= now() - make_interval(days => greatest(1, p_days))
    )
    select jsonb_build_object(
      'window_days', greatest(1, p_days),
      'queue_depth', jsonb_build_object(
        'pending_review',    (select count(*) from public.advertisements where status = 'pending_review'),
        'changes_requested', (select count(*) from public.advertisements where status = 'changes_requested'),
        'scheduled',         (select count(*) from public.advertisements where status = 'scheduled'),
        'active',            (select count(*) from public.advertisements where status = 'active'),
        'suspended',         (select count(*) from public.advertisements where status = 'suspended')
      ),
      'oldest_waiting_hours', (
        select round(extract(epoch from (now() - min(created_at))) / 3600.0, 1)
          from public.advertisements where status = 'pending_review'
      ),
      'decisions', (select count(*) from decided),
      'avg_hours_to_decision', (
        select round(avg(extract(epoch from (decided_at - queued_at))) / 3600.0, 1)
          from decided where queued_at is not null
      ),
      'decision_breakdown', coalesce((
        select jsonb_object_agg(decision, n)
          from (select decision, count(*) as n from decided group by decision) d
      ), '{}'::jsonb),
      'rejection_reasons', coalesce((
        select jsonb_object_agg(reason, n) from (
          select coalesce(reason_code, 'unspecified') as reason, count(*) as n
            from public.ad_review_log
           where decision = 'rejected'
             and created_at >= now() - make_interval(days => greatest(1, p_days))
           group by 1
        ) r
      ), '{}'::jsonb),
      'fraud_flagged', (select count(*) from public.ad_fraud_signals(greatest(1, p_days)))
    )
  );
end $$;

create or replace function public.ad_fraud_signals(p_days integer default 7)
returns table(
  ad_id             uuid,
  title             text,
  vendor_id         uuid,
  status            text,
  clicks            bigint,
  distinct_viewers  bigint,
  clicks_per_viewer numeric,
  post_click_events bigint,
  depth_ratio       numeric,
  reasons           text[]
)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: the invalid-traffic queue requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  return query
  with win as (
    select * from public.engagement_events e
     where e.ad_id is not null
       and e.created_at >= now() - make_interval(days => greatest(1, p_days))
  ),
  clicks as (
    select e.ad_id as cad,
           count(*) filter (where e.event_type = 'ad_click') as n_clicks,
           count(distinct coalesce(e.viewer_id::text, e.session_id)) filter (where e.event_type = 'ad_click')
             as n_viewers,
           count(*) filter (where e.event_type in ('product_view', 'profile_view') and e.source = 'ad')
             as n_post
      from win e group by e.ad_id
  )
  select a.id, a.title, a.vendor_id, a.status,
         c.n_clicks, c.n_viewers,
         round(c.n_clicks::numeric / nullif(c.n_viewers, 0), 2),
         c.n_post,
         round(c.n_post::numeric / nullif(c.n_clicks, 0), 2),
         array_remove(array[
           case when c.n_clicks >= 10 and c.n_viewers <= 2
                then 'clicks concentrated in very few viewers' end,
           case when c.n_clicks >= 10
                 and c.n_post::numeric / nullif(c.n_clicks, 0) < 0.2
                then 'clicks rarely lead to a product or profile view' end,
           case when c.n_clicks >= 10
                 and c.n_clicks::numeric / nullif(c.n_viewers, 0) >= 5
                then 'the same viewer clicked many times' end
         ], null)
    from clicks c
    join public.advertisements a on a.id = c.cad
   where c.n_clicks >= 10
     and (
       c.n_viewers <= 2
       or c.n_post::numeric / nullif(c.n_clicks, 0) < 0.2
       or c.n_clicks::numeric / nullif(c.n_viewers, 0) >= 5
     )
   order by c.n_clicks desc, a.id desc;
end $$;

revoke all on function public.ad_review_metrics(integer) from public, anon;
revoke all on function public.ad_fraud_signals(integer) from public, anon;
grant execute on function public.ad_review_metrics(integer) to authenticated;
grant execute on function public.ad_fraud_signals(integer) to authenticated;

-- ── 2. Close the helper functions off the REST API ──────────────────────────
-- Revoking PUBLIC alone is a no-op on Supabase: anon/authenticated hold the
-- privilege in their own right and have to be named. Verified afterwards with
-- has_function_privilege rather than assumed.
do $$
declare f text;
begin
  foreach f in array array[
    'ad_moderator()',
    'ad_owner(uuid)',
    'ad_target_live_status(uuid)',
    'ad_viewer_city()',
    'vendor_account_in_good_standing(uuid)',
    'ad_frequency_capped(uuid, text, integer)',
    'ad_logging_throttled(uuid, text, interval)',
    'ad_seal_sources(text)',
    'is_ad_eligible(public.advertisements, uuid[], text)',
    'ad_targeting_matches(public.advertisements, uuid[], text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ── 3. Record the moment a campaign enters the queue ────────────────────────
-- AFTER INSERT only. A resubmission already writes its own 'resubmitted' row
-- with new_status = 'pending_review', which is what ad_review_metrics reads as
-- queued_at, so covering the first submission closes the gap exactly without
-- double-counting.
create or replace function public.log_ad_submission()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'pending_review' then
    insert into public.ad_review_log (ad_id, reviewer_id, decision, previous_status, new_status)
    values (new.id, null, 'submitted', null, 'pending_review');
  end if;
  return null;
end $$;

drop trigger if exists trg_ad_log_submission on public.advertisements;
create trigger trg_ad_log_submission
  after insert on public.advertisements
  for each row execute function public.log_ad_submission();

-- ── 4. A campaign with a review history cannot be deleted by its vendor ─────
-- SECURITY INVOKER, and short-circuiting on `current_user <> 'authenticated'`,
-- exactly as enforce_ads_moderation does: service_role and the cleanup scripts
-- pass through, a signed-in vendor does not. A definer function would see its
-- own owner as current_user and the check would never fire.
create or replace function public.guard_ad_deletion()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return old;
  end if;
  if public.is_admin() then
    return old;
  end if;
  -- No uuid in the message: the vendor dashboard surfaces this verbatim in a
  -- toast, where a raw id is noise to the person reading it.
  if exists (select 1 from public.ad_review_log where ad_id = old.id) then
    raise exception
      'This campaign has already been reviewed, so its history cannot be deleted. Pause it instead, or ask Cosora to archive it.'
      using errcode = '42501';
  end if;
  return old;
end $$;

drop trigger if exists trg_guard_ad_deletion on public.advertisements;
create trigger trg_guard_ad_deletion
  before delete on public.advertisements
  for each row execute function public.guard_ad_deletion();
