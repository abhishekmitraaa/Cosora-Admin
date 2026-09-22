-- Undo everything the admin-invite verification created.
-- Run after scripts/invite-tests.mjs / invite-send-test.mjs / invite-ui-test.mjs.

-- 1. Real seeded demo users are promoted by the tests' "existing user" branch.
--    Put them back to non-admin: remove their admin.admin_users row (the source of
--    truth since admin-schema separation Phase 5). shadow_admin_columns() first
--    clears the legacy profiles.is_admin/admin_role, which admin_grant also set,
--    while those columns exist; it is a no-op once Phase 5c drops them.
select admin.shadow_admin_columns(u.id, false, null)
  from (values
    ('22222222-2222-2222-2222-222222222222'::uuid),  -- demo-vendor@cosora.dev
    ('11111111-1111-1111-1111-111111111111'::uuid)   -- demo-buyer@cosora.dev
  ) as u(id);
delete from admin.admin_users
 where id in (
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111'
 );

-- 2. Test invitees + branch fixtures (all use +cosora-* plus-addresses or the
--    cosora.test domain). Covers admin-invite / reset-flow / branch tests.
delete from admin.admin_users where id in (select id from auth.users where email like '%+cosora-%' or email like 'rlstest-%');
delete from public.profiles where email like '%+cosora-%';
delete from auth.identities where provider_id like '%+cosora-%';
delete from auth.users where email like '%+cosora-%';

-- 3. Throwaway admin logins. If rls-matrix.mjs / the chat harnesses ran, run
--    drop-test-admins.sql (and drop-chat-fixtures.sql) FIRST: the admin_flags
--    rows they write reference these accounts (FK, no cascade), so deleting the
--    profiles here would fail and roll the whole script back.
delete from public.profiles where email like 'rlstest-%';
delete from auth.identities where provider_id like 'rlstest-%';
delete from auth.users where email like 'rlstest-%';
