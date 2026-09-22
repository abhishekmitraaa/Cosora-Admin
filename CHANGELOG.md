# Changelog

Reverse-chronological. Newest entry at the top.

Companion to `README.md`, which describes the panel as it stands *now*; this file records
how it got there and why. The buyer/vendor app keeps its own, much longer log at
`textile-spark-net/documentation/changelog.md` — a change touching both repos gets an
entry in each, from that repo's point of view.

---

- 2026-09-22 (Admin-schema separation · Phase 5b): **The panel and both of this repo's edge functions stopped reading and writing `profiles.is_admin` / `profiles.admin_role`.** No migration.
  - `useAdminSession` calls `admin_whoami()`. "Signed in but no row" is still a non-admin identity, not an error.
  - `Admins.tsx` reads the roster through `admin_list_admins` and candidates through `admin_search_candidates`. set-role, promote and demote go through `admin_set_role`, `admin_grant` and `admin_revoke`. They raise on refusal, so `if (error)` replaces `assertWrote`.
  - The row type lost `is_admin`, and `admin_role` is never null now, so the "No role assigned" option is gone. The React self-edit and last-super_admin guards stay.
  - The footnote no longer claims the database will let you drop the last super_admin. Since 5a it refuses (42501).
  - `admin-invite` (v6) and `admin-refund-payment` (v4) authorize the caller through `admin_status_of`. Both fail closed. The pre-deploy check found only comment differences from the deployed versions.
  - `ResetPassword.tsx`: comment only.
  - **Exercised in a browser on the dev server, 16/16:** login and shell, whoami, the roster (3), the self-edit guard, search, promote to Support, role change to Ads moderator, demote, and invite. Zero requests read or wrote the profiles columns. A non-admin sees "Not an admin account".
  - **Edge functions live:** a non-admin gets 403 from invite and refund; a super_admin passes both. The test admin row was deleted.
  - Typecheck 0 (the probe fires 1); build passes.
- 2026-09-22 (Admin-schema separation · Phase 5a): **`admin-invite` now grants admin access through the new `admin_grant` RPC (textile-spark-net migration `20260922120000`, mirrored here byte-for-byte) instead of PATCHing `profiles.is_admin/admin_role` and relying on the mirror trigger. Deployed as v5. No panel code changed yet; the caller-authz read moves to `admin_status_of` in 5b.**
  - `grantAdmin()` makes two writes, in this order: `PATCH profiles {email}`, keeping the old email backfill and its "no profiles row matched" check, then `rpc/admin_grant`. A failure can leave a harmless email backfill but never a half-granted admin. The JSON payloads of all three branches are unchanged.
  - **Pre-deploy drift check:** deployed v4 differed from the repo only in three comment prefixes.
  - **Live:** demo-buyer got 403 forbidden. demo-admin promoting demo-vendor (a password account) returned `outcome:"promoted", emailSent:false`, and the roster RPC showed it. `admin_revoke` then removed it and the test row was deleted.
  - `src/lib/database.types.ts` +64 lines (the 7 RPCs). Typecheck 0 (the injected probe fires 1); build passes.
- 2026-09-22 (Admin-schema separation · Phase 4c): **The five chat-moderation and suspension tables moved into the `admin` schema (textile-spark-net migration `20260921190000`). The panel needed no code change, because 4b already made it RPC-only; this repo's scripts and types follow the move.**
  - **The production panel was verified after the move** in a real browser on `cosora-admin.vercel.app`. The keywords, patterns, reasons, review queue, chat thread, accounts and vendor-detail screens all load through the RPCs: 6 RPCs at 200, 0 direct table requests, no errors.
  - **Scripts:**
    - `chat-moderation-behaviour.mjs` now reads and writes through the RPCs. Case 7b's second pending review is filed by a participant's `submit_report` instead of a direct insert. It ran **17/17 green** against the walled database.
    - `chat-moderation-matrix.mjs` moved its five tables' cases onto the RPCs, with the allowed-role lists unchanged. It also fixes a latent bug: the resolve case passed `p_resolution`, not `p_verdict`, so it never reached the function.
    - `chat-pipeline-matrix.mjs` has about 30 sites on the RPCs, via small helpers (`reviews`, `onePending`, `addTerms`/`removeTerms`). T7.7 now asserts direct ledger writes FAIL (PGRST205), where before they matched 0 rows.
    - `drop-chat-fixtures.sql` uses `admin.*` and ran cleanly. It also removes the matrix's `zz-verify-%` reasons, which have no client delete path.
  - The two matrices need the seeded `rlstest-*`/`chatfx-*` logins, which are not seeded in production. Their converted cases were run with demo accounts instead.
  - `src/lib/database.types.ts` −249 lines (the five table blocks). Typecheck 0 (the harness fires 1 on an injected error); build passes.
