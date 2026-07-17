-- ─────────────────────────────────────────────────────────────
-- Allow 'rejected' as an advertisement status.
--
-- advertisements_status_check originally permitted only
-- ('draft','active','paused','ended') — the vendor-facing lifecycle. The admin
-- takedown tool needs a state that is distinct from 'paused' because the two
-- behave differently for the vendor:
--
--   paused   -> guard_ad_activation permits paused -> active, so the VENDOR can
--               resume the campaign themselves. Correct for a soft, reversible stop.
--   rejected -> guard_ad_activation only allows reactivation from
--               ('active','paused'), so a rejected campaign cannot be revived by
--               the vendor; only an admin (or a fresh payment) can. Correct for a
--               takedown that must stay down.
--
-- Reusing 'ended' would have been wrong: 'ended' is the natural expiry state and
-- carries no moderation meaning, so an audit could not distinguish a campaign
-- that ran its course from one that was pulled.
--
-- Buyer-side impact is already correct with no further change: active_ads serves
-- `where a.status = 'active'`, and ad_impression/ad_click no-op otherwise, so a
-- rejected ad stops serving immediately.
--
-- FOLLOW-UP REQUIRED in textile-spark-net (cosmetic, not functional):
--   src/lib/queries/ads.ts declares `AdStatus = "draft"|"active"|"paused"|"ended"`
--   and Advertisements.tsx maps status -> badge colour. A 'rejected' ad renders
--   with an unstyled badge there until 'rejected' is added to that union/map.
--   The vendor already cannot resume it (the pause/resume button only renders for
--   active|paused), so behaviour is correct — only the styling is missing.
-- ─────────────────────────────────────────────────────────────

alter table public.advertisements drop constraint if exists advertisements_status_check;

alter table public.advertisements
  add constraint advertisements_status_check
  check (status = any (array['draft'::text, 'active'::text, 'paused'::text, 'ended'::text, 'rejected'::text]));
