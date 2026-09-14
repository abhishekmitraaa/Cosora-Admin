-- ─────────────────────────────────────────────────────────────────────────────
-- PHYSICAL VERIFICATION CERTIFICATES — fulfilment, not placement.
--
-- Mitra confirmed on 2026-09-13 the question the admin panel has been carrying a
-- caution banner about since it was built: the verification certificate is a
-- PHYSICAL PRINTED ARTICLE that gets couriered to the vendor, who can buy one
-- and track its delivery. So:
--
--   * src/pages/Certificates.tsx in cosora-admin was built on dev-seed data
--     ("Nothing here reads or writes Supabase") against a table that did not
--     exist. This is that table. Its status vocabulary, its pipeline order and
--     its courier list match what that screen already renders, so the screen
--     swaps its data source without changing shape.
--   * `verifiedCertificate` is no longer an unplaced AD TYPE waiting for a
--     buyer-side slot. It has no slot for the same reason a T-shirt has none.
--     adSlots.ts now classes it FULFILMENT_AD_TYPES.
--
-- THE ADDRESS IS A SNAPSHOT, taken when the order is created, NOT a live join to
-- vendor_profiles. A vendor who moves house after ordering must not have the
-- address rewritten on a parcel already in transit — and the label that was
-- actually printed is the one the support conversation is about.
--
-- Additive only: no column or table is dropped, and nothing that exists changes
-- behaviour except `advertisements` gaining one more AFTER INSERT trigger.
-- ─────────────────────────────────────────────────────────────────────────────

-- Human-quotable order reference. A sequence rather than a per-month counter:
-- uniqueness must not depend on the clock, and CERT-2609-014 stays unique even
-- if two orders land in the same millisecond at a month boundary.
create sequence if not exists public.certificate_reference_seq;

create table if not exists public.certificate_orders (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,
  vendor_id       uuid not null references public.profiles(id) on delete cascade,
  -- Which purchase paid for it. Nullable because the demo payment path records
  -- no ad_orders intent, and a null here must not stop a real parcel shipping.
  ad_order_id     text,
  -- The campaign row the placement arrived on, for tracing a dispute back to
  -- the exact purchase. SET NULL rather than CASCADE: deleting a campaign must
  -- not delete the record of a certificate that was printed and posted.
  ad_id           uuid references public.advertisements(id) on delete set null,

  status          text not null default 'processing'
                  check (status in ('processing','printed','dispatched','delivered','returned','cancelled')),

  -- ── Delivery snapshot, frozen at purchase ──
  contact_name    text,
  contact_phone   text,
  address_line    text,
  area            text,
  city            text,
  state           text,
  postal_code     text,
  vendor_name     text,

  courier         text,
  tracking_number text,
  -- Why a parcel came back, or why the order was cancelled. Shown to the vendor.
  return_reason   text,

  purchased_at    timestamptz not null default now(),
  printed_at      timestamptz,
  dispatched_at   timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp()
);

create index if not exists certificate_orders_vendor_idx on public.certificate_orders (vendor_id, purchased_at desc);
create index if not exists certificate_orders_status_idx on public.certificate_orders (status, purchased_at);

comment on table public.certificate_orders is
  'Physical verification certificates purchased by vendors. Address fields are a snapshot taken at purchase, never a live join to vendor_profiles.';

-- ── RLS: vendors read their own, fulfilment staff read all, NOBODY writes ────
--
-- No INSERT/UPDATE/DELETE policy exists, for any role. Every state change goes
-- through a SECURITY DEFINER function below that checks authorization inside
-- itself and RAISES. That is the same rule the ad review RPCs follow, and for
-- the same reason: an UPDATE that RLS denies matches zero rows and PostgREST
-- reports SUCCESS, so a fulfilment clerk would read "marked dispatched" on a
-- parcel that was never marked at all.
alter table public.certificate_orders enable row level security;

drop policy if exists certificate_orders_read on public.certificate_orders;
create policy certificate_orders_read on public.certificate_orders
  for select
  using (
    coalesce(vendor_id = auth.uid(), false)
    or coalesce(public.is_admin(), false)
  );

grant select on public.certificate_orders to authenticated;