- 2026-09-21 (Admin-schema separation · Phase 4b): **The chat-moderation and suspension screens now read and write `keyword_blocklist`, `flag_patterns`, `chat_block_reasons`, `conversation_reviews` and `account_suspensions` only through the Phase 4a RPCs (textile-spark-net migration `20260921090000`). There are no direct queries on those tables, and nothing on screen changed.** No database change.
  - **Nine files and fifteen call sites.** They are:
    - `ChatKeywords`: `admin_keyword_list` / `_add` / `_remove`.
    - `ChatPatterns`: `admin_flag_pattern_list` / `_add` / `_update` / `_remove`; `regex_probe` is unchanged.
    - `ChatReasons`: `admin_block_reason_list` / `_add` / `_update`.
    - `lib/chat.ts` (the reason picker): `admin_block_reason_list(true)`.
    - `ChatReview` and `ChatThread`: `admin_conversation_review_list`, by status or by conversation.
    - `AccountStatus` and `Accounts`: `admin_account_suspension_list`.
  - **Writes go through `assertWrote`**, including the inserts that used to check only for an error. `added_by`/`created_by` are no longer sent, because the RPC sets them to the caller.
  - **Rendering is untouched.** The RPCs return embedded data as flat columns. Each page folds them back into the shape it already rendered, so the JSX did not change. An embed is null exactly when its joined row is absent, as before.
  - **Proof.** A browser dump of 12 screens was taken before the change and after each table, with labelled fixtures so every screen had data: **identical text on all 12, every time.** The screens are the keywords, patterns and reasons lists, all five review tabs, a chat thread, Accounts, vendor detail with account status, and the reason picker. After the change the pages made 0 direct requests to the five tables.
  - Every write was exercised in the UI against the live project: keyword add/remove, pattern test/add/deactivate/activate/delete, reason add/edit/deactivate, review resume, and account suspend/reinstate. Each went through its RPC. Buyer, vendor and anon are refused on every RPC. All verification rows and notifications were deleted afterwards.
  - **No role loses anything.** Where the table used to return 0 rows, the RPC raises 42501. No screen reaches that path: the chat screens and Accounts are route-guarded to support/super_admin, which is exactly the set the policies admit, and `AccountStatus`'s history query only runs for them. `Accounts` still ignores a failed suspension read, as it did before.
  - Fixed the stale comment in `lib/chat.ts` saying support "may only read ACTIVE rows". `chat_block_reasons_select` has no active filter.
  - `src/lib/database.types.ts` was regenerated (+143 lines: the 12 RPCs, plus `lead_cap_used` from unrelated buyer-repo work). Typecheck 0 (the harness fires 1 on an injected error); build passes.
- 2026-09-16 (Admin-schema separation · Phase 3c): **`admin_flags` and `ad_review_log` moved into the `admin` schema (textile-spark-net migration `20260916090000`). The panel needed no code change, because 3b already made it RPC-only; this repo's scripts and types follow the move.**
  - **Production panel verified after the move** in a real browser on `cosora-admin.vercel.app`: flag log (including adding a note), the Reports flagged-items list and a campaign's decision history all render. Five RPC calls, all 200; 0 direct table requests; no page errors.
  - **Decision history is admin-only now (Q-4).** `admin_ad_review_log_list` refuses a campaign's own vendor with 42501. The panel is admin-only, so nothing visible changes.
  - **Scripts off the tables.** `scripts/ad-review-rls.mjs`: the log is read through `admin_ad_review_log_list` as admin; a new case checks the owning vendor is refused (Q-4); the two direct INSERT/DELETE-on-the-table deny cases are retired, since the table has no REST surface and they would pass vacuously on a 404. Ran **25/25** against a labelled fixture. `scripts/rls-matrix.mjs`: the note and forged-author cases now call `admin_flag_add`; forging an author means passing a parameter the function does not have, and PostgREST refuses it (PGRST202). `scripts/chat-pipeline-matrix.mjs` T6.8 uses `admin_flag_add` and checks the author; its no-op direct delete is removed, because fixture cleanup owns that. The converted cases pass 14/14 over REST with demo accounts. The full suites were not run, because they need seeded admin logins with a known password in production.
  - **Cleanup SQL targets `admin.admin_flags`:** `scripts/drop-test-admins.sql`, `scripts/drop-chat-fixtures.sql`. Both ran with no schema error.
  - **`src/lib/database.types.ts` regenerated:** −86 lines (the two table types); the RPC signatures remain. `npm run typecheck` 0; `npm run build` passes.
