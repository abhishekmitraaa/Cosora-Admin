-- ─────────────────────────────────────────────────────────────
-- Recreate the throwaway accounts + fixtures used by
-- scripts/rls-matrix.mjs and scripts/rls-superadmin.mjs.
--
-- Run against a NON-PRODUCTION project, or delete the accounts afterwards with
-- scripts/drop-test-admins.sql. These are admin logins with a known password —
-- never leave them sitting in a live database.
--
-- Run as the service role / SQL editor (NOT as an authenticated client). Admin
-- identity lives in admin.admin_users (admin-schema separation Phase 5), which no
-- client role can reach, so this file grants each test admin there directly.
-- admin.shadow_admin_columns() keeps the legacy profiles.is_admin/admin_role equal
-- while those columns still exist (until Phase 5c), and is a no-op afterwards, so
-- this file is valid on both sides of the column drop.
--
-- Note the empty-string token columns. GoTrue's login query fails with
-- "Database error querying schema" if confirmation_token / recovery_token /
-- email_change* / phone_change* / reauthentication_token are NULL rather than
-- ''. Inserting users without them produces a 500 on sign-in that looks
-- nothing like the real cause.
--
-- After running, print the fixture ids and paste them into the F = {...} block
-- of both scripts (they are random per run).
-- ─────────────────────────────────────────────────────────────

-- The fixture password is NOT in this file (Master Prompt 8, Phase 1: it used to
-- be, in a public repo, for accounts that include a super_admin). Before running,
-- prepend this line with FIXTURE_PASSWORD from .env, in the same SQL-editor run:
--   select set_config('cosora.fixture_password', '<FIXTURE_PASSWORD>', false);
-- Without it the guard below aborts before any account is created.
do $guard$ begin
  if length(coalesce(current_setting('cosora.fixture_password', true), '')) < 16 then
    raise exception 'set cosora.fixture_password first (see the comment above)';
  end if;
end $guard$;

do $$
declare
  r record;
  uid uuid;
begin
  for r in select * from (values
    ('rlstest-superadmin@cosora.test', 'super_admin'),
    ('rlstest-productmod@cosora.test', 'product_moderator'),
    ('rlstest-vendorops@cosora.test',  'vendor_ops'),
    ('rlstest-adsmod@cosora.test',     'ads_moderator'),
    ('rlstest-finance@cosora.test',    'finance_admin'),
    ('rlstest-support@cosora.test',    'support')
  ) as t(email, role) loop
    uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      r.email, extensions.crypt(current_setting('cosora.fixture_password'), extensions.gen_salt('bf')),
      now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'RLS Test ' || r.role),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at
    ) values (
      gen_random_uuid(), uid,
      jsonb_build_object('sub', uid::text, 'email', r.email, 'email_verified', true),
      'email', r.email, now(), now(), now()
    );

    -- handle_new_user() already created the profiles row. The email stays on
    -- profiles; the admin grant goes to admin.admin_users.
    update public.profiles set email = r.email where id = uid;
    insert into admin.admin_users (id, admin_role, is_active)
    values (uid, r.role::public.admin_role_type, true)
    on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
    perform admin.shadow_admin_columns(uid, true, r.role::public.admin_role_type);
  end loop;
end $$;

-- Fixtures: an isolated vendor with its own product / ad / subscription /
-- invoice, so the matrix never mutates real rows.
do $$
declare
  vid uuid := gen_random_uuid();
  pid uuid := gen_random_uuid();
  sid uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', vid, 'authenticated', 'authenticated',
    'rlstest-vendor@cosora.test', extensions.crypt(current_setting('cosora.fixture_password'), extensions.gen_salt('bf')),
    now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"RLS Test Vendor"}'::jsonb, '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at)
  values (gen_random_uuid(), vid,
    jsonb_build_object('sub', vid::text, 'email', 'rlstest-vendor@cosora.test', 'email_verified', true),
    'email', 'rlstest-vendor@cosora.test', now(), now(), now());

  -- No account_status. 20260801095820 DROPPED vendor_profiles.account_status and
  -- moved suspension to profiles.account_status; this file kept inserting it and
  -- therefore failed outright against the current schema. Suspension state for a
  -- fixture is set with set_account_status(), never here.
  insert into public.vendor_profiles (id, brand_name, city, business_type, is_verified, onboarding_complete)
  values (vid, 'RLS Test Brand', 'Testville', 'manufacturer', false, true);

  insert into public.products (id, vendor_id, name, status, price_value, fabric, moq)
  values (pid, vid, 'RLS Test Product', 'under_review', 100, 'cotton', '10');

  insert into public.advertisements (id, vendor_id, product_id, title, status, daily_budget, starts_at)
  values (gen_random_uuid(), vid, pid, 'RLS Test Ad', 'active', 50, now());

  insert into public.vendor_subscriptions (id, vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  values (sid, vid, 'basic', 'monthly', 'active', now(), now() + interval '30 days');

  insert into public.subscription_invoices (vendor_id, subscription_id, plan_id, amount, gst_amount, status, invoice_number)
  values (vid, sid, 'basic', 699, 126, 'paid', 'INV-RLSTEST-001');
end $$;

-- Paste these into F = {...} in rls-matrix.mjs and rls-superadmin.mjs.
select 'vendor' as kind, id::text as id from public.vendor_profiles where brand_name = 'RLS Test Brand'
union all select 'product', id::text from public.products where name = 'RLS Test Product'
union all select 'ad', id::text from public.advertisements where title = 'RLS Test Ad'
union all select 'invoice', id::text from public.subscription_invoices where invoice_number = 'INV-RLSTEST-001'
union all select 'subscription', vs.id::text from public.vendor_subscriptions vs
  join public.vendor_profiles vp on vp.id = vs.vendor_id where vp.brand_name = 'RLS Test Brand'
union all select 'target(support acct)', id::text from public.profiles where email = 'rlstest-support@cosora.test';