-- ── Who may fulfil ──────────────────────────────────────────────────────────
--
-- super_admin and finance_admin. cosora-admin/src/lib/roles.ts carries a note
-- that this section should eventually be
--   ["super_admin", "finance_admin", "delivery_team"]
-- but `delivery_team` does not exist in the admin_role_type enum, so naming it
-- would imply a role nobody can hold. This is that list minus the missing value;
-- add it here and in roles.ts in the SAME change that creates the enum value.
create or replace function public.certificate_fulfiller()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(public.is_admin() and public.admin_role()
           in ('super_admin', 'finance_admin'), false);
$$;

-- ── Orders are created by the purchase, not by a person ─────────────────────
--
-- An AFTER INSERT trigger on `advertisements`, because that is the one place
-- every purchase path converges: razorpay-verify-payment, the razorpay webhook
-- and demo mode all end up inserting the same rows. Hooking here means no edge
-- function has to be redeployed and no path can be forgotten.
--
-- It deliberately does NOT wait for admin approval. Approval gates what buyers
-- SEE; this is a parcel the vendor bought, and it enters the queue immediately.
-- Nothing is printed without a human pressing a button on the admin screen, so
-- there is still a person between payment and a "verified" certificate going
-- out — and the trust seal itself is still granted at approval, not here.
create or replace function public.create_certificate_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v record;
begin
  -- placement is a CSV ("openListing,verifiedCertificate"); btrim because a
  -- hand-written spec can carry spaces.
  if not exists (
    select 1 from unnest(string_to_array(coalesce(new.placement, ''), ',')) p
     where btrim(p) = 'verifiedCertificate'
  ) then
    return null;
  end if;

  select brand_name, owner_name, phone, address_line, area, city, state, postal_code
    into v
    from public.vendor_profiles
   where id = new.vendor_id;

  insert into public.certificate_orders (
    reference, vendor_id, ad_id, status,
    vendor_name, contact_name, contact_phone,
    address_line, area, city, state, postal_code,
    purchased_at
  ) values (
    'CERT-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.certificate_reference_seq')::text, 3, '0'),
    new.vendor_id, new.id, 'processing',
    v.brand_name, v.owner_name, v.phone,
    v.address_line, v.area, v.city, v.state, v.postal_code,
    coalesce(new.created_at, now())
  );
  return null;
exception when others then
  -- Never fail the campaign insert. If this raised, the payment path's
  -- insertAds would fail and the vendor would be charged with no campaign at
  -- all — a far worse outcome than a certificate order that has to be created
  -- by hand. The warning lands in the Postgres log with the vendor id.
  raise warning 'create_certificate_order failed for ad % (vendor %): %',
    new.id, new.vendor_id, sqlerrm;
  return null;
end $$;

drop trigger if exists trg_create_certificate_order on public.advertisements;
create trigger trg_create_certificate_order
  after insert on public.advertisements
  for each row execute function public.create_certificate_order();

