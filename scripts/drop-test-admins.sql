-- Remove everything scripts/seed-test-admins.sql created.
-- Always run this when finished — the seeded accounts are admin logins with a
-- known password.

delete from public.admin_flags
 where note like 'matrix test%'
    or note = 'forged author'
    or entity_id in (select id from public.vendor_profiles where brand_name = 'RLS Test Brand');

delete from public.subscription_invoices where invoice_number = 'INV-RLSTEST-001';
delete from public.vendor_subscriptions
 where vendor_id in (select id from public.vendor_profiles where brand_name = 'RLS Test Brand');
delete from public.advertisements
 where vendor_id in (select id from public.vendor_profiles where brand_name = 'RLS Test Brand');
delete from public.product_images
 where product_id in (select id from public.products where name = 'RLS Test Product');
delete from public.products where name = 'RLS Test Product';
delete from public.vendor_profiles where brand_name = 'RLS Test Brand';

delete from public.profiles where email like 'rlstest-%';
delete from auth.identities where provider_id like 'rlstest-%';
delete from auth.users where email like 'rlstest-%';

select
  (select count(*) from auth.users where email like 'rlstest-%')      as leftover_users,
  (select count(*) from public.profiles where is_admin)               as real_admins;
