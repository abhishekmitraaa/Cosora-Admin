-- Phase 6.3 + 8.3 — invalid-traffic signal, and review-queue reporting.
--
-- A NOTE ON WHAT THIS DELIBERATELY DOES NOT DO.
--
-- The brief said a flagged campaign "gets routed to suspend_ad_campaign(
-- reason_code='fraud_review')" and, one sentence later, "Never auto-block —
-- human review only, false positives are expensive at this scale." Those are
-- incompatible: suspending IS blocking, and a suspended campaign stops earning
-- the vendor money immediately.
--
-- This implements the second instruction. ad_fraud_signals() is READ-ONLY: it
-- ranks campaigns by how much their click shape looks like invalid traffic and
-- surfaces them in the admin queue. A human presses Suspend, which calls
-- suspend_ad_campaign(reason_code => 'fraud_review') with their own id on the
-- log row. Nothing here changes a status by itself.
--
-- It is a HEURISTIC, not a detector. No source in this project documents a
-- vendor-self-clicking signature, and the inputs available (session ids that
-- die with a browser tab, no IP, no device fingerprint) cannot prove intent.
-- Treated and labelled accordingly.

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
language sql stable security definer set search_path to 'public'
as $$
  with win as (
    select * from public.engagement_events
     where ad_id is not null
       and created_at >= now() - make_interval(days => greatest(1, p_days))
  ),
  clicks as (
    select e.ad_id,
           count(*) filter (where e.event_type = 'ad_click') as clicks,
           -- coalesce(viewer_id, session_id): a signed-in viewer is one person
           -- however many tabs; a signed-out one can only be deduped inside
           -- their session. This is a LOWER BOUND on distinct people, which is
           -- the conservative direction for a concentration measure.
           count(distinct coalesce(e.viewer_id::text, e.session_id)) filter (where e.event_type = 'ad_click')
             as distinct_viewers,
           -- Did the click go anywhere? An ad click that never produced a
           -- product or profile view is a click with no session behind it.
           count(*) filter (where e.event_type in ('product_view', 'profile_view') and e.source = 'ad')
             as post_click_events
      from win e group by e.ad_id
  )
  select a.id, a.title, a.vendor_id, a.status,
         c.clicks, c.distinct_viewers,
         round(c.clicks::numeric / nullif(c.distinct_viewers, 0), 2) as clicks_per_viewer,
         c.post_click_events,
         round(c.post_click_events::numeric / nullif(c.clicks, 0), 2) as depth_ratio,
         array_remove(array[
           case when c.clicks >= 10 and c.distinct_viewers <= 2
                then 'clicks concentrated in very few viewers' end,
           case when c.clicks >= 10
                 and c.post_click_events::numeric / nullif(c.clicks, 0) < 0.2
                then 'clicks rarely lead to a product or profile view' end,
           case when c.clicks >= 10
                 and c.clicks::numeric / nullif(c.distinct_viewers, 0) >= 5
                then 'the same viewer clicked many times' end
         ], null) as reasons
    from clicks c
    join public.advertisements a on a.id = c.ad_id
   where c.clicks >= 10
     and (
       c.distinct_viewers <= 2
       or c.post_click_events::numeric / nullif(c.clicks, 0) < 0.2
       or c.clicks::numeric / nullif(c.distinct_viewers, 0) >= 5
     )
   order by c.clicks desc, a.id desc;
$$;

revoke all on function public.ad_fraud_signals(integer) from public, anon;
grant execute on function public.ad_fraud_signals(integer) to authenticated;

-- ── 8.3  Review-queue reporting ─────────────────────────────────────────────
-- Cheap aggregates off ad_review_log, as specified. No stored rollup: the log
-- is small, append-only, and a rollup would be one more thing to drift.
create or replace function public.ad_review_metrics(p_days integer default 30)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  with decided as (
    -- Time to decision = the gap between a campaign entering the queue and the
    -- decision that took it out. Measured per campaign off its own log rows, so
    -- a resubmitted campaign contributes each round separately rather than
    -- being averaged into one misleadingly long wait.
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
  );
$$;

revoke all on function public.ad_review_metrics(integer) from public, anon;
grant execute on function public.ad_review_metrics(integer) to authenticated;
