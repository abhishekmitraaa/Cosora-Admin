-- Phase 1 — Campaign state model.
--
-- WHAT WAS ACTUALLY BROKEN (verified live on 2026-09-12, not assumed):
--
--   1. `guard_ad_activation` was BEFORE UPDATE ONLY. The payment path does not
--      update a draft — `adRows()` in razorpay-verify-payment INSERTs rows with
--      status:'active' directly, as service_role. service_role bypasses RLS,
--      and with no INSERT trigger it bypassed every check too. So a paid
--      campaign published to buyers having never been seen by a human. The
--      prompt's framing ("service_role uses the trigger's door") was too
--      generous: there was no door, there was no wall.
--
--   2. The same function is reachable from demo mode. razorpay-verify-payment
--      falls back to `if (!keySecret)` and publishes straight from the
--      CLIENT-SUPPLIED spec with no payment record at all. `ad_orders` has 0
--      rows. Gating only the paid path would have left that wide open, which
--      is why the gate below is on the INSERT itself and does not care how the
--      row got there.
--
--   3. `enforce_ads_moderation` exempts the row's owner from the status check
--      (`auth.uid() is distinct from old.vendor_id`). A vendor could therefore
--      walk their own rejected campaign back to life via rejected -> paused ->
--      active, because the old guard allowed 'paused' -> 'active' outright.
--
-- Additive only: no column or table is dropped, and the legacy 'paused'/'ended'
-- values stay in the constraint so existing rows and the current vendor
-- dashboard keep working while call sites migrate to the Phase 2 RPCs.

-- ── 1.1  Widen the status constraint ────────────────────────────────────────
-- Each value is a state a vendor or admin needs to see at a glance, which is
-- why this is an enum widening and not a 'paused' + side-flag pair.
--
-- 'budget_exhausted' is included for completeness of the agreed state set but
-- is STRUCTURALLY UNREACHABLE: pricing is flat-rate/prepaid (ground rules), so
-- no budget_total/budget_spent columns were added and nothing can ever set it.
-- It is here so a later metered-billing phase does not need a second constraint
-- migration. Nothing in this change writes it. See Phase 10's report.
alter table public.advertisements
  drop constraint if exists advertisements_status_check;

alter table public.advertisements
  add constraint advertisements_status_check check (status = any (array[
    -- new, agreed state set
    'draft', 'pending_review', 'scheduled', 'active', 'rejected',
    'changes_requested', 'paused_by_vendor', 'paused_by_admin', 'expired',
    'budget_exhausted', 'suspended', 'archived',
    -- legacy values retained (additive rule): existing rows and the not-yet
    -- migrated vendor dashboard still use these.
    'paused', 'ended'
  ]));

-- ── 1.5  Append-only decision log ───────────────────────────────────────────
-- Follows the vendor_ad_verifications pattern: RLS on, owner-or-admin SELECT,
-- and no INSERT/UPDATE/DELETE policy at all, so the only writer is a SECURITY
-- DEFINER function (which bypasses RLS as the owner).
create table if not exists public.ad_review_log (
  id              uuid primary key default gen_random_uuid(),
  ad_id           uuid not null references public.advertisements(id) on delete cascade,
  reviewer_id     uuid references public.profiles(id),
  decision        text not null check (decision = any (array[
                    'submitted', 'approved', 'rejected', 'changes_requested',
                    'resubmitted', 'paused', 'resumed', 'suspended',
                    'expired', 'archived'])),
  reason_code     text,
  note            text,
  previous_status text,
  new_status      text,
  -- clock_timestamp(), not now(): several log rows can be written inside one
  -- transaction (a sweep expiring a batch, an approve that also resumes), and
  -- now() is transaction-start time, so they would all share a timestamp and
  -- the history would not be orderable.
  created_at      timestamptz not null default clock_timestamp()
);

create index if not exists ad_review_log_ad_time_idx
  on public.ad_review_log (ad_id, created_at desc);
create index if not exists ad_review_log_decision_time_idx
  on public.ad_review_log (decision, created_at desc);

