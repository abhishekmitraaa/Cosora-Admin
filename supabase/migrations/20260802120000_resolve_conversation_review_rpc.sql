-- ─────────────────────────────────────────────────────────────
-- resolve_conversation_review() — the ONLY write path for closing a chat review.
--
-- Why this has to be a SECURITY DEFINER function and not a client UPDATE:
--
--   `conversations.status` has NO admin-write RLS policy. Phase 1 added a BEFORE
--   trigger that ALLOWS an admin to change it, but a trigger cannot grant
--   visibility — RLS decides which rows an UPDATE can even match, and no policy
--   lets an admin match a conversation they are not a participant of. So a
--   client-side `update conversations set status='active'` matches ZERO rows and
--   PostgREST returns SUCCESS WITH NO ERROR. The UI would report a resumed chat
--   that is still locked. (This is the same silent-denial trap documented in
--   src/lib/supabase.ts / assertWrote.)
--
--   Resolving a review is also two writes that must not half-apply: the review
--   row AND, for 'resumed', the conversation row. One function, one statement
--   boundary, one transaction.
--
-- Authorization is checked HERE, in the function, because SECURITY DEFINER
-- deliberately bypasses the RLS that would otherwise do it. The predicate is the
-- same one set_account_status uses (support / super_admin), so the two halves of
-- a "block" action can never disagree about who is allowed to act.
--
-- EVERY failure path raises. There is no "succeeded but changed nothing" result,
-- so callers can rely on `if (error) throw` alone — unlike a table UPDATE.
-- ─────────────────────────────────────────────────────────────

create or replace function public.resolve_conversation_review(
  p_review_id uuid,
  p_resolution text,
  p_reason_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_conversation_id uuid;
begin
  if not (public.is_admin() and public.admin_role() in ('support', 'super_admin')) then
    raise exception 'not authorized: resolving a chat review requires the support or super_admin role'
      using errcode = '42501';
  end if;

  -- Mirrors conversation_reviews_status_chk minus 'pending' — a review cannot be
  -- resolved back into the queue.
  if p_resolution not in ('resumed', 'buyer_blocked', 'vendor_blocked', 'kept_locked') then
    raise exception 'invalid resolution: % (expected resumed / buyer_blocked / vendor_blocked / kept_locked)',
      p_resolution using errcode = '22023';
  end if;

  -- `and status = 'pending'` makes this idempotent-safe rather than idempotent:
  -- a double-click, or two admins acting on the same row, resolves once and the
  -- loser gets the P0002 below instead of silently overwriting the first
  -- decision (and its reviewed_by).
  update public.conversation_reviews
     set status      = p_resolution,
         reason_id   = coalesce(p_reason_id, reason_id),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_review_id
     and status = 'pending'
  returning conversation_id into v_conversation_id;

  if v_conversation_id is null then
    raise exception 'chat review % is not pending — it was already resolved, or it does not exist',
      p_review_id using errcode = 'P0002';
  end if;

  -- 'kept_locked' and the two block resolutions deliberately leave
  -- conversations.status alone: the chat stays 'under_review' (locked) and only
  -- the review row records what was decided. Suspending the account is a
  -- SEPARATE call to set_account_status by the caller — this function never
  -- touches profiles.account_status, so the account_suspensions ledger keeps a
  -- single writer.
  if p_resolution = 'resumed' then
    update public.conversations
       set status = 'active'
     where id = v_conversation_id;
  end if;
end;
$$;

-- Nothing unauthenticated has any business calling this.
revoke all on function public.resolve_conversation_review(uuid, text, uuid) from public, anon;
grant execute on function public.resolve_conversation_review(uuid, text, uuid) to authenticated, service_role;
