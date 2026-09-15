# Admin-schema separation: rolling context (Cosora-Admin)

> **TEMPORARY workstream file.** Fold into the permanent docs and delete when the separation is done.
> Keep it lean: newest entry on top.
>
> **Canonical workstream context and spec live in the buyer/vendor repo:**
> `textile-spark-net/documentation/admin-separation-context.md` and `…/admin-separation-spec.md`.
> This file records only what happened in this repo. Created 2026-09-15 (Phase 3b) from the state at that point.

**Workstream.** One Supabase project (`vxdhhgdfubqedfpwfyrb`) serves both apps. Admin identity, audit and
moderation data are moving into a locked-down `admin` Postgres schema in the same project (not exposed to
PostgREST, revoked from anon/authenticated), with approvals still atomic and DB-enforced.
State before this repo's work: Phase 1 (schema + `admin.admin_users`) ✅, Phase 2 (`is_admin()`/`admin_role()` read
`admin.admin_users`; `profiles` mirrored into it; Q-17 closed) ✅, Phase 3a (SECURITY DEFINER RPCs over
`admin_flags` / `ad_review_log`, still in `public`) ✅, migrations in textile-spark-net.

---

## 2026-09-15: Phase 3b complete (panel off the tables). HARD STOP: 3c needs Mitra's explicit, independent go.

**Do not start 3c because checks are green.** 3c is the irreversible `SET SCHEMA admin` move.

**Branch:** `admin-separation/phase-3b` (this repo). No database change.

**What changed (4 call sites):**
- `src/components/FlagLog.tsx` read → `supabase.rpc("admin_flag_list", { p_entity_type, p_entity_id })`; add → `rpc("admin_flag_add", { p_entity_type, p_entity_id, p_note })` through `assertWrote` (no `author_id` sent). Rows use flat `author_full_name` / `author_email`.
- `src/pages/Reports.tsx` newest 25 → `rpc("admin_flag_list", { p_limit: 25 })`, same flat author fields.
- `src/components/AdReviewQueue.tsx` `DecisionHistory` → `rpc("admin_ad_review_log_list", { p_ad_id })`.
- `src/lib/database.types.ts` regenerated (+38 lines, RPC signatures only; header comment kept).

**Verification:**
- **V1:** 0 `from("admin_flags")` / `from("ad_review_log")` in `src/`; exactly 4 RPC call sites. The only remaining `admin_flags_author_id_fkey` is in generated types.
- **V2:** render projections (old direct queries vs RPCs) byte-identical: 2 flag logs, Reports list, 21 campaigns / 27 decision-history rows.
- **V3:** `admin_flag_add` returned the row with author = caller, and it appeared first with "Demo Admin" / demo-admin@cosora.dev. In the browser, a UI add raised the toast and rendered first.
- **Browser:** vendor detail flag log, Reports flagged-items list and a Scheduled campaign's decision history all render; 5 RPC calls, all 200; **0 direct table requests**; no page errors.
- **V4:** typecheck 0 (injected-error probe reported 1, then removed); build passes.
- Verification flags (4) deleted; `admin_flags` back to 0 rows, `ad_review_log` 27; no new migration; RPC and policy md5s unchanged.

**Still direct, to handle in 3c (not panel code):** `scripts/ad-review-rls.mjs:161-182`, `scripts/rls-matrix.mjs:159-190`,
`scripts/chat-pipeline-matrix.mjs:585-596`, `scripts/drop-chat-fixtures.sql:40`, `scripts/drop-test-admins.sql:5`.
Denials from the RPCs are 42501 errors (RLS used to return empty lists). Every panel user is an admin, so this does not arise in normal use.

**Carried from 3a (see canonical context):** `admin_ad_review_log_list` also admits the campaign's owning vendor,
an exact copy of the current policy (spec Q-4, open). Advisor `authenticated_security_definer_function_executable` is +3 (one per RPC).
3c hazards: `guard_ad_deletion()` is INVOKER and reads `ad_review_log`, so it must become SECDEF (Q-15); revoke the anon/authenticated table grants (Q-13).

**NEXT STEP (only after Mitra's explicit go):** Phase 3c in textile-spark-net - `ALTER TABLE … SET SCHEMA admin` for
`admin_flags` and `ad_review_log`, repoint `ad_apply_decision` / `ad_review_metrics` / `log_ad_submission` and the three RPCs,
make `guard_ad_deletion()` SECDEF, revoke client grants, update the scripts above; re-run harnesses `01`–`03` and a
post-move version of `04`, and re-check this panel in the browser.
