-- ─────────────────────────────────────────────────────────────
-- Schema additions required by the Cosora admin panel.
--
-- Applied to the SAME database as textile-spark-net. Everything here layers on
-- the admin RBAC from that repo's 20260717130000/130100 migrations: reads stay
-- open to any is_admin() user, writes stay gated on admin_role().
-- ─────────────────────────────────────────────────────────────

-- Part 3 — product moderation ---------------------------------------------
-- Reason recorded when a product is moved to 'rejected'. Required by the UI,
-- nullable in the DB (historical rows predate it).
alter table public.products
  add column if not exists rejection_reason text;

-- Part 5 — ad takedown -----------------------------------------------------
-- Ads keep auto-publishing on payment; this records WHY an already-live ad was
-- pulled down. Mirrors the vendor_ad_verifications reason-tracking pattern.
alter table public.advertisements
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id);

-- Part 6 — refunds ---------------------------------------------------------
-- Written only by the admin-refund-payment edge function, after Razorpay's API
-- confirms the refund. razorpay_refund_id is the proof it actually happened.
alter table public.subscription_invoices
  add column if not exists razorpay_refund_id text,
  add column if not exists refunded_amount integer,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_status text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscription_invoices_refund_status_chk') then
    alter table public.subscription_invoices
      add constraint subscription_invoices_refund_status_chk
      check (refund_status is null or refund_status in ('processed', 'pending', 'failed'));
  end if;
end $$;


-- Part 7 — flagged-items log ----------------------------------------------
-- Deliberately minimal: a freeform note + timestamp + author, attachable to a
-- vendor/product/ad. This is an internal tracking log, NOT a dispute or
-- workflow system — there is no status, no assignee, no resolution. entity_id
-- is intentionally un-FK'd since it points at one of three tables.
create table if not exists public.admin_flags (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('vendor', 'product', 'ad')),
  entity_id uuid not null,
  note text not null check (length(btrim(note)) > 0),
  author_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists admin_flags_entity_idx on public.admin_flags (entity_type, entity_id);
create index if not exists admin_flags_created_idx on public.admin_flags (created_at desc);

alter table public.admin_flags enable row level security;

-- Any admin may read the log.
drop policy if exists admin_flags_select on public.admin_flags;
create policy admin_flags_select on public.admin_flags
  for select using (public.is_admin());

-- Any admin — support INCLUDED, this is the one table support may write — may
-- append a note, but only under their own authorship.
drop policy if exists admin_flags_insert on public.admin_flags;
create policy admin_flags_insert on public.admin_flags
  for insert with check (public.is_admin() and author_id = auth.uid());

-- Append-only for everyone: no UPDATE policy at all. Only a super_admin may
-- remove a note (mistakes), so the log cannot be quietly rewritten.
drop policy if exists admin_flags_delete on public.admin_flags;
create policy admin_flags_delete on public.admin_flags
  for delete using (public.is_admin() and public.admin_role() = 'super_admin');
