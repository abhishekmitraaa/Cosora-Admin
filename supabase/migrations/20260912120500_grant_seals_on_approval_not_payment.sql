-- "Payment is never approval, with no exception."
--
-- The campaign itself is review-gated as of 20260912120000, but the TRUST SEAL
-- was not. `grantSeals()` in razorpay-verify-payment ran on the payment path,
-- right beside the insert, calling grant_ad_verification() for any
-- trustedSeal / verifiedCertificate placement in the order. So a vendor paid
-- ₹44, got `vendor_profiles.ad_verified_until` extended immediately, and the
-- verified badge rendered on their profile and on every one of their product
-- cards — before a human had looked at anything.
--
-- That is the single most trust-bearing thing the ad system sells, and it was
-- the one thing payment could still buy outright. The grant moves here, into
-- approve_ad_campaign(), so the badge appears only after review.
--
-- The matching half of this change removes grantSeals() from both branches of
-- razorpay-verify-payment (live and demo). Without that, seals would be granted
-- twice; grant_ad_verification() takes max(expires_at) so it would be harmless,
-- but the payment-time grant would still happen, which is the whole point.

-- Which placements carry a seal. Mirrors SEAL_SOURCES in
-- razorpay-verify-payment and the vendor_ad_verifications.source check
-- constraint; all three describe the same product decision.
create or replace function public.ad_seal_sources(p_placement text)
returns text[] language sql immutable set search_path to 'public'
as $$
  select coalesce(array_agg(s), array[]::text[])
    from unnest(string_to_array(replace(coalesce(p_placement, ''), ' ', ''), ',')) s
   where s in ('trustedSeal', 'verifiedCertificate');
$$;

create or replace function public.approve_ad_campaign(p_ad_id uuid, p_note text default null)
returns text language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cur text; v_target text; v_ad public.advertisements; s text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: approving a campaign requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  select * into v_ad from public.advertisements where id = p_ad_id;
  if v_ad.id is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  v_cur := v_ad.status;

  if v_cur <> 'pending_review' then
    raise exception 'campaign % is %, only a pending_review campaign can be approved', p_ad_id, v_cur
      using errcode = 'P0001';
  end if;

  v_target := public.ad_target_live_status(p_ad_id);
  if v_target = 'expired' then
    raise exception 'campaign % has already ended; approving it would publish nothing', p_ad_id
      using errcode = 'P0001';
  end if;

  perform public.ad_apply_decision(
    p_ad_id, v_target, 'approved', null, p_note, auth.uid(),
    case when v_target = 'scheduled'
         then 'Your campaign was approved and is scheduled'
         else 'Your campaign was approved and is now live' end,
    p_note);

  -- Seals last as long as the campaign that bought them. Granted AFTER the
  -- decision, so a rejected campaign never produces a badge.
  foreach s in array public.ad_seal_sources(v_ad.placement) loop
    perform public.grant_ad_verification(
      v_ad.vendor_id, s, coalesce(v_ad.ends_at, now() + interval '30 days'));
  end loop;

  return v_target;
end $$;

revoke all on function public.approve_ad_campaign(uuid, text) from public, anon;
grant execute on function public.approve_ad_campaign(uuid, text) to authenticated;
