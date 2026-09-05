-- ─────────────────────────────────────────────────────────────
-- Chat-pipeline test fixtures — two buyers, two vendors, and the pre-existing
-- content the suspension-scope regression test needs.
--
-- Companion to seed-test-admins.sql, which seeds the six ADMIN roles and one
-- vendor. That file has no concept of a conversation, and a chat pipeline needs
-- two of each side so a thread can be built out of accounts nobody real owns.
--
-- WHY NOT REUSE demo-buyer@cosora.dev / demo-vendor@cosora.dev:
--   * they are what a human demos the product with, and the app's own dev
--     switcher signs into them;
--   * `messages` has NO delete policy for any role, deliberately — there is no
--     redaction path in this product — so every probe message sent during a
--     test is PERMANENT. Probe messages go in a throwaway pair or nowhere.
--   * a test that suspends one and crashes leaves a demo account suspended.
--
-- Run as the service role / SQL editor, NOT as an authenticated client: the
-- moderation triggers deliberately bypass when current_user <> 'authenticated',
-- which is what lets this stamp fixture state directly.
--
-- The empty-string token columns are load-bearing. GoTrue's login query fails
-- with "Database error querying schema" if confirmation_token / recovery_token /
-- email_change* / phone_change* / reauthentication_token are NULL rather than
-- ''. A user inserted without them 500s on sign-in in a way that looks nothing
-- like the real cause. (Same trap documented in seed-test-admins.sql.)
--
-- Ids are deterministic so the test scripts can hardcode them instead of
-- needing a paste-the-output step between runs, and so a row spotted in
-- production is obviously synthetic on sight:
--   cf000001… buyerA    cf000002… buyerB
--   cf000003… vendorA   cf000004… vendorB
--
-- Tear down with scripts/drop-chat-fixtures.sql. ALWAYS.
-- ─────────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in select * from (values
    ('cf000001-0000-0000-0000-000000000001'::uuid, 'chatfx-buyer-a@cosora.test',  'Chat Fixture Buyer A',  'buyer'),
    ('cf000002-0000-0000-0000-000000000002'::uuid, 'chatfx-buyer-b@cosora.test',  'Chat Fixture Buyer B',  'buyer'),
    ('cf000003-0000-0000-0000-000000000003'::uuid, 'chatfx-vendor-a@cosora.test', 'Chat Fixture Vendor A', 'seller'),
    ('cf000004-0000-0000-0000-000000000004'::uuid, 'chatfx-vendor-b@cosora.test', 'Chat Fixture Vendor B', 'seller')
  ) as t(uid, email, name, role) loop

    if exists (select 1 from auth.users where id = r.uid) then
      continue;
    end if;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', r.uid, 'authenticated', 'authenticated',
      r.email, extensions.crypt('TestPass123!', extensions.gen_salt('bf')),
      now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', r.name),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at
    ) values (
      gen_random_uuid(), r.uid,
      jsonb_build_object('sub', r.uid::text, 'email', r.email, 'email_verified', true),
      'email', r.email, now(), now(), now()
    );

    -- handle_new_user() already created the profiles row.
    update public.profiles
       set full_name = r.name, email = r.email, active_role = r.role, onboarded = true
     where id = r.uid;
  end loop;
end $$;

-- Vendor profiles for the two vendor fixtures. NOTE: no `account_status` —
-- 20260801095820 dropped it from this table.
insert into public.vendor_profiles (id, brand_name, city, business_type, is_verified, onboarding_complete, phone, owner_email, website, address_line)
values
  ('cf000003-0000-0000-0000-000000000003', 'Chat Fixture Brand A', 'Testville', 'manufacturer', true, true,
   '+91 90000 00003', 'chatfx-vendor-a@cosora.test', 'chatfx-a.example', '1 Fixture Road'),
  ('cf000004-0000-0000-0000-000000000004', 'Chat Fixture Brand B', 'Testville', 'manufacturer', false, true,
   '+91 90000 00004', 'chatfx-vendor-b@cosora.test', 'chatfx-b.example', '2 Fixture Road')
on conflict (id) do update
  set brand_name   = excluded.brand_name,
      phone        = excluded.phone,
      owner_email  = excluded.owner_email,
      website      = excluded.website,
      address_line = excluded.address_line,
      is_verified  = excluded.is_verified;

-- EXISTING content owned by vendorA, on file BEFORE any suspension.
-- This is the whole basis of the T8 scope regression: the suspension gate is
-- INSERT-only, so a live product, an active ad and a review must all survive a
-- later suspension untouched. Without pre-existing rows that test proves nothing.
insert into public.products (id, vendor_id, name, status, price_value, fabric, moq)
values ('cf00000a-0000-0000-0000-00000000000a', 'cf000003-0000-0000-0000-000000000003',
        'Chat Fixture Live Product', 'live', 100, 'cotton', '10')
on conflict (id) do update set status = 'live';

insert into public.advertisements (id, vendor_id, product_id, title, status, daily_budget, starts_at)
values ('cf00000b-0000-0000-0000-00000000000b', 'cf000003-0000-0000-0000-000000000003',
        'cf00000a-0000-0000-0000-00000000000a', 'Chat Fixture Active Ad', 'active', 50, now())
on conflict (id) do update set status = 'active';

insert into public.reviews (id, buyer_id, vendor_id, rating, body)
values ('cf00000c-0000-0000-0000-00000000000c', 'cf000001-0000-0000-0000-000000000001',
        'cf000003-0000-0000-0000-000000000003', 5, 'Chat fixture existing review')
on conflict (id) do nothing;

-- A LIVE paid subscription for vendorA.
--
-- Without it, enforce_plan_limits raises P0001 ("Advertising is a paid feature")
-- from a BEFORE trigger on any ad insert — long before RLS is consulted. That
-- silently turns the T8 advertisement case into a test that proves nothing: it
-- reports DENY while suspended, and DENY while active too. That exact false
-- pass was caught on 2026-09-05 and is why this row exists.
insert into public.vendor_subscriptions (id, vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
values ('cf00000d-0000-0000-0000-00000000000d', 'cf000003-0000-0000-0000-000000000003',
        'gold', 'monthly', 'active', now() - interval '1 day', now() + interval '90 days')
on conflict (id) do update
  set plan_id            = 'gold',
      status             = 'active',
      current_period_end = now() + interval '90 days';

select 'buyerA'         as fixture, 'cf000001-0000-0000-0000-000000000001' as id
union all select 'buyerB',          'cf000002-0000-0000-0000-000000000002'
union all select 'vendorA',         'cf000003-0000-0000-0000-000000000003'
union all select 'vendorB',         'cf000004-0000-0000-0000-000000000004'
union all select 'liveProduct',     'cf00000a-0000-0000-0000-00000000000a'
union all select 'activeAd',        'cf00000b-0000-0000-0000-00000000000b'
union all select 'existingReview',  'cf00000c-0000-0000-0000-00000000000c';