alter table public.ad_review_log enable row level security;

drop policy if exists ad_review_log_select on public.ad_review_log;
create policy ad_review_log_select on public.ad_review_log
  for select using (
    exists (
      select 1 from public.advertisements a
      where a.id = ad_review_log.ad_id and a.vendor_id = auth.uid()
    )
    or public.is_admin()
  );

grant select on public.ad_review_log to authenticated;
-- Deliberately no insert/update/delete grant to anon or authenticated: the log
-- is append-only and written only by the Phase 2 RPCs.
revoke insert, update, delete on public.ad_review_log from anon, authenticated;

-- ── 1.2 + 1.3  Rebuild the activation guard ─────────────────────────────────
-- The Phase 2 review RPCs set `cosora.ad_review` for the transaction before
-- they move a status. They are SECURITY DEFINER and check authorization
-- themselves, so the trigger must not second-guess them. A PostgREST client
-- cannot set this: set_config lives in pg_catalog and is not exposed on the
-- `public` schema PostgREST serves, so there is no request that can forge it.
create or replace function public.guard_ad_activation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(current_setting('cosora.ad_review', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- PAYMENT IS NEVER APPROVAL. Redirect rather than raise: the money is real
    -- and the campaign must not be lost, it simply does not get to serve yet.
    -- Applies to service_role (the paid webhook) and to demo mode alike,
    -- because the check is on the row, not on the caller.
    if new.status = 'active' and not coalesce(public.is_admin(), false) then
      new.status := 'pending_review';
    end if;
    return new;
  end if;

  if new.status = 'active' and coalesce(old.status, '') <> 'active' then
    -- The webhook may also land on an existing row (retry, re-claim). Same
    -- rule: it goes to the queue, it does not go live.
    if coalesce(auth.role(), '') = 'service_role' then
      new.status := 'pending_review';
      return new;
    end if;
    -- Closes the rejected -> paused -> active revival: the old guard allowed
    -- any 'paused' -> 'active', so a vendor could resurrect a rejected
    -- campaign in two hops. Resuming a genuine pause now goes through
    -- resume_ad_campaign(), which sets the flag above after checking whose
    -- pause it was.
    if not coalesce(public.is_admin(), false) then
      raise exception 'ads can only be activated by admin review (campaign %)', new.id
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

-- Bind it to INSERT as well. This is the single line that closes hole #1.
drop trigger if exists trg_guard_ad_activation_insert on public.advertisements;
create trigger trg_guard_ad_activation_insert
  before insert on public.advertisements
  for each row execute function public.guard_ad_activation();

-- ── Close the owner-exemption hole in the moderation trigger ────────────────
-- Shape copied from enforce_products_moderation(), which already draws exactly
-- this line for products: the owner may move their own row between their own
-- states and no further; anything else needs the moderator role.
--
-- Note this function is INVOKER (prosecdef = false) and short-circuits on
-- `current_user <> 'authenticated'`, so every Phase 2 RPC — SECURITY DEFINER,
-- owned by postgres — passes straight through it. That is the intended seam:
-- authorization for those paths lives inside the RPC.
create or replace function public.enforce_ads_moderation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator')) then
      new.moderation_reason := null;
      new.moderated_at      := null;
      new.moderated_by      := null;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if auth.uid() = old.vendor_id then
      -- WAS: owner exempt entirely, which let a vendor set any value the
      -- constraint allowed — including walking a rejected campaign back.
      if new.status not in ('draft', 'pending_review', 'paused_by_vendor', 'archived') then
        raise exception 'Vendors cannot set campaign status to %; admin review is required', new.status
          using errcode = '42501';
      end if;
    elsif not (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator')) then
      raise exception 'Ad moderation requires the super_admin or ads_moderator role'
        using errcode = '42501';
    end if;
  end if;

  if (new.moderation_reason is distinct from old.moderation_reason
      or new.moderated_at is distinct from old.moderated_at
      or new.moderated_by is distinct from old.moderated_by)
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator')) then
    raise exception 'Recording an ad moderation reason requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
