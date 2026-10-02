# Changelog

Reverse-chronological. Newest entry at the top.

Companion to `README.md`, which describes the panel as it stands *now*; this file records
how it got there and why. The buyer/vendor app keeps its own, much longer log at
`textile-spark-net/documentation/changelog.md` — a change touching both repos gets an
entry in each, from that repo's point of view.

---

- 2026-10-02 (admin completion, Phase 11; branch `admin-completion/p11-cleanup`, not merged): **Each admin role reads only what its section needs, and the dev seed is gone.**
  - **Database** (textile-spark-net `admin_least_privilege_reads`, rehearsed, **not applied**): seven tables stop letting every admin role read every row. Vendor documents and contracts: super_admin, vendor_ops, support. Invoices and subscriptions: super_admin, finance_admin, support. Ad orders: those plus ads_moderator. Certificate orders: super_admin, finance_admin. Analytics events: super_admin. These are the roles `roles.ts` already shows each section to, so no page changes for the roles that can open it; Reports, Payments, Customers, Leads, Live Activity and Support read through definer functions and are unaffected.
  - A product moderator re-approving a rejected listing still gets the vendor's real plan cap: the cap triggers read the plan through a new definer helper, `vendor_cap_plan()`.
  - `src/lib/devSeed/store.ts` and `<DevSeedBanner>` deleted: nothing used them after Phase 10. `App.tsx` and `roles.ts` comments say so; README's role table gains the read gates, the Discounts row is real, and the dev-seed section keeps only the rule for any future fixture.
  - Regenerating `database.types.ts` waits for the pending textile-spark-net migrations (staff, P5, P6, plan changes): a regeneration now would drop their hand-added types.

- 2026-10-01 (Help & Support P4, live): **The Support section works against production.** The three
  support migrations are applied (textile-spark-net `20260930212818`, `…213143`, `…213451`), and
  `support-attachment-verify` is deployed. Rollout is Off, so the inbox is empty until a super admin
  opens it.
  - `lib/database.types.ts` regenerated from the live schema: 803 lines added, none changed. It
    replaces the hand-added function types, and adds the support tables and `csp_violations`.
  - Opened against production as demo-admin, read-only (writes aborted in the browser), at 1440 and
    390 wide: every Support page renders, and the Quick Guides language tabs switch without saving.
  - Layout fixes from that check: the hours rows in Support settings overflowed on a phone (the times
    now take their own row), and the inbox's "From" filter reads "All" instead of truncating.
  - Verified: `npm run typecheck` 0, `npm run build`.

- 2026-10-01 (Help & Support P4, review fixes): **Fixes from a review of the Support pages, before anyone has used them.**
  - Quick Guides: clicking Hindi or Gujarati saved the guide and closed the editor, because the kit's Tabs buttons were submit buttons. `Tabs` and the Modal close button are `type="button"` now, which fixes any form that holds them.
  - Replying with files: a retry after a failure reuses the files already checked and drops the one that failed, instead of uploading everything again. `uploadStaffFile` waits for a `clean` verdict, which the database now requires.
  - File links are signed for 5 minutes, so opening a photo or PDF now signs a fresh link, and audio re-signs when play starts on an old one.
  - A failed background refresh no longer replaces the request (or Support settings) with an error and loses a half-typed reply; a notice says it's showing the last version.
  - Callbacks: the date shows as booked in IST, not in the browser's time zone; a resolved callback isn't "overdue"; a callback booked for later shows "due in …" in the inbox.
  - Assign to: a request held by someone who left the support team shows their name, and "Nobody" frees it.
  - Status changes: the reason field is labelled, and the dialog keeps it when the database refuses.
  - Nav: Inbox is lit on a request page.
  - Copy: admins can test only while rollout is Staff testing; the billing topic is named as the table shows it.
  - Verified: `npm run typecheck` 0, `npm run build`.

- 2026-09-30 (Help & Support P4, branch `help-support/p4-admin-console`): **A Support section
  answers buyers' and vendors' requests. It runs on textile-spark-net's three support migrations
  (applied 2026-10-01, entry above), and rollout starts Off.**
  - **Nav:** a Support group first: Inbox (with the waiting count), Callbacks, Fraud reports,
    App feedback, Support settings. A Support-role admin lands on `/support`.
  - **`/support`** and the three boards (`pages/Support.tsx`): views (waiting on us, open,
    mine, unassigned, resolved, closed, all) with counts; filters for channel, topic, side,
    language and a search; test requests tagged, and hidden by unticking “Include test requests”; oldest waiting first; live
    updates; a notice while rollout is Off or Staff.
  - **`/support/:ticketNo`** (`pages/SupportTicket.tsx`): the thread (photos, audio, PDFs as
    downloads; "checking" and "refused" states); reply or internal note with up to 5 files;
    take, assign, resolve, reopen, close with a reason; masked phones with a logged Reveal;
    callback attempts; fraud outcomes, with the vendor's flag log; feedback reviewed; the
    requester's account (Account controls for super_admin and support, the status badge for a
    manager); what the database gathered at opening; other requests; the history. Links to
    Accounts, Vendors and Chats show only to roles that can open them.
  - **`/support/settings`** (`pages/SupportSettings.tsx`): rollout (Off, Staff testing with up
    to 20 test accounts, Everyone, with the launch checklist before Everyone), hours, holidays,
    the phone and email Help shows, topics on and off (Subscription and billing, `vendor_billing`, asks first: D-11).
    super_admin changes; the database's `can_edit` decides.
  - **`/faqs` → Quick Guides** (`components/HelpGuides.tsx`): add, edit and delete guides in
    English, Hindi and Gujarati; active; "checked against the app".
  - `roles.ts`: sections `support` (read super_admin, support, manager; write super_admin,
    support) and `support-settings` (write super_admin). The Support role's label is
    "Support", no longer "Support (read-only)".
  - Admin Log: labels for the support tables, Quick Guides, and "Revealed a phone number".
  - `lib/support.ts` holds every call; `lib/database.types.ts` has the 23 new functions,
    added by hand until the types are regenerated after the migrations are applied.
  - Verified: `npm run typecheck` 0, `npm run build`. Not opened in a browser: the functions
    don't exist yet.