- 2026-09-15 (Admin-schema separation · Phase 3b): **The flagged-items log and the ad decision history no longer query their tables. Every read and write goes through the Phase 3a RPCs, and the screens render byte-identical data.**
  `admin_flags` and `ad_review_log` are moving behind the `admin` schema wall (Phase 3c), where a direct PostgREST query cannot reach them. This release takes the panel off the tables first, so the move changes nothing a moderator can see. No database change in this step.
  - **Four call sites, nothing else.** `FlagLog.tsx` read → `admin_flag_list(entity_type, entity_id)`; `FlagLog.tsx` add → `admin_flag_add(entity_type, entity_id, note)`; `Reports.tsx` newest 25 → `admin_flag_list(null, null, 25)`; `AdReviewQueue.tsx` decision history → `admin_ad_review_log_list(ad_id)`. A grep of `src/` finds 0 remaining `from("admin_flags")` / `from("ad_review_log")`. The panel never deleted a flag, so there is no delete path to move.
  - **The author embed is gone.** `admin_flag_list` returns `author_full_name` / `author_email` on each row, so both lists read those instead of `author:profiles!admin_flags_author_id_fkey(…)`. The label logic is unchanged: full name, else email, else "Unknown admin".
  - **Add note sends no `author_id` any more.** The RPC always writes `auth.uid()`, so a forged author is impossible rather than refused. The returned row goes through `assertWrote`, the same helper every other write uses. The "Not signed in" guard stays.
  - **`src/lib/database.types.ts` regenerated from the live schema:** +38 lines, the three RPC signatures only. The file's "GENERATED — do not hand-edit" header is kept.
  - **Verified, not assumed.** Signed in as demo-admin, the render projections were dumped before the change with the old queries verbatim and after it with the RPCs: the fields each screen shows, in order, for two flag logs, the Reports list and the decision history of all 21 campaigns that have one (27 rows). Result: **byte-identical**. Two labelled verification flags were seeded first so the flag views were not empty. `admin_flag_add` returned the new row authored by the caller, and it appeared first in both lists with name and email. **In a real browser** on this branch's dev server: the vendor detail flag log rendered the seeded note, a note added through the UI raised "Note added to log" and appeared first as "Demo Admin", Reports rendered all four notes, and a Scheduled campaign's history rendered `approved pending_review → scheduled`. Five RPC calls, all 200; **zero requests to `/rest/v1/admin_flags` or `/rest/v1/ad_review_log`**; no page errors. All verification flags were deleted afterward (`admin_flags` back to 0 rows). `npm run typecheck` 0 (probe-verified: one injected error reported exactly 1, then removed); `npm run build` passes.
  - **Scripts still query the tables directly, by design for now:** `scripts/ad-review-rls.mjs`, `rls-matrix.mjs`, `chat-pipeline-matrix.mjs`, `drop-chat-fixtures.sql`, `drop-test-admins.sql`. They test the tables' RLS and clean fixtures, so they are rewritten with the Phase 3c move, not before it.
