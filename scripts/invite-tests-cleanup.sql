-- Undo everything the admin-invite verification created.
-- Run after scripts/invite-tests.mjs / invite-send-test.mjs / invite-ui-test.mjs.

-- 1. Real seeded demo users are promoted by the tests' "existing user" branch.
--    Put them back to non-admin.
update public.profiles
   set is_admin = false, admin_role = null
 where id in (
   '22222222-2222-2222-2222-222222222222',  -- demo-vendor@cosora.dev
   '11111111-1111-1111-1111-111111111111'   -- demo-buyer@cosora.dev
 );

-- 2. Test invitees created by the invite branch.
delete from public.profiles where email like '%+cosora-admin-invite@%' or email like '%+cosora-ui-%';
delete from auth.identities where provider_id like '%+cosora-admin-invite@%' or provider_id like '%+cosora-ui-%';
delete from auth.users where email like '%+cosora-admin-invite@%' or email like '%+cosora-ui-%';

-- 3. Throwaway admin logins.
delete from public.profiles where email like 'rlstest-%';
delete from auth.identities where provider_id like 'rlstest-%';
delete from auth.users where email like 'rlstest-%';