- 2026-09-30: **Articles have a real author, picked from a list.** The free-text Author box,
  which defaulted to "Cosora Team", is now a dropdown of the rows in `public.authors`: Cosora
  first (the default for a new post), then Anandita Mitra (CEO), Ishani Banerjee (CMO) and
  Abhishek Mitra (CTO). The post saves `author_id` through `admin_blog_post_save`'s new
  `p_author_id`; the Journal renders the byline, the author page and the author JSON-LD from
  that row (a Person for a named person, an Organization for Cosora). The three existing posts
  are on Cosora; reassigning one is a matter of picking a name and saving.
  - `lib/blogs.ts` `useBlogAuthors` reads the table directly: every author row is public, so an
    RPC gate would add nothing. There is no screen for editing authors; the rows are seeded by
    migration (textile-spark-net `20260929221659_blog_authors`) and change the same way.
  - Admin Log labels `public.authors` changes as "Blog author".

- 2026-09-30: **Blog categories get their own search fields, and saves stop losing data.**
  - Categories: the form now edits the search title and search description, with a preview
    and counters that follow the category rules, which differ from an article's: a category's
    search title is used exactly as written with no site name added, and the description is
    clamped to 158 at a whole word, exactly as the blog clamps it (`lib/blogSeo.ts`
    `categoryRenderedTitle`, `categoryRenderedDescription`). The Description box grows to six
    rows, since it now holds the category page's body copy. These two fields were already
    saved, but only by SQL; this is what lets editors fix thin category pages themselves.
  - Articles: saving an existing post no longer erases its `og_image`. The editor never loaded
    the field and always sent null.
  - The editor preview shows entities as the page does (`&plusmn;` as ±), and the counters
    decode every entity the way the blog now does.

- 2026-09-29: **The blog's search title counter counts what the page actually shows.** It
  measured the Search title field alone, but the blog appends " · The Cosora Journal" (21
  characters) to every article title, so every count read 21 short: the GSM article's
  66-character title showed "66 of 60" while its real `<title>` was 87. `lib/blogSeo.ts` now
  mirrors the blog's title and description logic in one place, including the legacy Markdown
  body fallback that two of the three live posts still use, and the preview shows the full
  tag. Verified byte-for-byte against the live `<title>` and meta description of every
  published post. The Categories tab's Description hint no longer claims the field is the
  search description; the separate search description overrides it when set.

- 2026-09-29 (admin completion, Phase 10): **The blog is editable.** The Cosora Journal at
  www.cosora.in/blogs is written here instead of by hand in SQL.
  - `pages/Blogs.tsx` reads and writes through `lib/blogs.ts` and the `admin_blog_*` RPCs.
    Three tabs: Articles, Categories and Landing page. The migrations are in
    textile-spark-net (`20260929114553` to `20260929123402`, renamed 2026-09-30 from
    `20260929120000` to `20260929120300` to match the versions Supabase recorded).
    - Articles: create, edit, reorder, publish, unpublish, schedule and delete. An article is
      built from ordered blocks (text, heading, list, image, table, FAQ, quote, call to action,
      divider), and the block order is the order it renders in.
    - Formatting is bold, italic, underline, a link and two font-size steps, applied by a
      toolbar over a textarea with a live preview. No editor dependency was added: the stored
      format is HTML, so a richer editor can replace the toolbar later with no data migration.
      Font size is two named steps rather than a picker, so an author cannot fake a heading
      with large text and cost the page its heading structure.
    - Images upload to `site-content/blog/<uuid>.<ext>`. Alt text is required on every article
      image, enforced by the database, not just the form.
    - Search appearance: a live preview of the title, address and description as a result will
      show them, character counts against 60 and 158, tags, a canonical link and a no-index
      switch. Blank fields fall back to the title and excerpt, so a post is never published
      without meta tags.
    - Categories: add, rename, describe and delete, each with its own search title and
      description because a category page is an indexable URL. Deleting refuses while articles
      still point at it.
    - Landing page: the hero banner shown above the masthead on the blog home.
  - `ui.tsx`: `Textarea` now forwards a ref, which the formatting toolbar needs to read the
    selection. No other component changed.
  - `AdminLog.tsx` names the three blog tables. `roles.ts` adds `blogs`, mirroring
    `admin.require_content_admin()`, super_admin only.
  - `database.types.ts` regenerated (additive).
  - Verified: `npm run typecheck` 0, `npm run build` 0. `copy-audit` reports 43 issues, all of
    them pre-existing in Leads, Payments and SystemHealth; none in the new files. Against the
    live database: every `admin_blog_*` RPC returns 401 to the anon key, the reserved slugs
    `category`, `page` and `api` are refused, an image block without alt text is rejected, and
    a second FAQ block on one article is rejected.


