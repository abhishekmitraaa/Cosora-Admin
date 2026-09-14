-- ─────────────────────────────────────────────────────────────────────────────
-- ONE OPEN CERTIFICATE PARCEL PER VENDOR — database backstop.
--
-- Context. `verifiedCertificate` (₹199) is a physical printed certificate about
-- the VENDOR. Until 2026-09-14 the purchase path multiplied every placement by
-- the number of products in the order, so a 3-product certificate purchase
-- created three `advertisements` rows each carrying `verifiedCertificate` in
-- its placement CSV — and trg_create_certificate_order fired once per row,
-- producing THREE identical parcels addressed to the same vendor.
--
-- Proven live before this migration, rolled back:
--     OLD row shape (3 campaign rows each carrying the cert) -> 3 parcels
--     NEW row shape (3 product rows + 1 account row)         -> 1 parcel
--
-- The primary fix is in supabase/functions/_shared/adPricing.ts: buildAdRows()
-- now emits ONE vendor-level row with product_id = null for trustedSeal /
-- verifiedCertificate instead of one row per product.
--
-- THIS migration is defence in depth, because the database should not depend on
-- an edge function getting the row shape right. Legacy rows, a hand-inserted
-- campaign, a future regression in buildAdRows, or the demo-mode path all reach
-- the same trigger. A duplicate parcel costs real postage and real trust.
--
-- Scope of the guard: 'processing' and 'printed' only — i.e. not yet handed to
-- a courier. Once an order is 'dispatched', a second order is a legitimate
-- second parcel (a replacement, a re-order after a move) and is allowed.
--
-- Additive: no column or table is dropped, and no existing row changes.
-- Pre-flight confirmed no vendor currently holds more than one open order, so
-- the unique index below builds without conflict.
-- ─────────────────────────────────────────────────────────────────────────────

-- Hard backstop. Partial, so delivered/returned/cancelled history is unaffected
-- and a vendor can accumulate any number of COMPLETED certificates over time.
create unique index if not exists certificate_orders_one_open_per_vendor
  on public.certificate_orders (vendor_id)
  where status in ('processing', 'printed');

comment on index public.certificate_orders_one_open_per_vendor is
  'A vendor may have at most one certificate order that has not yet been dispatched. Stops one purchase becoming several identical parcels.';

-- Soft guard, so the common case is a skip-with-warning rather than an error
-- that has to unwind a campaign insert. The trigger already swallows its own
-- exceptions into a warning (a failed fulfilment insert must never roll back
-- the campaign insert and leave a vendor charged with no campaign), so without
-- this check the unique index would simply be hit and warned about — correct,
-- but it would log as a failure rather than an intentional no-op.
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

  -- Already have a parcel queued or printed for this vendor: do not create a
  -- second one. The vendor has been charged once (buildAdRows now emits a
  -- single account-level row), so a second order here would be a second parcel
  -- for the same purchase.
  if exists (
    select 1 from public.certificate_orders
     where vendor_id = new.vendor_id
       and status in ('processing', 'printed')
  ) then
    raise warning 'create_certificate_order: vendor % already has an open certificate order; skipping ad %',
      new.vendor_id, new.id;
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
  -- all — a far worse outcome than a certificate order created by hand.
  raise warning 'create_certificate_order failed for ad % (vendor %): %',
    new.id, new.vendor_id, sqlerrm;
  return null;
end $$;
