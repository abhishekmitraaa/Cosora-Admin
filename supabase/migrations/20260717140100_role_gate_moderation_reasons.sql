-- ─────────────────────────────────────────────────────────────
-- Extend the Prompt-1 moderation triggers to cover the reason columns added by
-- 20260717140000. Without this, the reason fields are writable by anyone who
-- can write the row at all — notably a vendor could stamp a fabricated
-- `rejection_reason` on their OWN product, or blank the `moderation_reason`
-- recording why their ad was pulled. The reason is part of the moderation
-- decision and must be gated exactly like the status it explains.
--
-- Both functions keep their original logic verbatim and the same
-- `current_user <> 'authenticated'` bypass for service-role / SECURITY DEFINER
-- callers.
-- ─────────────────────────────────────────────────────────────

create or replace function public.enforce_products_moderation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;  -- service role / SECURITY DEFINER RPC: authorization done there
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'under_review')
       and not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      new.status := 'under_review';  -- clamp a client trying to insert live/rejected
    end if;
    -- A moderation reason may only originate from a moderator.
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      new.rejection_reason := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if auth.uid() = old.vendor_id then
      if new.status not in ('draft', 'under_review') then
        raise exception 'Vendors cannot set product status to %; moderation required', new.status
          using errcode = '42501';
      end if;
    elsif not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      raise exception 'Product moderation requires the super_admin or product_moderator role'
        using errcode = '42501';
    end if;
  end if;

  if new.rejection_reason is distinct from old.rejection_reason
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
    raise exception 'Changing a product rejection reason requires the super_admin or product_moderator role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_moderation on public.products;
create trigger trg_products_moderation
  before insert or update on public.products
  for each row execute function public.enforce_products_moderation();


-- advertisements: same treatment. Note this trigger now also fires on INSERT
-- (it was UPDATE-only) so a vendor cannot create an ad pre-stamped with
-- moderation metadata.
create or replace function public.enforce_ads_moderation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator')) then
      new.moderation_reason := null;
      new.moderated_at      := null;
      new.moderated_by      := null;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and auth.uid() is distinct from old.vendor_id
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator')) then
    raise exception 'Ad moderation requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  if (new.moderation_reason is distinct from old.moderation_reason
      or new.moderated_at is distinct from old.moderated_at
      or new.moderated_by is distinct from old.moderated_by)
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator')) then
    raise exception 'Recording an ad moderation reason requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ads_moderation on public.advertisements;
create trigger trg_ads_moderation
  before insert or update on public.advertisements
  for each row execute function public.enforce_ads_moderation();