- 2026-09-12 (Advertising System v3): **The panel gained the half of ad moderation that did not exist: review before publish.**
  This page used to carry a banner reading *"No pre-publish gate. Ads still auto-publish on
  payment, exactly as before."* That was true, and it was the problem. It is now false, and
  leaving it would have been the most misleading sentence in the panel — a moderator would
  believe live campaigns had been reviewed when nothing had ever reviewed them.
  - **New `Review` view** (`src/components/AdReviewQueue.tsx`), now the default landing tab
    on `/ads`, because it is the one with campaigns waiting on a person — and a vendor who
    has already paid is waiting behind each. Tabs: waiting for review, changes requested,
    scheduled, suspended. Queue ordered **oldest first**; newest-first would starve the
    campaign that has been waiting longest. Each row expands to creative, targeting,
    schedule and an append-only decision history from `ad_review_log`.
  - **Actions call RPCs, never a table write.** `approve_ad_campaign`, `reject_ad_campaign`,
    `request_ad_changes`, `suspend_ad_campaign` — all SECURITY DEFINER, all raising on
    refusal. `assertWrote` is gone from `Ads.tsx`: it existed to catch a silent zero-row
    UPDATE, and there is no longer one to catch. Approve returns **where it landed** —
    a campaign starting in the future becomes `scheduled`, and the toast says so rather
    than claiming it is live.
  - **Moderation view rewired too.** Pause/reject/resume now go through
    `pause_ad_campaign_by_admin` / `reject_ad_campaign` / `resume_ad_campaign`, so each
    takedown writes its `ad_review_log` row in the same transaction — the old single UPDATE
    could not, leaving the decision history blank exactly where a takedown happened.
    **"Restore to active" was removed from rejected campaigns**: undoing a review decision
    by forcing the status back would skip review entirely. A rejected campaign is
    resubmitted by the vendor and re-approved, which records both steps.
  - **Reason codes are a fixed vocabulary**, not free text, because the rejection-reason
    breakdown counts them and "misleading" vs "Misleading claims" would split one reason
    into two rows. The free-text note carries the detail and is what the vendor reads.
  - **Migrations** (applied live): `20260912120000` state model + INSERT-bound activation
    guard, `…0100` the nine review RPCs, `…0400` `ad_fraud_signals()` +
    `ad_review_metrics()`, `…0500` trust seals granted on approval instead of payment.
  - **Invalid-traffic signal is read-only.** The brief asked for flagged campaigns to be
    "routed to `suspend_ad_campaign`" and, one sentence later, said "never auto-block —
    human review only". Those are incompatible; suspending *is* blocking. `ad_fraud_signals()`
    ranks and surfaces, a human presses Suspend. It is a heuristic over session ids with no
    IP or device fingerprint available, and is labelled as one.
  - **Verified:** new `scripts/ad-review-rls.mjs`, **26/26** against the live database with
    real logins — a buyer refused every RPC, the campaign's own owner refused every
    moderator action and a direct `status='active'` write, an admin allowed, a vendor
    refused when resuming an **admin** pause, and `ad_review_log` INSERT/DELETE refused
    even for a super_admin. `npm run typecheck` → 0 errors (probe-verified).
- 2026-09-11 (Master Prompt 8, Phase 1): **No password is in this repository any more.**
  The demo accounts' shared password (demo-admin is a `super_admin`) was rotated in the
  live project, with sessions revoked; the old value now returns `invalid_credentials`.
  `scripts/chat-moderation-behaviour.mjs` had it as a literal. Twelve more scripts and
  both admin-creating seeds had the rlstest/chatfx fixture password as one. All now read
  `.env` through `scripts/lib/test-credentials.mjs` (`credential()`,
  `demoAccount()`). `seed-test-admins.sql` and `seed-chat-fixtures.sql` take the password
  from `current_setting('cosora.fixture_password')`, and a guard aborts them if it is
  unset. `.env.example` lists `DEMO_*_PASSWORD` and `FIXTURE_PASSWORD`; the README's
  verification steps say how to seed. No fixture account exists today, so nothing
  needed rotating there. `git grep -lF` for either old value → 0 files. The full account
  is in `textile-spark-net/documentation/securityflags.md`.
- 2026-09-11: **Both vendor-trust panels verified in a real browser, then committed and pushed.**
  `VendorKycPanel` (2026-09-08) and `VendorContractPanel` (2026-09-09) had lived only in a
  working tree — never committed — which is why a fresh clone of `origin/main` could not show
  them. Before pushing, `textile-spark-net/tests/mp7-admin-vendor-panels.spec.ts` drove this app
  at `/vendors/:id` as a super_admin, 3/3:
  - the Supplier agreement panel lists a vendor's two contracts at the same version, flags the
    duplicate, opens a drawn signature through a 5-minute signed URL (the URL resolves), and
    offers no edit or delete control;
  - a typed signature renders "typed — no image on file", with no "View signature" button;
  - on the KYC panel, **Reject** on a PAN (with a reason) writes `verified = false`, the reason
    and `reviewed_by` = the clicking admin; the vendor's own `/kyc` in the vendor app shows the
    reason; **Approve** then writes `verified = true` and clears it. This is the first time the
    approve/reject buttons have been clicked by a real admin session — every earlier check was
    at the RPC layer.
  The login came from the environment (`DEMO_ADMIN_PASSWORD`), not from a file. See the
  buyer/vendor repo's `documentation/securityflags.md` (2026-09-11): the demo super_admin
  password ships in that app's production bundle and needs rotating.

