-- Remove everything scripts/seed-test-admins.sql created.
-- Always run this when finished — the seeded accounts are admin logins with a
-- known password.

-- admin_flags lives in the admin schema since admin-schema separation Phase 3c.
delete from admin.admin_flags
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

-- Admin grants live in admin.admin_users (Phase 5). They would also cascade from
-- auth.users, but are removed explicitly so a partial run cannot leave one behind.
delete from admin.admin_users
 where id in (select id from auth.users where email like 'rlstest-%');
delete from public.profiles where email like 'rlstest-%';
delete from auth.identities where provider_id like 'rlstest-%';
delete from auth.users where email like 'rlstest-%';

-- Both leftover counts must be 0. A stray admin_users test row would make the
-- Phase 5c pre-flight drift check non-zero.
select
  (select count(*) from auth.users where email like 'rlstest-%')          as leftover_users,
  (select count(*) from public.profiles where email like 'rlstest-%')     as prof_leftover,
  (select count(*) from admin.admin_users au
     where not exists (select 1 from public.profiles p where p.id = au.id)
        or au.id in (select id from auth.users where email like 'rlstest-%')) as au_leftover,
  (select count(*) from admin.admin_users where is_active)                as real_admins;
