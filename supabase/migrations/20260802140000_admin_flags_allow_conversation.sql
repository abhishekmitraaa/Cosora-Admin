-- ─────────────────────────────────────────────────────────────
-- Let the flagged-items log attach a note to a conversation.
--
-- `admin_flags.entity_type` is NOT free text, despite being a `text` column:
-- 20260717140000 gave it
--
--   check (entity_type in ('vendor', 'product', 'ad'))
--
-- so a <FlagLog entityType="conversation"> would have failed its INSERT with a
-- 23514 at runtime. (An INSERT does raise, unlike an UPDATE, so this would have
-- surfaced as a visible error rather than a silent no-op — but only once
-- someone tried it.)
--
-- Widened rather than dropped. The constraint is doing real work: entity_type
-- is what the FlagLog query filters on, and a typo'd value would write a note
-- that no screen can ever read back.
--
-- No RLS change. admin_flags_select is `is_admin()` and admin_flags_insert is
-- `is_admin() and author_id = auth.uid()`; neither mentions entity_type, so
-- every admin who can already leave a note on a vendor can leave one on a
-- conversation. That is deliberate — the flagged-items log is the one table
-- support may write, and chat review is support's job.
-- ─────────────────────────────────────────────────────────────

alter table public.admin_flags
  drop constraint if exists admin_flags_entity_type_check;

alter table public.admin_flags
  add constraint admin_flags_entity_type_check
  check (entity_type in ('vendor', 'product', 'ad', 'conversation'));
