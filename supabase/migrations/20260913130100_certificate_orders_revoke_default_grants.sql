-- Review pass on 20260913130000. One gap, self-introduced.
--
-- CERTIFICATE_ORDERS KEPT SUPABASE'S DEFAULT TABLE GRANTS.
--
-- Supabase grants ALL on every new table in `public` to anon, authenticated and
-- service_role through default privileges. The previous migration added
--   grant select on public.certificate_orders to authenticated;
-- which reads like the whole story and is not: anon still held SELECT, and BOTH
-- client roles still held INSERT / UPDATE / DELETE.
--
-- Confirmed with has_table_privilege before this ran:
--   anon          SELECT -> true
--   authenticated UPDATE -> true
--
-- Nothing leaked and nothing could be written, because RLS was doing the real
-- work: the read policy returns no rows to anon, and there is NO write policy
-- for any role. But leaving the grants in place is wrong twice over:
--
--   1. An RLS-denied UPDATE matches zero rows and PostgREST reports SUCCESS.
--      That is the exact failure mode this project has been removing
--      everywhere else — a caller told the parcel was marked delivered when
--      nothing was written. Refusing at the grant means the call errors.
--   2. A table-level write grant means any permissive policy added later by
--      mistake opens writes immediately, rather than needing a grant as well.
--      Defence in depth is the point.
--
-- Revoking PUBLIC alone is a no-op on Supabase: anon and authenticated hold
-- these privileges in their own right and must each be named. Verified
-- afterwards with has_table_privilege rather than assumed.

revoke all on public.certificate_orders from public, anon, authenticated;

-- Reads only, and only for signed-in users. The RLS policy still decides WHICH
-- rows: the order's own vendor, or an admin.
grant select on public.certificate_orders to authenticated;

-- The sequence behind the order reference is never touched from a client: the
-- trigger that calls nextval() is SECURITY DEFINER and runs as the owner.
revoke all on sequence public.certificate_reference_seq from public, anon, authenticated;