- 2026-09-29 (admin completion, Phase 10): **Discounts is real.** The dev-seed fixture is gone.
  - `lib/discounts.ts` and `pages/Discounts.tsx` on the `admin_discount_*` RPCs (textile-spark-net
    migrations `20260929080502` and `20260929084703`): codes for a plan, an ad campaign or the Verified
    Certificate, with their state, paid uses, checkouts in progress, the discount given, and each order
    that carried a code. Create and edit check the fields first; once a code is used, its text, discount
    and target are locked, as the database requires.
  - Payments: each ledger row shows what a discount code took off, the summary counts the discounted
    rows, and search matches a code (`admin_payments_ledger` gained `discount_paise` / `discount_code`).
  - `roles.ts`: the "dev-seed, no table yet" group is empty; `content` and `discounts` comments say what
    the database enforces. `database.types.ts`: the four RPCs, the ledger's two columns and the order and
    invoice discount columns, added by hand in the generator's order (regenerated in Phase 11).
  - `devSeed/discounts.ts` deleted. `devSeed/store.ts` and `DevSeedBanner` are now unused (Phase 11).
  - Verified from a local build with a made-up super_admin session, every request answered in the
    browser: the list and its stats, a create (a bad code stopped in the form, the saved body upper-cased
    with no id and no cap), a locked edit, switch off, the uses list, and the ledger's discount line.
    Typecheck and build pass; `dist` holds none of the fixture's codes.