- 2026-09-09: **The signed supplier agreement is finally visible here.** New
  `src/components/VendorContractPanel.tsx`, mounted on `/vendors/:id` under the KYC panel.
  Shows `agreement_version`, `signed_name`, the signing timestamp, and a 5-minute signed URL
  for the signature image — the same on-demand `createSignedUrl` pattern the KYC panel uses,
  because `business-docs` is private and has no public URL.
  - **Read-only, and that is a design constraint rather than a first iteration.**
    `vendor_contracts` has SELECT and INSERT policies and **no UPDATE or DELETE for anyone,
    admins included** — an editable contract is not evidence. A UI with an edit or delete
    control would advertise a capability the database refuses, so there is none. Two further
    guards sit behind that, both added on the app side the same day: the `vendor_id` FK is
    `ON DELETE RESTRICT`, and DELETE on `vendor_profiles` is now admin-only. Together they
    closed a hole where a vendor could destroy their own signed agreement by deleting their
    profile and letting the old `ON DELETE CASCADE` do the rest.
  - **A null `signature_url` is rendered as "typed — no image on file", not as a broken
    image or a blank.** Onboarding offers two ways to sign: draw on a canvas, or accept the
    auto-generated cursive rendering of the typed name. Only a drawn signature produces a
    file. A typed one is still a complete signature — `signed_name` + `agreement_version` +
    timestamp + the vendor's affirmative act — so the panel says which kind it is. Generating
    a picture of the typed name to fill the gap was considered and rejected: it would look
    like a signature the vendor never made.
  - **It warns when a vendor has more than one agreement**, and explains both ways that
    happens: a legitimate re-sign after the agreement text changed (different
    `agreement_version`), versus a duplicate at the SAME version left by a retried onboarding
    submit before `trg_vendor_contracts_one_per_version` existed. The duplicate cannot be
    deleted by anyone, so the panel tells the reviewer to read the newest.
  - **`vendor_contracts` had to be added to `src/lib/database.types.ts`** — the generated
    types here predate the table, so `supabase.from("vendor_contracts")` did not typecheck.
  - Verified: the panel's exact query returns both of a test vendor's rows when run through
    RLS as a `super_admin`, confirming `vendor_contracts_select`'s `is_admin()` branch. The
    rendered panel was verified in a browser on 2026-09-11 — see the entry above. (This entry
    originally said the panel could not be rendered because "no admin credentials are
    available". That was wrong: a super_admin demo login was in the buyer/vendor repo all along.)

- 2026-09-08: **KYC review — the counterparty to a promise the vendor app was already
  making.** New: `src/components/VendorKycPanel.tsx`. Changed: `src/pages/VendorDetail.tsx`,
  `src/lib/database.types.ts`.

  **The gap.** `/onboarding` in the vendor app tells a seller their documents are "submitted
  for review" and leaves `vendor_documents.verified = false`. Nothing in this panel could see
  one of those rows, let alone flip the flag — `VendorDetail` rendered `gstin`/`pan`/`cin` as
  text and stopped there. The promise had nobody on the other end of it.

  **Documents are private and read through a signed URL.** They moved out of the public
  `product-images` bucket into `business-docs` in the same pass (see the vendor app's log for
  the exposure that prompted it). An admin needs **no new policy** to read one:
  `business_docs_owner_select` is already
  `foldername(name)[1] = auth.uid() OR is_admin()`. That was verified against the live
  project *before* any UI was written — an admin session signed another vendor's KYC path and
  fetched it, 200. Signing happens on demand for the one document being opened, not for the
  whole list on mount, because a signed URL is a bearer token for five minutes.

  **The verdict goes through an RPC, not an UPDATE, and for two reasons.** The standing one
  is this repo's own rule: an UPDATE that RLS denies matches zero rows and returns success, so
  a refused write is indistinguishable from an applied one — the same reason `Products.tsx`
  and `Videos.tsx` use `approve_vendor_content`/`reject_vendor_content`. The new one is that
  `vendor_documents_all` is a permissive `ALL` policy (`vendor_id = auth.uid() OR is_admin()`)
  which let a **vendor** set `verified = true` on their own KYC from the browser. A trigger
  now refuses the review columns to non-admins and
  `set_vendor_document_verified(p_doc_id, p_verified, p_reason)` — SECURITY DEFINER, gated to
  support/super_admin — is the only writer. It raises on every failure path.

  **The write gate here is `canWrite(role, "accounts")`, not `"vendors"`.** The database gates
  this on support/super_admin (the `set_account_status` predicate), while the `vendors`
  section is vendor_ops/super_admin. Matching the button to the function keeps a disabled
  control from being the only thing standing between a wrong role and a 42501.

  **A rejection requires a reason and the vendor sees it.** The database refuses a rejection
  with an empty reason. `vendor_documents` gained `rejection_reason`, `reviewed_at` and
  `reviewed_by`, so "never reviewed" stays distinguishable from "reviewed and refused"; the
  reason renders on the vendor's own `/kyc` page and the vendor is notified. Approving clears
  it, mirroring `approve_vendor_content`.

  **Approving KYC does not grant the trust seal, on purpose.** The seal has exactly three
  additive sources and this is not a fourth — auto-granting would make the Manual verification
  card stop describing what buyers actually see. KYC status is shown as a row *inside* that
  card, labelled "does not grant a seal", because it is the context a human wants before
  pressing the button, not a substitute for pressing it.

  **Verified end to end against the live project**, not just in the browser: vendor uploads to
  `business-docs` → row carries a PATH → admin selects another vendor's row → admin opens the
  scan through a signed URL (200) → admin rejects with a reason → the VENDOR reads that reason
  back → admin approves → `verified` flips and the reason clears → both verdicts produced a
  `notifications` row. 8/8.

- 2026-09-06: **Phase 4 - one design system with a real dark mode, plus eight new
  sections.** A visual pass over every existing screen with zero behaviour change,
  and the UI for the sections Phase 2 will wire to real tables.

  **Nothing an existing page does changed.** Verified mechanically rather than
  asserted: every line in the 26 touched files matching a data-layer pattern
  (`supabase.`, `.from(`, `.select(`, `.update(`, `.rpc(`, `assertWrote`,
  `canWrite`, `useQuery`, `useMutation`, `invalidateQueries`, and the rest) was
  extracted before and after and compared. 340 statements, all identical, with a
  single exception: one em-dash inside a user-facing error string in
  `ChatReview.tsx`. No query, no mutation, no `assertWrote`, no role gate and no
  route moved.

  ### The design system

  - **`src/index.css` is now the single source of colour.** Every value is a CSS
    variable holding an `R G B` triplet, read through
    `rgb(var(--token) / <alpha-value>)` in `tailwind.config.js`. Before this, half
    the app wrote `text-slate-600` and the other half wrote `text-ink-muted`, which
    is precisely why it could not have a dark mode.
  - **A real dark mode**, as one set of variable overrides rather than a `dark:`
    variant on every utility, so the two modes cannot drift apart. Three-state
    control (Light / Dark / System) in the rail footer; `System` removes the
    attribute and lets `prefers-color-scheme` decide. `initTheme()` runs before the
    first render so a dark-mode admin never sees a frame of light chrome.
  - **The accent inverts and stays singular.** Near-black in light, near-white in
    dark: the same `brand` token, because a near-black accent is invisible on a
    near-black ground. Status tones are state, not accent, and are never used
    decoratively.
  - **WCAG AA, measured.** `scripts/theme-contrast-check.mjs` walks every token in
    both modes and computes the real ratio for each foreground/background pair the
    app actually uses. It found four failures on the first run and all four were
    fixed rather than waived:
      - `ink-faint` was 4.27:1 on the page ground, and it is the colour of every
        `<dt>` label in the app. Darkened to clear 4.5:1 on all three surfaces.
      - The caution status dot was 2.87:1, under the 3:1 WCAG asks of a non-text
        indicator. Darkened.
      - Input and outline-button borders measured 1.3:1. `line` and `line-strong`
        are decorative grouping hairlines and are allowed to be quiet, so a new
        `line-control` token was added at 3:1 for borders that IDENTIFY a control
        (WCAG 1.4.11), and card edges kept the light one.
      - The destructive button's red could not carry white text at 4.5:1, so
        `danger` is now its own token pair rather than the `critical` status tint.
  - **One radius scale and one type scale**, both documented in
    `tailwind.config.js`. `text-[1.55rem]` and `text-[1.75rem]` are gone.
    `scripts/copy-audit.mjs` fails on any arbitrary font size, any raw Tailwind
    palette colour, and any em-dash in user-visible text (comments are exempt, and
    it strips them properly rather than matching line prefixes).
  - **The component kit grew** so pages stop hand-rolling surfaces: `Page`, `Stack`,
    `Panel`, `Field`, `Attr`, `DataField`, `AttrGrid`, `Stat`, `Meter`, `Notice`,
    `StatusBadge`, `Checkbox`, `SkeletonList`, `ThemeToggle`. Products, Ads and
    Videos had each shipped a private copy of `Attr` and the three had already
    diverged.
  - **The nav is five collapsible groups**, not a 20-item scroll. Every `to` and
    every label is unchanged; only the grouping is new.
  - **Two latent bugs surfaced by the pass.** `ChatPatterns.tsx` carried two literal
    `0x08` backspace bytes where the copy meant to print a backslash-b, so the
    sentence explaining the POSIX word-boundary trap rendered with an empty
    `<span>` in the middle of it. And `scripts/smoke.mjs` imported Playwright from
    a path that no longer exists, so it would have thrown on its first line; that,
    its `.bg-amber-50` banner selector (now a stable `data-marker`) and its
    `../screenshots` output path are all fixed.

  ### Ads monitoring (real data, no schema change)

  A second view inside the existing `ads` section, inheriting its role gate. The
  brief asked for three figures and **two of them do not exist in this schema**,
  which `src/lib/adsAnalytics.ts` documents at length:

  - **There is no running spend and it cannot be derived.** Cosora ads are not
    auction-priced: `razorpay-create-order` charges `AD_PRICE[placement] x days x
    items` up front, a flat rupee rate. There is no CPM, no CPC and no
    per-impression cost anywhere, so `impressions x rate` would be an invented
    number. `advertisements.daily_budget` looks like a cap and is not one: it is
    written once as `prepaidTotal / days` and nothing decrements it. So the money
    figure is **revenue booked** from paid `ad_orders`, and the bars are a
    **schedule burn-down** of a campaign already paid for. Both are labelled as
    exactly that on screen.
  - **There is no conversions column**, so a "clicks with zero conversions" ratio
    cannot be computed. The flags report served-and-never-clicked and
    served-and-effectively-ignored instead, and the panel says plainly that these
    are not conversion metrics.
  - CTR of a campaign with zero impressions is `null`, not `0%`, and unmeasured
    vendors sort last rather than beside genuinely poor ones.

  ### Geography (real data, no schema change)

  MapLibre GL 5, OpenStreetMap raster tiles, no API key. Google's Heatmap Layer is
  deprecated and unavailable, so it was not an option. `vendor_profiles` has no
  coordinates, so city and state text resolves against a static gazetteer in
  `src/lib/geo.ts` in three tiers, and **the tier is reported**: exact city, state
  centroid (marked `approximate`, because a cluster in open scrub is the fallback
  and not a finding), or unplaced. Unplaced vendors are counted and listed, never
  dropped: "we could not read the address" must not look like "nobody is there".
  This is the one lazily-loaded route in the app, because maplibre is a third of
  the bundle and three of six roles cannot see the section.

  ### Five dev-seed sections

  Site content, Payments, Certificates, Discounts and Customers. All five are
  gated in `roles.ts`, routed in `App.tsx` and navigable from `Shell.tsx` now, so
  Phase 2 only has to swap the data source.

  - Each reads a store from `src/lib/devSeed/`, seeded in a development build and
    `[]` in production, following `notificationsStore.ts`'s pattern.
  - **The gate is at the declaration site, and that was load-bearing.** With the
    check only inside the shared `createDevStore`, Rollup inlined three of five
    call sites and kept the other two: the banner and discount fixtures shipped in
    the production bundle. `devSeed(SEED)` folds to `[]` at build time. Verified by
    grepping `dist/assets/*.js` for real seed strings, which is now the documented
    check after any change there.
  - Every seeded screen carries a `<DevSeedBanner>` in development so a fixture is
    never mistaken for a Cosora figure.
  - **Certificates is built on an unconfirmed decision** and says so on screen: it
    assumes a physical printed article that gets couriered. If it is a digital
    badge, the tabs collapse to issued and revoked. Gated to `super_admin` alone
    because `delivery_team` does not exist in the `admin_role_type` enum yet;
    `roles.ts` carries the note on exactly where to add it.
  - The Payments **Live strip does not animate**. There is no Realtime subscription
    in this repo and no table behind the screen, so a ticking animation would be
    theatre an admin would read as money arriving. It takes rows as a prop with no
    fetching of its own, so Phase 2 attaches a channel to its parent and the strip
    is unchanged. Its status chip says "not live yet, no subscription attached".

  ### Live Activity

  A link, not a feature. Microsoft Clarity, not PostHog, and only one: two scripts
  on the buyer site means two consent banners and two sets of numbers that
  disagree in meetings. No embed, because Clarity sends `X-Frame-Options:
  SAMEORIGIN` and sits behind a separate Microsoft login, so an iframe renders an
  empty box. No Cosora schema, no query and no tracking code in this repo.

- 2026-09-05: **Phase 0 — Video Closeups moderation. This panel could not act on
  `product_videos` at all.** New `src/pages/Videos.tsx`; `src/lib/roles.ts`,
  `src/App.tsx`, `src/components/Shell.tsx`, `src/pages/Products.tsx`, `README.md`,
  `index.html`.

  **The gap was not theoretical.** One real vendor video had been sitting in
  `under_review` since 2026-08-04 — a month — because nothing in this app queried
  `product_videos`. A vendor uploaded a clip, the trigger correctly forced it to
  `under_review`, and there was no screen anywhere that could approve or reject it. The
  moderation pipeline was complete on the database side and dead-ended in the UI.

  - **`"videos"` added to the `Section` union**, with `SECTION_READ` /`SECTION_WRITE`
    identical to `products` (`super_admin`, `product_moderator`, plus `support` read-only).
    Not a guess: `trg_product_videos_moderation` mirrors `enforce_products_moderation`
    clause for clause, so the same two roles are what the database will actually accept —
    which is the standard this file's header comment sets, since `roles.ts` is UX and the
    DB is the gate.
  - **A sibling section, not a sub-tab of Products.** Different table, its own `pvideos_*`
    RLS policies, its own trigger. Folding it into the Products page would have implied a
    shared gate that does not exist.
  - **`Videos.tsx` copies `Products.tsx`'s structure deliberately** — three tabs by status
    (`under_review` / `live` / `rejected`), a card per item, Approve / Reject, a modal with
    a required rejection reason, `assertWrote`-wrapped mutation, toast, query invalidation
    — and reuses `fetchVendorsByIds` for the vendor name/city the same way. It queries
    `product_videos` (`brand_line` as the caption, `products(name)` for the tagged product)
    and renders a thumbnail with a play affordance and in-panel playback, because a
    moderator has to actually watch the clip.
  - **Raw `.update({status, rejection_reason})`, not `approve_vendor_content()`, and the
    file says why.** Both RPCs exist and are correctly role-gated, but every other
    moderation screen here (Products, Ads, VendorDetail) writes the column directly and
    lets RLS plus the BEFORE trigger refuse it. Two conventions would be worse than one.
    The single thing the raw path does not inherit is the RPC's P0002 "only approve
    something that is `under_review`" guard — supplied here the way `Products.tsx` supplies
    it, by not rendering Approve on a row that is already live and keeping one status per
    tab.
  - **The vendor-wide button IS an RPC**, because bulk approval has no column-level
    equivalent. `approve_vendor_content_bulk(vendor_id)` returns `void` and flips **every**
    `under_review` row that vendor owns across `products`, `product_videos` **and**
    `catalogues` — so the label says so, and the mutation counts that vendor's pending
    videos either side of the call and reports what actually moved rather than claiming
    success on a no-op.
  - **No `<FlagLog />` on this screen, deliberately.** `admin_flags_entity_type_check`
    allows `('vendor','product','ad','conversation')` and **not** `'video'`. Adding one is
    a constraint migration, not a UI change.
  - **Routed** at `/videos` behind `RequireSection section="videos"`, with a "Video
    Closeups" nav entry in the Workspace group. `database.types.ts` already typed
    `product_videos` and every column used — checked, not regenerated.
  - **Verified in a real browser against the live project**, which is the whole point: the
    month-old pending video was approved and confirmed playing in the signed-out buyer feed
    (`readyState 4`, HTTP 206 range requests). Reject, the required-reason gate and the
    no-`video_url` case were exercised on a throwaway row that was then deleted.
  - **Follow-up the same day, from actually using the page.** That approved video turned
    out not to match its own listing — footage unrelated to its tagged product and category
    — and was rejected with a reason. Doing that surfaced a real bug in **both** screens:
    approving never cleared a stale `rejection_reason`, and `Products.tsx` and `Videos.tsx`
    both rendered the red rejection banner off `rejection_reason` alone, so a re-approved
    row could display as rejected while its own badge said `live`. Both now require
    `status === "rejected"` before rendering the banner (verified against a live row
    carrying a stale reason: the banner correctly does not show). The source-of-truth half
    — `approve_vendor_content` / `approve_vendor_content_bulk` nulling `rejection_reason`
    on approve — lives in textile-spark-net as
    `20260905170000_approve_vendor_content_clears_rejection_reason.sql`; it was recorded
    here as "not yet applied" because Supabase MCP was down that session. **It is applied**
    — confirmed live on 2026-09-05 in the ledger as version `20260905172020`, and both
    functions now carry `rejection_reason = null`. Note the local filename's timestamp
    (`20260905170000`) does not match the version the ledger recorded, which matters only
    if anyone ever links this project and runs `supabase db push`.
  - Also fixed while in the area: the dev server 404'd on `/favicon.ico` — there was no
    `public/` directory and no icon declared at all. Closed with an inlined
    `data:image/svg+xml;base64,…` favicon in `index.html` matching the real `<Logo>`
    monogram, so no new file was needed.
