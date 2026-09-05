-- ─────────────────────────────────────────────────────────────
-- resolve_conversation_review() — the ONLY write path for closing a chat review.
--
-- Why this has to be a SECURITY DEFINER function and not a client UPDATE:
--
--   `conversations` has NO admin-write RLS policy. `conversations_update`'s
--   USING clause is `auth.uid() = user_a or auth.uid() = user_b` — participants
--   only. 20260801095820 added a BEFORE trigger that ALLOWS support/super_admin
--   to change `status`, but a trigger cannot grant visibility: RLS decides which
--   rows an UPDATE can even match, and no policy lets an admin match a
--   conversation they are not in. So a client-side
--   `update conversations set status='active'` matches ZERO rows and PostgREST
--   returns SUCCESS WITH NO ERROR. The UI would report a resumed chat that is
--   still locked. (Same silent-denial trap documented in src/lib/supabase.ts.)
--
--   Widening conversations_update to admins would be the bigger hole: it lets an
--   admin bypass enforce_conversation_status()'s gating entirely. A
--   purpose-built RPC keeps the trigger authoritative.
--
--   Resolving a review is also two writes that must not half-apply: the review
--   row AND, when resuming, the conversation row. One function, one statement
--   boundary, one transaction.
--
-- Authorization is checked HERE, in the function, because SECURITY DEFINER
-- deliberately bypasses the RLS that would otherwise do it. The predicate is the
-- same one set_account_status() uses (support / super_admin), so the two halves
-- of a "block" action can never disagree about who is allowed to act.
--
-- EVERY failure path raises. There is no "succeeded but changed nothing" result,
-- so callers can rely on `if (error) throw` alone — unlike a table UPDATE.
--
-- ── p_resume: the product decision, made explicit ──
--
-- Whether a BLOCK verdict reopens the thread for the innocent party is a policy
-- choice, not a technical one. Both are safe: messages_insert independently
-- requires the SENDER's account_status to be 'active', so a resumed thread is
-- still unusable by the party who was just suspended — reopening cannot undo a
-- suspension.
--
-- This build defaults to p_resume => FALSE: a verdict closes the review and
-- leaves the thread locked unless the caller explicitly asks to reopen it. The
-- reviewer decides, per case, in the UI. 'resumed' is the one verdict that
-- implies its own answer and passes p_resume => true.
--
-- 'kept_locked' can NEVER resume, by definition — the name is the decision.
-- ─────────────────────────────────────────────────────────────

-- The 3-argument shape from the unshipped draft of this migration is dropped
-- first rather than CREATE OR REPLACE'd: adding a defaulted 4th parameter would
-- create a second OVERLOAD, and every 3-argument call site would then fail with
-- "function is not unique". This is the same trap 20260801154739 hit with
-- submit_report(), and the same fix.
drop function if exists public.resolve_conversation_review(uuid, text, uuid);

create or replace function public.resolve_conversation_review(
  p_review_id uuid,
  p_verdict   text,
  p_reason_id uuid default null,
  p_resume    boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_conversation_id uuid;
  v_user_a          uuid;
  v_user_b          uuid;
  v_title           text;
  v_body            text;
  v_kind            text;
begin
  if not (public.is_admin() and public.admin_role() in ('support', 'super_admin')) then
    raise exception 'not authorized: resolving a chat review requires the support or super_admin role'
      using errcode = '42501';
  end if;

  -- Mirrors conversation_reviews_status_check minus 'pending' — a review cannot
  -- be resolved back into the queue.
  if p_verdict not in ('resumed', 'buyer_blocked', 'vendor_blocked', 'kept_locked') then
    raise exception 'invalid verdict: % (expected resumed / buyer_blocked / vendor_blocked / kept_locked)',
      p_verdict using errcode = '22023';
  end if;

  -- `and status = 'pending'` makes this idempotent-SAFE rather than idempotent:
  -- a double-click, or two admins acting on the same row, resolves once and the
  -- loser gets the P0002 below instead of silently overwriting the first
  -- decision (and its reviewed_by).
  update public.conversation_reviews
     set status      = p_verdict,
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

  -- 'kept_locked' never resumes regardless of what the caller passed. Honouring
  -- p_resume there would let the UI produce a row that says "kept locked" beside
  -- a thread that is open, which is worse than either outcome on its own.
  --
  -- This function never touches profiles.account_status. Suspending is a
  -- SEPARATE call to set_account_status(), so the account_suspensions ledger
  -- keeps exactly one writer.
  if p_resume and p_verdict <> 'kept_locked' then
    update public.conversations
       set status = 'active'
     where id = v_conversation_id;

    v_kind  := 'chat_resumed';
    v_title := 'A conversation is active again';
    v_body  := 'You can send messages in this chat again.';
  else
    v_kind  := 'chat_locked';
    v_title := 'A conversation is still under review';
    v_body  := 'Our team has looked at this chat. Messages stay paused for now.';
  end if;

  -- Tell BOTH participants, on every verdict. The suspended party, if there is
  -- one, separately gets their own account notice from set_account_status() —
  -- this one is only ever about the thread.
  --
  -- The copy above deliberately says nothing about WHICH verdict was reached or
  -- WHO was blocked. In a two-person thread "the buyer was suspended" is
  -- readable off "the vendor was not", so the only safe message is the one that
  -- describes the thread's state and nothing else. notify() has no EXECUTE
  -- grant for any client role, so this is the only way these rows exist.
  select user_a, user_b into v_user_a, v_user_b
    from public.conversations where id = v_conversation_id;

  perform public.notify(v_user_a, v_kind, v_title, v_body, v_conversation_id);
  perform public.notify(v_user_b, v_kind, v_title, v_body, v_conversation_id);
end;
$$;

-- Nothing unauthenticated has any business calling this.
revoke all on function public.resolve_conversation_review(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.resolve_conversation_review(uuid, text, uuid, boolean) to authenticated, service_role;