- 2026-09-29 (admin completion, Phase 9): **Site content is real.** The dev-seed fixture is gone.
  - `pages/Content.tsx` reads and writes through `lib/siteContent.ts` and the `admin_site_*` RPCs. The migration and the `site-config-snapshot` edge function are in textile-spark-net (`20260928195051`).
    - Vendor dashboard banners only (Mitra's call): add, edit, reorder, turn on and off, schedule and delete; an optional image uploaded when the banner is saved; a destination that must be a path on cosora.in.
    - Theme: five colours and two fonts from the database's list, with live contrast ratios; Save is blocked below the floors (4.5:1 text on white, 3:1 white on each accent). "Revert to saved" and "Cosora defaults". The preview loads the chosen fonts.
  - `AdminLog.tsx` names the two tables. `roles.ts` notes that `content` mirrors `admin.require_content_admin()`.
  - `lib/devSeed/content.ts` is deleted. README: Content is real.
  - `database.types.ts` regenerated (additive).
  - Verified: `npm run typecheck` 0, `npm run build` 0; the bundle calls `admin_site_banners`, and no fixture string is in `dist/`. A local render with every Supabase request answered in the browser: the badges, the reorder and turn-off calls, the form's refusals, and the contrast floors blocking and allowing Save. Harness `13` in textile-spark-net: 15/15, rehearsed and live.

- 2026-09-28 (admin completion, Phase 8): **Live Activity shows the buyer site now.** It used to be only a link to Microsoft Clarity.
  - `pages/LiveActivity.tsx` reads `admin_live_activity()` through `lib/liveActivity.ts`. The migration is in textile-spark-net (`20260928145827`).
    - Visitors in the last 5 minutes and over a chosen window (15 minutes to 24 hours), signed in and guest.
    - Events per minute for the last hour (a Recharts bar chart on the token colours), and events by type.
    - The most-viewed products, the busiest sellers, and searches made by at least 3 different visitors.
    - It asks again every 30 seconds and pauses in a hidden tab. A seller links to its detail page for roles that can open it.
  - The Clarity links (dashboard, recordings, heatmaps) show when `VITE_CLARITY_PROJECT_ID` is set; otherwise the page says how to connect it.
  - `roles.ts` comments for `traction` updated; the section is unchanged (every role reads, nobody writes).
  - README: the Phase-4 sections table now marks Certificates and Live Activity real.
  - `database.types.ts` regenerated (additive).
  - Verified: `npm run typecheck` 0, `npm run build` 0; the bundle calls `admin_live_activity`. A local render with every Supabase request answered in the browser: every panel for super_admin and product_moderator, the role-gated seller link, the window switch, and polling that stops in a hidden tab. Harness `12` in textile-spark-net: 13/13, rehearsed and live.

- 2026-09-28 (admin completion, Phase 7): **Leads: the RFQ pipeline.** A new read-only page.
  - `pages/Leads.tsx` at `/leads`, under Insight in the nav. It reads `admin_leads_list()`, `admin_leads_summary()` and `admin_lead_detail()` through `lib/leads.ts`. The migration is in textile-spark-net (`20260928071643`).
    - Stage chips: new, unanswered, overdue, quoted, won, closed.
    - Filters: audience (marketplace or direct), age, and a debounced search. Keyset "Load more".
    - A detail modal with the request and its quotes.
    - Figures: waiting for a first quote, overdue, the median time to a first quote and the share answered within 24 hours, over a chosen window.
  - `roles.ts`: a `leads` section, read by super_admin, vendor_ops, product_moderator and support, written by nobody.
  - `pages/Accounts.tsx` opens pre-searched from `?q=`, so a lead's buyer link lands on that account.
  - `database.types.ts` regenerated (additive).
  - Verified: `npm run typecheck` 0, `npm run build` 0; the bundle calls `admin_leads_list`. Harness `11` in textile-spark-net: 16/16, rehearsed and live.

- 2026-09-28 (admin completion, Phase 6): **Customers is real.** The dev-seed fixture is gone.
  - `pages/Customers.tsx` reads `admin_customer_list()`, `admin_customer_segment_counts()` and `admin_customer_tags()` through `lib/customers.ts`. The migration is in textile-spark-net (`20260928070410`).
    - One row per customer account (Cosora staff left out), with segment chips counted in the database.
    - Server-side search, side, tag, segment and sort, 50 rows at a time.
  - The page refreshes the database summary on open (at most once every 10 minutes, no scheduled job) and shows "Data as of HH:mm" with a Refresh button.
  - **Tags:** super_admin and support create, apply, remove and delete them (`roles.ts` `customers` write is now those two). The Admin Log names them ("Customer tag", "Customer tag on an account").
  - Phone sign-in placeholder emails show as "Phone sign-in". A suspended account is badged.
  - `lib/devSeed/customers.ts` is deleted. `database.types.ts` is regenerated (additive).
  - Verified: `npm run typecheck` 0, `npm run build` 0; the bundle calls `admin_customer_list`, and no customer fixture string is in `dist/`. Harness `10` in textile-spark-net: 21/21, rehearsed and live.

- 2026-09-28 (admin completion, Phase 5): **Payments is a real ledger.** The dev-seed fixture is gone.
  - `pages/Payments.tsx` reads `admin_payments_ledger()` and `admin_payments_summary()`, in `lib/payments.ts`. The migration is in textile-spark-net (`20260928043917`).
    - One row per money movement: subscription payments, refunds as negative rows, unfinished checkouts, and ad and certificate orders.
    - Every amount is in paise. The totals use Reports' definitions and describe exactly the filtered rows.
  - Filters, a debounced literal search and keyset paging ("Load more", 50 rows at a time) run in the database, so the page doesn't grow with the data.
  - The Latest strip asks again every 30 seconds, pauses in hidden tabs, and says when it last asked.
  - Paid rows without a Razorpay payment id (demo-mode activations) are totalled and flagged, as on Reports.
  - `lib/money.ts` holds `inrFromPaise()`. `components/ui.tsx` adds tones for `abandoned` and `review`.
  - `lib/devSeed/payments.ts` is deleted. `database.types.ts` is regenerated (additive).
  - Verified: `npm run typecheck` 0, `npm run build` 0; the bundle calls the RPCs, and none of the payments fixture strings are in `dist/`. Harness `09` in textile-spark-net: 19/19, rehearsed and live.

- 2026-09-28 (admin completion, Phase 4a): **Vendor detail reads a vendor's private fields through `admin_vendor_private()`.**
  - A vendor's PAN, owner email, phone, WhatsApp and street address became private on Mitra's decision (2026-09-27). The migrations are in textile-spark-net (`20260927184250`, `20260927185902`); Phase 4b revokes the columns once both apps are live.
  - `pages/VendorDetail.tsx` selects public columns only and merges the eight fields from `admin_vendor_private()` (super_admin, vendor_ops, support, finance_admin). A refused role sees the public fields and a note. WhatsApp is shown too.
  - `lib/database.types.ts` regenerated from the live schema: the three new functions, `vendor_profiles.has_phone` / `has_whatsapp`, and `approve_vendor_content_bulk` gone.
  - Verified: `npm run typecheck` 0, `npm run build` 0, the bundle calls `admin_vendor_private`, and no file in `src/` selects a private column.

- 2026-09-27 (admin completion, Phase 3): **Whole review actions, videos-only bulk approval, one ad-reason list, plan changes with reasons, Reports from the database.**
  - `pages/ChatReview.tsx`: Block is one call, `block_account_from_review()`. The two-request flow, and its "suspended but still pending" recovery message, are gone.
  - `pages/Videos.tsx`: "Approve all videos for vendor" uses `approve_vendor_videos_bulk()`, which returns the count; the modal says videos only. The before-and-after recount is gone.
  - `lib/adReasons.ts` (new): `useAdReasonCodes()` reads `admin_ad_reason_codes()`.
    - `components/AdReviewQueue.tsx` uses it instead of a hardcoded list, requires a note for Request changes, and labels codes in the decision history.
    - `pages/Ads.tsx`: Pause and Reject pick a code and take an optional note. The takedown reason on a card shows the label.
  - `pages/Subscriptions.tsx`:
    - The plan select and Cancel open a modal that asks for a reason and explains the effect, then call `admin_subscription_change_plan()` / `admin_subscription_cancel()`.
    - Subscriptions and invoices load 50 at a time.
    - The direct `vendor_subscriptions` UPDATE is gone.
  - `pages/Reports.tsx`:
    - One `admin_report_summary()` call instead of six whole-table reads, with a revenue window.
    - The headline is revenue net of GST, with GST shown separately.
    - A note flags income with no gateway payment id.
  - `pages/AdminLog.tsx`: shows an entry's reason, and names `subscription_plans` changes.
  - `components/AccountStatus.tsx`: your own account shows why you can't change its status (the database refuses it).
  - `lib/geo.ts`: "Delhi NCR", "NCR", "National Capital Region" and "Greater Noida".
  - `vercel.json`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
  - `lib/database.types.ts`: regenerated from the live schema (additive).
  - **The database side:** textile-spark-net migrations `20260927182120`, `…182524`, `…182703`, with harnesses `05` and `06` (see its `test.md`).
  - **Verified:** `npm run typecheck` 0, `npm run build` 0.

- 2026-09-27 (admin completion, Phases 1 and 2): **The database now enforces each admin role's writes, and System Health shows every scheduled job.**
  - **Phase 1 (database only, textile-spark-net migrations `20260927145549`, `…150304`, `…150657`, `…150904`).** Nothing in this panel changed, but these actions are now refused for roles `roles.ts` never offered them to:
    - A write policy's admin arm names its roles:
      - plans → super_admin, finance_admin;
      - quotes → super_admin;
      - videos → super_admin, product_moderator;
      - profiles delete → super_admin;
      - campaigns → review RPCs only;
      - KYC documents and buyer profiles → read-only for admins.
    - Moderators change a listing's or video's status and rejection reason only, and a rejection needs a reason in the database too.
    - Plan columns → super_admin and finance_admin; the ad badge → super_admin.
    - Nobody deletes a reviewed campaign; ad counters move only through the ad server.
    - No admin changes their own account's status, and only a super admin changes another admin's (`AccountStatus` shows the database's refusal).
    - Chat flag patterns that match ordinary messages (`.*`, `\d+`) are refused with a reason (`ChatPatterns` shows it verbatim).
    - `certificate_dispatch()` checks the role first.
    - `admin_list_admins()` → super_admin and manager, the Admins page's audience.
  - **Phase 2.** All twelve database jobs were deleted on 2026-09-26. The essential ones came back (textile-spark-net `20260927153142`), with a daily 14-day prune of job history:
    - `pages/SystemHealth.tsx`:
      - A new **Scheduled jobs** panel from `admin_cron_status()` (`20260927154047`; super_admin and vendor_ops): each job's purpose, schedule, last run (with an "overdue" flag past twice its interval), 24-hour runs and failures, and last message.
      - A warning when the embedding-health history has had no new sample for 20 minutes. A sample that stops arriving looks exactly like a healthy one that hasn't changed.
      - The health RPC is now called typed, since the generated types include it.
    - `lib/database.types.ts`: `admin_cron_status`.
  - **Verified:** `npm run typecheck` 0, `npm run build` 0. The database side was verified in textile-spark-net: harnesses `scripts/admin-completion/01`–`04` before, in the rehearsal and live; see its `test.md`.

- 2026-09-26 (scheduled jobs removed, in textile-spark-net): **Every scheduled database job was deleted, on Mitra's instruction.** Nothing in this panel changed. What those jobs kept current now changes only when someone acts: subscription expiry, ad schedules, the embedding pipeline's health history and alarm, and account-deletion processing. See textile-spark-net `documentation/ToDo.md`, "Restore the scheduled jobs".

- 2026-09-26 (managers assign teammates): **A Manager now adds, changes and removes teammates on the Admins page, in the five team roles only.** Mitra: "I'll assign the manager roles and then manager roles can assign teammates roles".
  - `roles.ts`: `TEAM_ROLES` (Product moderator, Vendor ops, Ads moderator, Finance admin, Support) and `assignableRoles()`. The `admins` section now reads and writes for `manager`.
  - `Admins.tsx`: every role picker offers what the signed-in admin may give. For a manager, super admins, other managers and their own row are read-only ("Super admin only"), with Remove disabled.
  - `admin-invite` v8: admits a manager. It refuses a non-team role, or an existing super admin, manager or self, before creating an account or sending an email. It calls `admin_grant` with the caller's token, so the database decides and the Admin Log records the grant as the caller's. `grantAdmin` is an arrow function now, which clears its two type errors.
  - The rule itself is in the database: textile-spark-net migration `20260925210601`.
  - Verified in textile-spark-net: rehearsal 28/28, live check 35/35 (`scripts/manager-team-roles-check.mjs`), specs `admins-manager` 2/2 and `admin-log` 3/3, with a mutation check. Typecheck 0, build 0.

- 2026-09-25 (My Profile flag-fix pass · MPF-26, MPF-23): **An Admin Log, for super admins and a new Manager role, and a System Health panel for analytics events that couldn't be recorded.**
  - **`pages/AdminLog.tsx`** (`/admin-log`):
    - every admin change, panel sign-in and sign-out, invite and refund, newest first;
    - who and their role, IST date and time, what (area and id), and each changed field before → after;
    - filters for admin, area, action and dates, and older entries on demand;
    - an "Admin Log" nav item under Settings.
  - **`lib/roles.ts`:** the `manager` role ("Manager") and the `admin-log` section, readable by super_admin and manager, written by nobody. A manager sees the Admin Log and the all-role Reports and Live Activity, nothing else.
  - **`Login.tsx`** and **`hooks/useAdminSession.tsx`** record sign-in and sign-out through `admin_audit_session()`, best effort.
  - **`supabase/functions/admin-invite`** (deployed v7) and **`admin-refund-payment`** (v5) record each invite and each refund attempt through `admin_audit_record()`, because they write with the service-role key. Deployed sources were compared first: invite matched HEAD, and refund differed only by two em dashes in error strings.
  - **`pages/SystemHealth.tsx`:** an "Analytics events refused" panel from `admin_engagement_event_failures()`, last 7 days.
  - **`lib/database.types.ts`:** `manager`, and the five new functions.
  - **The database does the recording** (textile-spark-net migrations `20260925173658` and `20260925174031`): a trigger on every table this panel writes, append-only.
  - **Verified:** `admin-log.spec.ts` 3/3 (super_admin, manager, product_moderator); it fails when the manager's access is removed. `npm run typecheck` 0, `npm run build` 0.

- 2026-09-24 (My Profile brief · Phase 23, Phase 9 Q2): **The FAQ page no longer says changes go live "as soon as they're saved". The site now reads FAQs from a CDN snapshot, so it says "within about a minute".**
  - `pages/Faqs.tsx`: that one sentence, and the header comment explaining why.
  - **Nothing about writing changed:** the same `admin_faq_*` RPCs. Each write now also fires `trg_faqs_snapshot` in the database, which rebuilds the three snapshot files through textile-spark-net's `faqs-snapshot` edge function (migration `20260924174051`).
  - **Measured:** the rebuilt file is at the origin 2–3 s after a save, and every visitor gets it within ~47 s.
  - **Verified:** textile-spark-net's `faqs-admin-editable.spec.ts` 1/1 against this panel (each of its 18 writes rebuilt the snapshots, all 200). `npm run typecheck` 0.

- 2026-09-24 (My Profile brief · Phase 22, Phase 9 Q3): **Support can add, edit, deactivate, reorder and delete FAQs, not just read them.**
  - `lib/roles.ts`: `SECTION_WRITE.faqs` is `["super_admin", "support"]`, matching the RPC gates.
  - `pages/Faqs.tsx`: the subtitle says support and super admin edit, and the header comment no longer says support reads only.
  - **The gate is in the database:** textile-spark-net migration `20260924170736_faqs_support_can_write.sql` (applied 2026-09-24) gives `admin_faq_add`, `_update`, `_delete` and `_reorder` the same support + super_admin predicate as `admin_faq_list`. This file only decides which buttons show.
  - **Verified:** textile-spark-net's new `tests/faqs-support-write.spec.ts`, 2/2 against this panel on :5174:
    - as support, on all three tabs: add, edit, move up and down, deactivate and delete, each call returning 200 and checked in the database;
    - as product_moderator: no FAQs nav entry, "Section not available" on `/faqs`, and 42501 from every `admin_faq_*` call;
    - with `SECTION_WRITE.faqs` put back to super_admin only, the support test fails;
    - `faqs-admin-editable.spec.ts` (super_admin) still 1/1. `npm run typecheck` 0.
  - **Until this repo is deployed,** the database allows support's writes but the live panel still shows support the read-only view.
  - **Not built:** an edit history. Nothing records who changed an FAQ after it was added, and the "Updated" column shows the creator (textile-spark-net MPF-26).

- 2026-09-24 (My Profile brief · Phase 15, MPF-5): **A deleted account shows as "deleted", not "active", and is offered no Suspend or Reinstate.** `'deleted'` (set only by `anonymize_account()` when a buyer's deletion cooling-off ends) is terminal: `set_account_status()` refuses it with 42501. Every screen here tested `=== "suspended"` and called anything else active.
  - `components/AccountStatus.tsx` exports `AccountStatusBadge`, now the one place `account_status` gets a label and a tone: active green, suspended red, deleted neutral grey, and any other value shown as itself.
  - It is used in `pages/Accounts.tsx`, the `<AccountStatus>` card and `pages/Vendors.tsx`. The Vendors list had the same bug; the brief named the other two.
  - `<AccountStatus>` for a deleted account:
    - no Suspend or Reinstate button;
    - a note that the account was deleted and anonymized, and that `set_account_status()` refuses any change;
    - no "What suspending actually stops" notice;
    - the ledger still shows.
  - The card is also on the vendor page. An Accounts row for a deleted account says "View", not "Manage".
  - `database.types.ts`: `account_status_type` gains `'deleted'`, matching the live enum.
  - Badges that appear only for suspended accounts (Ads, Products, Videos, Chats) were already right.
  - **Verified:**
    - textile-spark-net's new `tests/admin-deleted-status.spec.ts`, 2/2, against this panel. It rewrites demo accounts' status in the browser only, because no account is deleted and deletion can't be undone;
    - it fails against the previous code;
    - `profile-contact-privacy.spec.ts`'s panel test passes;
    - `npx tsc --noEmit --skipLibCheck` 0.

- 2026-09-24 (My Profile brief · deploy, MPF-19): **Live on `cosora-admin.vercel.app` (`main` `106f84c`), and the interim grant is revoked.**
  - The live bundle, `index-BzKTnSmz.js` (was `index-B920YuHP.js`), calls `admin_profile_search()` and `admin_profile_emails()` and no longer selects `email`.
  - textile-spark-net then revoked the interim signed-in grant (`20260923190354`). No client role can read `profiles.email` or `profiles.phone` now; this panel reads them only through the two admin functions.
  - **Verified against the live panel after the revoke:** textile-spark-net's `tests/profile-contact-privacy.spec.ts` found demo-buyer by email on Accounts, and the account history named the admin. The Chats search, a thread and the review queue resolved people.

- 2026-09-23 (My Profile brief · Phase 12, MPF-2): **Types only.** `database.types.ts` gains `log_call()`, now the only write path to `public.calls` (textile-spark-net migration `20260923182259`). This panel neither reads nor writes `calls`, so nothing else changes. `npx tsc --noEmit --skipLibCheck` 0.

- 2026-09-23 (My Profile brief · Phase 11, MPF-3): **Accounts, Chats, chat participants and suspension-history actors read emails through admin-gated RPCs. `profiles.email` and `profiles.phone` are no longer client-selectable, because they were readable with the public anon key.**
  - `Accounts.tsx`: the search is `admin_profile_search(term, 50)`: the name or email contains the term, or the id equals it. Searching by exact id now works here too.
  - `Chats.tsx`: the search resolves ids through `admin_profile_search(term, 500)`. Its own uuid check is gone, because the function matches ids.
  - `lib/chat.ts` `fetchParticipants()`: names and status from `profiles`, emails from `admin_profile_emails(ids)`.
  - `AccountStatus.tsx`: suspension-history actors through `admin_profile_emails()`.
  - `scripts/invite-branches-test.mjs`: finds the account through `admin_profile_search()`. Its old `.eq("email", …)` would now be refused, and because it ignored the error, it would have reported "no such account".
  - `database.types.ts`: the four new functions.
  - The functions admit any active admin: the same access every role had through the column. The migrations live in textile-spark-net: `20260923171821`, and the interim `20260923174653`.
  - **Production:** `cosora-admin.vercel.app` runs the old code, which was refused once the columns closed. The interim migration grants them back to signed-in users until this code is deployed; then textile-spark-net revokes it (MPF-19).
  - **Verified:**
    - textile-spark-net's `tests/profile-contact-privacy.spec.ts` drives this panel: Accounts finds demo-buyer by email, the account drawer's history names "Demo Admin", and the Chats search, a thread and the review queue resolve people, with every contact read returning 200.
    - `npx tsc --noEmit --skipLibCheck` 0.

- 2026-09-23 (My Profile brief · Phase 9, content): **FAQs page: the up/down arrows now step past hidden rows, and the Seller Registration tab says where its FAQs appear (`/seller`).** Andy's Seller Registration and Subscription FAQ content was loaded through this page's RPCs; see textile-spark-net's changelog.
  - **Reorder fix:**
    - A row's neighbour used to be the previous or next row in the table, hidden or not. A live FAQ could "move" past a deactivated one, and nothing changed on the live page.
    - The Subscription tab now has two deactivated rows (the answers Andy's content replaced), which is where this would have bitten.
    - Neighbours are now the previous or next row of the same visibility, within the group.
  - **Tab notes:** Seller Registration now reads "the seller landing page (/seller)…", and Subscription names `/subscription`.
  - **Verified:**
    - textile-spark-net's `tests/faqs-admin-editable.spec.ts`, whose Subscription reorder crosses those hidden rows: 5 consecutive passes after one unexplained failure.
    - `npx tsc --noEmit --skipLibCheck` 0.

- 2026-09-23 (My Profile brief · Phase 9): **New FAQs page (`/faqs`). A super_admin edits the FAQs on the buyer Help page and the vendor Subscription page, and changes go live with no deploy. It's the panel's first real (non-seed) content editor: Site content (`Content.tsx`) is still a dev-seed mock with no table.** The schema lives in textile-spark-net, in `20260923144549_faqs_admin_editable.sql` and `20260923150408_faqs_hide_created_by_from_clients.sql`, and is logged there.
  - **`src/pages/Faqs.tsx`**, built like `ChatReasons.tsx`: TanStack Query against the `admin_faq_*` RPCs, with every mutation through `assertWrote`. There's no raw table access, and clients have no write grant on `faqs`.
    - **Tabs:** one per surface with a count (Buyer Help, Subscription, Seller Registration). Each says where its rows appear, and Seller Registration says it isn't on a page yet.
    - **Add form:** Question and Answer. Buyer Help also has a required Category with suggestions from existing categories; the other surfaces are flat lists. A new row goes last on its surface.
    - **Tables:** one per category on Buyer Help, one table elsewhere. Each row has:
      - up/down arrows: a swap with the neighbour via `admin_faq_reorder`, disabled at a group's edges;
      - Edit, in a modal;
      - Deactivate/Reactivate: hidden from the apps, kept here;
      - Delete, with a confirm.
    - **Updated column:** the date and who created the row ("seeded" for the 17 migrated rows).
  - **`roles.ts`:** new section `faqs`.
    - SECTION_READ is super_admin + support, matching `admin_faq_list()`'s gate.
    - SECTION_WRITE is super_admin, matching the four write RPCs. Whether support should write is an open question for Andy. Widening it means changing the RPC gates and this line together.
    - Support gets the page with the standard read-only banner and disabled controls.
  - **`App.tsx`:** route `/faqs` behind `RequireSection section="faqs"`, and `faqs` added to the Landing order after `chat-reasons`.
  - **`Shell.tsx`:** an "FAQs" item (CircleHelp) in the Settings group, after Block reasons.
  - **`src/lib/database.types.ts`:** the `faqs` table and the five `admin_faq_*` functions.
  - **Verified:**
    - textile-spark-net's `tests/faqs-admin-editable.spec.ts` drives this page as demo-admin (super_admin) on :5174. It adds, edits, reorders, deactivates and deletes on all three tabs, and checks that the buyer and vendor pages follow: 1/1, twice.
    - `npx tsc --noEmit --skipLibCheck` 0.
    - **Not exercised with a support login,** because none was available. The read-only view follows from `canWrite`, and the database gate (42501 for non-admins) is proven.
  - README: a new "FAQs" section and a status row.

- 2026-09-22 (Admin-schema separation · Phase 5c, IRREVERSIBLE): **`profiles.is_admin` / `profiles.admin_role` were dropped (textile-spark-net migration `20260922180000`, mirrored here byte-for-byte; live `20260922171801`). The panel needed no code change: production already used `admin_whoami` and the admin_* RPCs.**
  - `src/lib/database.types.ts` regenerated: −6 lines (the profiles fields). Typecheck 0; the probe fires 1.
  - **Verified live on `cosora-admin.vercel.app` after the drop, 16/16:** sign-in and identity via `rpc/admin_whoami`, roster, self-edit guard, search, promote, role change, demote, invite. No request named the dropped columns. A non-admin sees "Not an admin account".
  - admin-invite and admin-refund-payment: a non-admin gets 403, a super_admin passes.
  - The repointed harnesses give the same results as the Phase-A baseline: rls-matrix 60/60, rls-superadmin 11/11, chat-pipeline 72/72, invite-tests 9/9. The committed seed and cleanup scripts ran clean after the drop.
  - README sign-in and authorization notes now name `admin.admin_users`.

- 2026-09-22 (Admin-schema separation · pre-5c tooling): **The test and seed scripts now create, change and check admins through `admin.admin_users` instead of `profiles.is_admin` / `profiles.admin_role`, so the role-matrix harness keeps working after the Phase 5c column drop. The role matrix was re-proved unchanged against live while the columns still exist.**
  - **Repointed (7 scripts).**
    - `seed-test-admins.sql` keeps the profiles `email` write; the grant becomes an `admin.admin_users` upsert, plus `admin.shadow_admin_columns()`, so the legacy columns agree until 5c (a no-op after it).
    - `drop-test-admins.sql` deletes the admin_users rows explicitly. Its tally reports `prof_leftover`, `au_leftover` and `real_admins` from admin_users.
    - `invite-tests-cleanup.sql` un-promotes the demo users through admin_users + the shadow helper.
    - In `rls-matrix.mjs`, the escalation cell is now `admin_set_role(self, super_admin)`.
    - In `rls-superadmin.mjs`, role change, demote and promote-back use `admin_set_role`, `admin_revoke` and `admin_grant`.
    - In `chat-pipeline-matrix.mjs`, T7.6c self-grant goes through `admin_set_role`.
    - `invite-branches-test.mjs` reads admin state via `admin_list_admins`.
  - **Proof, against live, with the columns present.** The fixtures were seeded with the repointed seed. The pre-repoint (committed) and repointed harnesses were each run on the same fixtures and compared cell by cell:

    | Harness | Result | Cells differing |
    |---|---|---|
    | rls-matrix | 60/60 → 60/60 | 0 |
    | rls-superadmin | 11/11 → 11/11 | 0 |
    | chat-pipeline-matrix | 72/72 → 72/72 | 0 (identical per case) |
    | invite-tests | 9/9 | – |
    | chat-moderation-behaviour | all passed | – |
    | chat-moderation-matrix | all passed | – |

    The five escalation cells are still refused with 42501, now by the RPC instead of the trigger.
  - **Not run live, on purpose:** `invite-branches-test.mjs` and `invite-send-test.mjs`. They send real emails and create real auth users at the owner's inbox, and the branch test's `haspw` / `+cosora-otp` fixtures are seeded by nothing, so every branch would fall through to "new user". Both are repointed and syntax-checked only.
  - **Two teardown gaps found and fixed (pre-existing).**
    - `drop-chat-fixtures.sql` missed chat-pipeline's `chatfx-… support note` flags, which are written on a fixture conversation whose id is not `cf`-prefixed. They blocked `drop-test-admins.sql` through an FK.
    - `invite-tests-cleanup.sql` now says to run `drop-test-admins.sql` first. The matrix's flags reference the rlstest accounts, so running it first rolled the whole script back.
  - **Cleanup verified.**
    - 0 rlstest / chatfx / +cosora users; 0 leftover profiles; 0 admin_users test rows.
    - Admins are 3 = 3 with 0/0/0 drift, which is the 5c pre-flight.
    - Moderation data is back to baseline (patterns 3, reasons 7, reviews 1, suspensions 0, flags 1, notifications 42, demo thread 4 messages).
  - The seed was run with a locally computed bcrypt hash in place of `crypt(<plaintext>)`, so the fixture password never went through a tool call or SQL logs. The committed files are unchanged in that respect.

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