-- ── Fulfilment steps ────────────────────────────────────────────────────────
--
-- One function per real-world action rather than a generic setter, so each can
-- state its own precondition and its own refusal message. The shared applier
-- holds the transition table; it is revoked from every client role.
create or replace function public.certificate_apply(
  p_id        uuid,
  p_to        text,
  p_from      text[],
  p_courier   text default null,
  p_tracking  text default null,
  p_reason    text default null,
  p_notify_title text default null,
  p_notify_body  text default null
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c public.certificate_orders;
begin
  if not public.certificate_fulfiller() then
    raise exception 'not authorized: certificate fulfilment requires the super_admin or finance_admin role'
      using errcode = '42501';
  end if;

  select * into c from public.certificate_orders where id = p_id for update;
  if not found then
    raise exception 'certificate order % not found', p_id using errcode = 'P0002';
  end if;
  if not (c.status = any(p_from)) then
    raise exception 'a % certificate cannot be moved to %', c.status, p_to
      using errcode = '22023';
  end if;

  update public.certificate_orders set
    status          = p_to,
    courier         = case when p_to = 'dispatched' then p_courier
                           when p_to = 'printed'    then null   -- a reprint clears the old label
                           else courier end,
    tracking_number = case when p_to = 'dispatched' then p_tracking
                           when p_to = 'printed'    then null
                           else tracking_number end,
    return_reason   = case when p_to in ('returned','cancelled') then p_reason
                           when p_to = 'printed' then null
                           else return_reason end,
    printed_at      = case when p_to = 'printed'    then clock_timestamp() else printed_at end,
    dispatched_at   = case when p_to = 'dispatched' then clock_timestamp() else dispatched_at end,
    delivered_at    = case when p_to = 'delivered'  then clock_timestamp() else delivered_at end,
    updated_at      = clock_timestamp()
  where id = p_id;

  if p_notify_title is not null then
    perform public.notify(c.vendor_id, 'certificate_' || p_to, p_notify_title, p_notify_body, null);
  end if;

  return p_to;
end $$;

revoke all on function public.certificate_apply(uuid, text, text[], text, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.certificate_mark_printed(p_ad_certificate_id uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
begin
  return public.certificate_apply(
    p_ad_certificate_id, 'printed', array['processing','returned'],
    null, null, null, null, null);
end $$;

create or replace function public.certificate_dispatch(
  p_ad_certificate_id uuid, p_courier text, p_tracking text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare c public.certificate_orders;
begin
  if coalesce(btrim(p_courier), '') = '' or coalesce(btrim(p_tracking), '') = '' then
    raise exception 'a dispatched parcel needs both a courier and a tracking number'
      using errcode = '22023';
  end if;
  -- A real precondition, not a formality: without an address there is nothing to
  -- put on the label, and marking it dispatched would hide that from the vendor
  -- tracking the order.
  select * into c from public.certificate_orders where id = p_ad_certificate_id;
  if found and (coalesce(btrim(c.address_line), '') = '' or coalesce(btrim(c.postal_code), '') = '') then
    raise exception 'this vendor had no delivery address on file when they ordered — collect one before dispatch'
      using errcode = '22023';
  end if;
  return public.certificate_apply(
    p_ad_certificate_id, 'dispatched', array['printed'],
    btrim(p_courier), btrim(p_tracking), null,
    'Your certificate is on its way',
    'Courier: ' || btrim(p_courier) || ' · Tracking: ' || btrim(p_tracking));
end $$;

create or replace function public.certificate_mark_delivered(p_ad_certificate_id uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
begin
  return public.certificate_apply(
    p_ad_certificate_id, 'delivered', array['dispatched'],
    null, null, null,
    'Your certificate has been delivered',
    'Marked delivered by Cosora. If it has not reached you, reply to this notification.');
end $$;

create or replace function public.certificate_mark_returned(p_ad_certificate_id uuid, p_reason text)
returns text language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'record why the parcel came back' using errcode = '22023';
  end if;
  return public.certificate_apply(
    p_ad_certificate_id, 'returned', array['dispatched','delivered'],
    null, null, btrim(p_reason),
    'Your certificate came back to us',
    btrim(p_reason));
end $$;

create or replace function public.certificate_cancel_order(p_ad_certificate_id uuid, p_reason text)
returns text language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'record why the order is being cancelled' using errcode = '22023';
  end if;
  return public.certificate_apply(
    p_ad_certificate_id, 'cancelled', array['processing','printed'],
    null, null, btrim(p_reason),
    'Your certificate order was cancelled',
    btrim(p_reason));
end $$;

revoke all on function public.certificate_mark_printed(uuid)      from public, anon;
revoke all on function public.certificate_dispatch(uuid, text, text) from public, anon;
revoke all on function public.certificate_mark_delivered(uuid)    from public, anon;
revoke all on function public.certificate_mark_returned(uuid, text) from public, anon;
revoke all on function public.certificate_cancel_order(uuid, text) from public, anon;
revoke all on function public.certificate_fulfiller()             from public, anon, authenticated;

grant execute on function public.certificate_mark_printed(uuid)        to authenticated;
grant execute on function public.certificate_dispatch(uuid, text, text) to authenticated;
grant execute on function public.certificate_mark_delivered(uuid)      to authenticated;
grant execute on function public.certificate_mark_returned(uuid, text) to authenticated;
grant execute on function public.certificate_cancel_order(uuid, text)  to authenticated;
