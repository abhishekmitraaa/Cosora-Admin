# Cosora Admin

Internal admin panel for Cosora. Reads and writes the **same Supabase project as
`textile-spark-net`** — same database, same RLS.

This repo is a **UI layer**. It is not the access control. Every role gate that
matters is enforced by Postgres (RLS policies + `BEFORE` triggers) from
`textile-spark-net`'s `20260717130000` / `20260717130100` migrations. Hiding a
nav item here is a convenience so nobody is offered an action that will fail; it
stops nothing on its own.

---

## Running locally

```bash
npm install
cp .env.example .env     # fill in the two values below
npm run dev              # http://localhost:5174
```

### Environment variables

| Var | What |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL — the **same project** as textile-spark-net |
| `VITE_SUPABASE_ANON_KEY` | The project's anon/publishable key |

Anon key only, by design. There is no service-role key in this app: every request
carries the signed-in admin's JWT so RLS applies. The only privileged code is the
`admin-refund-payment` edge function, which runs server-side.

Sign in with an account that has an active row in `admin.admin_users` (grant it from the Admins
page or `admin-invite`, or directly as postgres). Its `admin_role` then decides which sections
render. Since admin-schema separation Phase 5c (2026-09-22) `profiles` has no admin columns.

```bash
npm run typecheck   # tsc --noEmit --skipLibCheck
npm run build
```

---

## How authorization actually works

Three layers, only the last two of which are real:

1. **`src/lib/roles.ts`** — decides which nav items and buttons render. **UX only.**
2. **RLS policies** — decide *which admin may write a row at all*.
3. **`BEFORE` triggers** — decide *which column may change* (`products.status`,
   `vendor_profiles.is_verified` / `account_status`, `advertisements.status`, and the
   moderation reason columns). Admin grants and roles are not a column any more. They live in
   `admin.admin_users`, and only the super_admin/service-role RPCs `admin_grant` / `admin_set_role` /
   `admin_revoke` change them.
   RLS cannot see "which column changed", so column gates are triggers.

### The one non-obvious thing: RLS denials are silent

An RLS policy **does not raise an error on UPDATE**. A row whose `USING` clause
fails is simply invisible, so the statement matches **zero rows** and PostgREST
returns success with no error. Only the triggers raise `42501` explicitly.

So `if (error) fail()` is **not** sufficient — without more, a blocked write
returns no error and the UI would report success while the database changed
nothing. Every mutation here therefore appends `.select()` and routes the result
through `assertWrote()` in `src/lib/supabase.ts`, which treats *zero rows* as a
denial. Keep that pattern for any new write. (INSERTs are fine either way: a
`WITH CHECK` violation does raise.)

| Role | Products | Videos | Vendors | Ads | Subscriptions | Reports | Admins |
|---|---|---|---|---|---|---|---|
| `super_admin` | write | write | write | write | write | read | **write** |
| `product_moderator` | write | write | – | – | – | read | – |
| `vendor_ops` | – | – | write | – | – | read | – |
| `ads_moderator` | – | – | – | write | – | read | – |
| `finance_admin` | – | – | – | – | write | read | – |
| `support` | read | read | read | read | read | read | – |

`support` can additionally write the flagged-items log (`admin_flags`).

The Phase-4 sections sit alongside these, and the difference in what is behind
them matters. `geography` reads the same `vendor_profiles` rows the Vendors table
lists, so its gate mirrors that one exactly and the database is already enforcing
it. The five dev-seed sections have no table yet, so `roles.ts` is UX in a
stronger sense there than anywhere else in this file: **there is nothing behind
those gates enforcing anything.** See "Phase-4 sections" below.

| Role | Geography | Content | Payments | Certificates | Discounts | Customers | Live Activity |
|---|---|---|---|---|---|---|---|
| `super_admin` | read | **write** | **write** | **write** | **write** | read | read |
| `product_moderator` | – | – | – | – | – | – | read |
| `vendor_ops` | read | – | – | – | – | – | read |
| `ads_moderator` | – | – | – | – | – | – | read |
| `finance_admin` | – | – | **write** | – | **write** | read | read |
| `support` | read | – | read | – | – | read | read |

Ads → Monitoring is not a section: it is a second view inside `ads` and inherits
that gate unchanged. `certificates` should also be readable and writable by
`delivery_team`; that role does not exist in the `admin_role_type` enum yet, and
`roles.ts` says where to add it.

**Videos** (Video Closeups) is a sibling of Products, not a sub-tab: a different table
(`product_videos`) with its own RLS policies and its own BEFORE trigger
(`trg_product_videos_moderation`, which mirrors `enforce_products_moderation` clause for
clause). The two roles are identical because the same people moderate both. Note the one
thing the flagged-items log does **not** cover: `admin_flags_entity_type_check` allows
`('vendor','product','ad','conversation')` and **not `'video'`**, so the Videos screen has
no `<FlagLog />`. Adding one is a constraint migration, not a UI change.

### Chat moderation (Phase 3)

These are the sections where `support` is **not** read-only — reviewing chats is
the support role's job, so the database grants it writes here that it has
nowhere else. Every other role sees none of them.

| Role | Chats | Review queue | Keyword blocklist | Flag patterns | Block reasons | Accounts |
|---|---|---|---|---|---|---|
| `super_admin` | read | write | write | write | **write** | write |
| `support` | read | write | write | write | **read** | write |
| everyone else | – | – | – | – | – | – |

`chat_block_reasons` is the one split table: support **reads** it — it has to,
the reason picker is populated from it — but only a `super_admin` adds, edits or
deactivates an entry. `chat_block_reasons_select` grants
`admin_role() in ('support','super_admin')`; only insert/update/delete are
`super_admin`-only.

(`roles.ts` previously hid the Block reasons page from `support` entirely, on
the stated but incorrect grounds that support "may not even READ" the table.
Corrected — the page renders read-only for support instead.)

**Accounts** is suspension generalised off the vendor screen. Buyers get
suspended too, and `profiles.account_status` is one flag for both roles, so an
account with no chat history and no vendor profile used to be unreachable. All
three entry points — the Accounts page, the vendor screen, and the review
queue's block action — call the same `set_account_status()`; only `source`
and `conversation_review_id` differ.

**There is exactly one `account_status`, and it is on `profiles`:**

| Column | Written by | Gated to | Audited |
|---|---|---|---|
| `profiles.account_status` | `set_account_status()` RPC only — a direct UPDATE is rejected by a BEFORE trigger | `super_admin`, `support` | yes, `account_suspensions` |

There *used* to be a second one, `vendor_profiles.account_status`, written by a
plain UPDATE and gated to `vendor_ops`. **It was DROPPED** by textile-spark-net's
migration `20260801095820`, which moved suspension to `profiles`: the same human
toggles between buyer and vendor, so a flag on the vendor row cannot stop them
messaging as a buyer.

This panel kept selecting and updating the dropped column for some time
afterwards. A PostgREST select naming a column that does not exist is a hard 400,
not a null — so Vendors, VendorDetail, **and** Products and Ads (both of which
resolve vendor badges through `lib/vendors.ts`, in the same `queryFn` as their
own list) failed to load outright. `lib/accounts.ts` is now the single reader,
and `vendor_profiles` has one admin field left: `is_verified`.

---

## Phase-4 sections

Eight additions. Two read real rows, five render a development-only fixture, and
one is a link to somebody else's product.

| Section | Data | `SECTION_READ` | `SECTION_WRITE` |
|---|---|---|---|
| Ads → Monitoring | **real** | *(inherits `ads`)* | *(inherits `ads`)* |
| `geography` | **real** | `super_admin`, `vendor_ops`, `support` | none |
| `content` | dev-seed | `super_admin` | `super_admin` |
| `payments` | dev-seed | `super_admin`, `finance_admin`, `support` | `super_admin`, `finance_admin` |
| `certificates` | dev-seed | `super_admin` *(see below)* | `super_admin` *(see below)* |
| `discounts` | dev-seed | `super_admin`, `finance_admin` | `super_admin`, `finance_admin` |
| `customers` | dev-seed | `super_admin`, `support`, `finance_admin` | none |
| `traction` | external link | all roles | none |

**Read the gates on the dev-seed rows differently from the rest of this file.**
`roles.ts` is UX everywhere, and the database is the real gate — but for those
five sections there is no database behind them yet, so there is nothing enforcing
anything. Do not read a gate there as evidence a write is protected. Phase 2
creates the tables and their RLS at the same time.

### Ads monitoring: what this schema can and cannot tell you

`src/lib/adsAnalytics.ts` carries the long version. Two of the three figures the
brief asked for do not exist:

- **There is no running spend, and it cannot be derived from delivery.** Cosora
  ads are not auction-priced. `razorpay-create-order` charges
  `AD_PRICE[placement] × days × items` up front, a flat rupee rate per placement
  per day. There is no CPM, no CPC and no per-impression cost anywhere in the
  codebase, so `impressions × rate` is not a spend figure, it is a made-up one.
  An impression costs the vendor nothing: they already paid for the slot.

  `advertisements.daily_budget` **looks like a cap and is not one.** It is
  written once by `razorpay-verify-payment` as `prepaidTotal / days`, a *display*
  figure derived from money that already moved. Nothing decrements it, no trigger
  checks it, and delivery does not stop when it is "used up" — `active_ads`
  filters on status alone.

  So "booked today" on that screen is **revenue** from paid `ad_orders`
  (remember: `ad_orders.amount` is **paise**), and the bars are a **schedule
  burn-down** of a prepaid campaign. Both are labelled as exactly that on screen,
  with the reason stated above the fold.

- **There is no conversions column.** `advertisements` has `impressions` and
  `clicks` and nothing else, and no table links a campaign to an RFQ, a quote or
  an order. A "clicks with zero conversions" ratio is not computable. The flags
  report served-and-never-clicked and served-and-effectively-ignored instead, and
  the panel says plainly that those are not conversion metrics.

- **`ad_orders` cannot be joined to `advertisements`.** The order carries a
  `spec` JSON; the rows it produced carry no order id. Revenue is therefore
  reported at platform level only, never per campaign.

CTR of a campaign with zero impressions is `null`, not `0%` — a campaign never
served and a campaign served ten thousand times and ignored are opposite
problems, and unmeasured vendors sort *last* rather than beside genuinely poor
ones.

### Geography: how a vendor gets a coordinate

MapLibre GL 5 with OpenStreetMap raster tiles and no API key. (Google's Maps
JavaScript Heatmap Layer is deprecated and unavailable, so it was not an option
regardless of preference. Set `VITE_MAP_STYLE_URL` to use a keyed vector style
instead; nothing else changes.)

`vendor_profiles` stores `city` and `state` as free text and has no latitude,
longitude or PIN centroid, and there is no geocoder wired into this project. So
`src/lib/geo.ts` resolves the text against a static gazetteer of India's textile
clusters and metros, in three tiers, **and the tier is reported**:

| Tier | Meaning |
|---|---|
| `city` | The city matched. The point is where the city is. |
| `state` | Only the state matched, so the vendor sits on the **state centroid**. Marked `approximate` on screen: a cluster in open scrub is this fallback, not a finding. |
| unplaced | Neither matched. Counted and listed by name, **never dropped** — "we could not read the address" must not look like "nobody is there". |

Adding a missing town is two lines in `geo.ts`. The unplaced table is the signal
for which.

This is the only lazily-loaded route in the app: maplibre is roughly a third of
the JavaScript and three of six roles cannot see the section.

### Dev-seed data: the rule and the trap

Following `textile-spark-net/src/lib/notificationsStore.ts` and the project's
"no mock data in production" rule, each store in `src/lib/devSeed/` is seeded in
a development build and `[]` in a production one, and every seeded screen carries
a `<DevSeedBanner>` so nothing is mistaken for a real Cosora figure.

**The gate must be at the declaration site.** With the check only inside the
shared `createDevStore`, Rollup inlined three of the five call sites and kept the
other two, and the banner and discount fixtures shipped in the production bundle.
`devSeed(SEED)` folds to `[]` at build time and the array beside it is dropped.
After any change there:

```bash
npm run build
grep -c "TIRUPPUR500\|banner-seed-1\|txn-seed-01\|cert-seed-01\|cust-seed-01" dist/assets/*.js   # must be 0
```

### Certificates is built on an unconfirmed decision

⚠ **Pending Andy's confirmation.** The screen assumes the verification
certificate is a *physical printed article that gets couriered*: the print step,
the courier, the tracking number, the delivery address and the returned tab all
follow from that. If it is a digital badge, the tabs collapse to issued/revoked
and most of the screen comes out. Said on the screen itself, not just here.

What exists today is only the purchase: `verifiedCertificate` is a real ₹199 ad
placement and buying it grants a time-bound seal via `ad_verified_until`. No
certificate row, status, address snapshot or tracking number is modelled
anywhere.

**`delivery_team` does not exist in the `admin_role_type` enum**, so the section
is gated to `super_admin` alone. Naming a role nobody can hold would be worse
than the narrow gate. `roles.ts` carries the note on exactly where to add it in
both maps once Phase 2 creates it.

### Payments: the Live strip does not animate

There is no Realtime subscription anywhere in this repo and no table behind the
screen, so a ticking animation would be theatre an admin would reasonably read as
money arriving right now. The strip renders the most recent rows once, and its
status chip says "not live yet, no subscription attached".

It takes its rows as a prop and does no fetching of its own, so Phase 2 attaches
a Supabase Realtime channel to its **parent** and the component is unchanged.

`reports` keeps its KPI view untouched. The ledger is seeded rather than derived
from `subscription_invoices` + `ad_orders` because those are two tables with two
currency units (rupees vs paise) and two status vocabularies; deriving it
client-side would mean this screen silently disagreeing with Reports the first
time either changed. Phase 2 wants one `transactions` table in **one** unit.

### Live Activity is a link, not a feature

Microsoft Clarity, and only one analytics tool: two scripts on the buyer site
means two consent banners, two sets of numbers that disagree in meetings, and
twice the page weight on the mobile connections this marketplace actually runs
on. Clarity over PostHog because it is free with no event cap (a video feed
generates a lot of events) and session recordings are the core product, which is
what "where in the RFQ form do vendors give up" actually needs. PostHog is the
better answer if the need turns out to be funnels and cohorts; switching is one
URL plus the snippet on the buyer site.

**No iframe.** Clarity sends `X-Frame-Options: SAMEORIGIN` and sits behind a
separate Microsoft login, so an embed renders an empty box or a sign-in screen —
worse than an honest link. There is no visitor tracking, no new table and no
query in this repo for it.

Set `VITE_CLARITY_PROJECT_ID` here and add the Clarity snippet to
textile-spark-net's `index.html`. Until both are done the page says so and the
links go to the Clarity project list.

---

## The design system

One token set, two modes, and no page defines a colour.

`src/index.css` holds every colour as a CSS variable containing an `R G B`
triplet; `tailwind.config.js` reads them through
`rgb(var(--token) / <alpha-value>)` so `bg-surface/70` still works. Dark mode is
that same set redefined once, under both `[data-theme="dark"]` and
`prefers-color-scheme`, so no component carries a `dark:` variant and the two
modes cannot drift apart.

Before this, half the screens wrote `text-slate-600` and the other half wrote
`text-ink-muted`. That is the whole reason the app could not have a dark mode,
and `scripts/copy-audit.mjs` now fails on any raw Tailwind palette colour.

### The rules

| Lock | Rule |
|---|---|
| **One accent** | Near-black in light, near-white in dark. The same `brand` token: a near-black accent is invisible on a near-black ground. Status tones are *state*, never accent, and never decoration. |
| **One radius scale** | 4 dots / 6 badges / 8 controls / 12 containers / 16 overlays. Documented in `tailwind.config.js`. No pill buttons. |
| **One type scale** | 11 / 12 / 14 / 15 / 16 / 24 / 28, named `2xs`, `xs`, `sm`, `section`, `base`, `title`, `metric`. Arbitrary sizes fail the copy audit. |
| **No pure black or white** | `#fcfcfd` and `#0e0e11` are the extremes. Pure values flatten depth. |
| **WCAG AA everywhere** | Measured, not claimed. See below. |

### Theme control

Light / Dark / **System**, in the rail footer. Three states, not two: an admin
who has never touched it follows their OS, and one who explicitly picked Light
keeps Light on a machine that goes dark at 18:00. "System" *removes* the
attribute rather than setting one, so the media query decides and no listener is
needed. `initTheme()` runs in `main.tsx` before React renders, so a dark-mode
admin never sees a frame of light chrome.

Recharts and MapLibre take colours as strings and cannot read a class, so they
call `tokenColor()` (`src/lib/theme.ts`), which reads the live computed value of
the same variable. That is deliberate: hardcoding a second palette for charts is
exactly how the light and dark modes drift apart.

### Contrast is measured

```bash
npm run build && npx vite preview --port 4174
node scripts/theme-contrast-check.mjs   # 91 checks, both modes
```

It walks every token in both modes (failing on any the dark block forgot, which
otherwise silently inherits the light value), then computes the real ratio for
every foreground/background pair the app actually uses. It found four genuine
failures on its first run, all fixed rather than waived:

- `ink-faint` was **4.27:1** on the page ground, and it is the colour of every
  `<dt>` label in the app.
- The caution status dot was **2.87:1**, under the 3:1 WCAG asks of a non-text
  indicator.
- Input and outline-button borders were **1.3:1**. `line` / `line-strong` are
  decorative grouping hairlines and are allowed to be quiet, so `line-control`
  was added at 3:1 for borders that *identify* a control (WCAG 1.4.11); card
  edges kept the light one.
- The destructive button's red could not carry white text at 4.5:1, so `danger`
  is its own token pair rather than the `critical` status tint.

`ink-ghost` is the one sub-AA token and is reserved for disabled controls and
"not set" fallbacks. It is never used for text carrying meaning.

### Copy and token audit

```bash
node scripts/copy-audit.mjs
```

Fails on an em-dash or en-dash in user-visible text, a raw Tailwind palette
colour, or an arbitrary font size. It strips comments properly first, so the
reasoning this codebase is written around can use whatever punctuation it likes.

### The component kit

`src/components/ui.tsx` is the only place a surface is defined. If a page needs
a colour the tokens do not cover, the token set is what is missing.

`Page` `Stack` `Panel` `Card` `Field` `Input` `Select` `Textarea` `Checkbox`
`Button` `Badge` `StatusBadge` `Notice` `Note` `ReadOnlyBanner` `DevSeedBanner`
`Empty` `SkeletonList` `Modal` `Table` `Tabs` `Attr` `AttrGrid` `DataField`
`Stat` `Meter` `PageHeader` `SubHeading` `ThemeToggle` `Logo` `AuthLayout`

`StatusBadge` maps every status string this app renders to one tone, so "paid"
is the same green on the invoice table and the payments ledger. Products, Ads
and Videos each used to ship a private `Attr` and the three had already
diverged.

### Navigation

Five collapsible groups (Moderation, People, Commerce, Insight, Settings)
rather than a twenty-item scroll. **Every route and every label is unchanged** -
only the grouping is new. The group holding the current route is always
expanded; the rest remember their state in `localStorage`. A group whose items
are all hidden by role renders nothing, heading included.

---

## Verifying the gates

Two scripts drive the **real database with real logins** (anon key + password, so
PostgREST runs as `authenticated`, exactly what the triggers check).

```bash
# 0. Credentials come from .env (names in .env.example): FIXTURE_PASSWORD for
#    the rlstest-*/chatfx-* logins, DEMO_*_PASSWORD for the demo accounts.
#    No password is in any file here (2026-09-11).
# 1. Seed throwaway accounts + isolated fixtures (SQL editor / service role).
#    Put this line first, in the same run, with FIXTURE_PASSWORD from .env —
#    the seed refuses to create anything without it:
#      select set_config('cosora.fixture_password', '<FIXTURE_PASSWORD>', false);
#    Paste the printed ids into the F = {...} block of both scripts.
scripts/seed-test-admins.sql

# 2. Every role attempts every write; only its own may land.
node scripts/rls-matrix.mjs        # 60 cases

# 3. The ALLOW side — super_admin can do everything, incl. role grants.
node scripts/rls-superadmin.mjs    # 10 cases

# 3b. Chat moderation, WHO: reads, writes and both RPCs across all six roles.
#     Headline case — support is refused WRITING chat_block_reasons while being
#     allowed everywhere else (it may READ that table; roles.ts used to say
#     otherwise). Non-destructive (throwaway rows, nonexistent ids).
node scripts/chat-moderation-matrix.mjs

# 3c. Chat moderation, WHAT: does the pipeline do what it claims. 16 cases.
#     Blocklist rejects with no row and nothing queued; a flag pattern keeps the
#     message, locks the thread and queues exactly one review; a participant
#     cannot unlock; nobody — owner or admin — can UPDATE account_status
#     directly; an invalid regex is refused, and a  regex is shown to compile
#     while never matching; submit_report stores reported_reason verbatim and
#     leaves reason_id null; kept_locked ignores p_resume, resumed honours it.
#     Needs no seeded admins — it uses the three demo accounts.
node scripts/chat-moderation-behaviour.mjs

# 3d. The regression guard for the vendor_profiles.account_status removal.
#     Read-only, no login needed. Run this first if Vendors, VendorDetail,
#     Products or Ads fail to load.
node scripts/vendor-columns-check.mjs

# 4. Browser smoke: nav + read-only banner + disabled actions per role.
npm run build && npx vite preview --port 4174
node scripts/smoke.mjs

# 4b. The design system. Needs the preview server from step 4 up.
#     Walks every token in BOTH modes (a token the dark block forgot does not
#     throw, it silently inherits the light value) and computes the real WCAG
#     ratio for every fg/bg pair the app uses. 91 checks.
node scripts/theme-contrast-check.mjs

# 4c. Source-level copy audit. No server needed. Fails on an em-dash in
#     user-visible text, a raw Tailwind palette colour, or an arbitrary font
#     size. Strips comments first, so the reasoning in this codebase is exempt.
node scripts/copy-audit.mjs

# 5. ALWAYS clean up — these are admin logins with a known password.
scripts/drop-test-admins.sql
```

Both suites passed at time of writing; the fixtures and accounts were removed
afterwards, so the scripts need step 1 again before they'll run.

---

## Migrations added by this repo

Applied to the shared project (`supabase/migrations/`):

| Migration | What |
|---|---|
| `20260717140000_admin_panel_schema` | `products.rejection_reason`; `advertisements.moderation_reason/_at/_by`; refund columns on `subscription_invoices`; the `admin_flags` table + RLS |
| `20260717140100_role_gate_moderation_reasons` | Extends the Prompt-1 triggers so the *reason* columns are role-gated too (a vendor could otherwise stamp a fake `rejection_reason` on their own product) |
| `20260717140200_ads_rejected_status` | Adds `'rejected'` to `advertisements_status_check` (it allowed only draft/active/paused/ended) |
| `20260717150000_admin_role_values_rpc` | `admin_role_values()` — the real enum labels, so `admin-invite` validates a role against the live enum instead of a hardcoded copy that could drift |
| `20260717160000_user_has_password_rpc` | `user_has_password(email)` — service-role-only `SECURITY DEFINER` check of `auth.users.encrypted_password`, so `admin-invite` can branch on whether an existing (OTP-only) account actually has a password |
| `20260802120000_resolve_conversation_review_rpc` | `resolve_conversation_review(p_review_id, p_resolution, p_reason_id)` — see below |

`vendor_profiles.account_status` was added by Prompt 1 and **dropped again** by
textile-spark-net's `20260801095820`. Nothing in this panel may reference it.

### Why `resolve_conversation_review()` had to exist

Everything else Phase 3 needs was already in the database (Phases 1/2 in
`textile-spark-net`: `conversations.status`, `conversation_reviews`,
`keyword_blocklist`, `flag_patterns`, `chat_block_reasons`,
`account_suspensions`, `profiles.account_status`, `set_account_status()`).
Closing a review was the one gap.

`conversations.status` has **no admin-write RLS policy**. Phase 1 added a BEFORE
trigger that *allows* an admin to change it, but a trigger cannot grant
visibility — RLS decides which rows an UPDATE can match at all, and no policy
lets an admin match a conversation they are not a participant of. A client-side
`update conversations set status='active'` therefore matches **zero rows and
returns success**, and the UI would report a resumed chat that is still locked.
(The same silent-denial trap `assertWrote()` exists for.)

Resolving a review is also two writes that must not half-apply — the review row,
and for `resumed` the conversation row. So: one `SECURITY DEFINER` function,
authorization checked inside it against the same `support`/`super_admin`
predicate `set_account_status()` uses, and **every** failure path raises. Callers
can rely on `if (error) throw` alone for this one, unlike table UPDATEs.

---

## Money: units are not uniform

Verified against the edge functions that write these rows. Getting this wrong is
silent and expensive:

- `subscription_invoices.amount` — **rupees, excluding GST** (`gst_amount` is separate).
  The gateway captured `(amount + gst_amount) * 100` paise, so a refund of
  `amount * 100` would short the vendor the GST.
- `ad_orders.amount` — **paise** (`razorpay-create-order` does `rupees * 100`).
  Summing it beside invoice amounts without dividing by 100 overstates ad revenue 100×.

---

## Status per part

| Part | Status |
|---|---|
| 1 — Bootstrap, auth, role-gated shell | **Working**, verified in-browser across 3 roles |
| 2 — Admin & role management | **Working**; grant/change/demote verified allowed for `super_admin`, refused (trigger `42501`) for all others |
| 2b — Invite admin by email | **Working, all three branches verified (14/14): new-user invite, existing-OTP-only (grant + recovery email — the branch that matters, real `mail.send` confirmed), and existing-with-password (silent promote). `/reset-password` link-landing proven end-to-end. Email throttled by Supabase's built-in mailer (custom SMTP needed for volume); the amber warning surfaces a failed send honestly. Redirect-URL allow-listing is a dashboard step you must do.** |
| 3 — Product moderation queue | **Working**; approve/reject + required reason, live/rejected tabs |
| 3b — Video Closeups moderation queue | **Working**, and it was the blocking gap: one real vendor video had sat `under_review` since 2026-08-04 because nothing in this panel could act on `product_videos`. `/videos`, same three tabs, in-panel playback (a moderator has to watch the clip), per-item approve/reject with a required reason, and a vendor-wide "Approve all pending" wired to `approve_vendor_content_bulk`. Verified in a real browser against the live project: approved the real pending video and confirmed it plays in the signed-out buyer feed (`readyState 4`, HTTP 206). Reject, the required-reason gate and the no-`video_url` case were exercised on a throwaway row that was then deleted. **2026-09-05 follow-up:** that approved video turned out not to match its own listing (footage unrelated to its tagged product/category) and was rejected with a reason via `reject_vendor_content`. Separately, approving never cleared a stale `rejection_reason` left by a prior rejection — `Products.tsx` and `Videos.tsx` both rendered the red rejection banner off `rejection_reason` alone, so a re-approved row could show as rejected while its badge said live. Both now also require `status === "rejected"` before rendering the banner (verified against a live row carrying a stale reason: banner correctly does not show). The source-of-truth fix — `approve_vendor_content`/`approve_vendor_content_bulk` clearing `rejection_reason` on approve — is applied: textile-spark-net's `20260905170000_approve_vendor_content_clears_rejection_reason.sql`, live as ledger version `20260905172020` (confirmed by reading `pg_get_functiondef` off the database: both `approve_vendor_content` and `approve_vendor_content_bulk` now set `rejection_reason = null`). An earlier revision of this line said "not yet applied" because Supabase MCP was down that session. Also fixed while in this area: the dev server 404'd on `/favicon.ico` — there was no `public/` dir and no icon declared at all — closed with an inlined `data:image/svg+xml;base64,...` favicon in `index.html` matching the real `<Logo>` monogram, no new file needed. |
| 4 — Vendor accounts & verification | **Working.** Verification writes `vendor_profiles.is_verified`. Suspension is account-level (`profiles.account_status` via `set_account_status()`) and is **really enforced for chat and calling** — not yet for RFQs, quotes, listings or ads. See below. |
| 5 — Ads post-publish takedown | **Working**; needs a small cosmetic follow-up in textile-spark-net (below) |
| 6 — Subscriptions & billing | **Plan change / cancel working. Refunds cannot execute on this project — Razorpay keys are not set.** |
| 7 — Reporting + flagged-items log | **Working**, from real rows |
| Phase 3 — Chat moderation (7 screens) | **Working.** Review queue with pending + four audit tabs, thread transcript with the flagged-items log, keyword blocklist, flag patterns (with a live Postgres-side pattern test), block reasons, and Accounts. `resolve_conversation_review()` is applied and verified end to end against the live project (16/16). Support/super_admin only; verified with real logins by `scripts/chat-moderation-matrix.mjs`. |
| Phase 4 — Design system + eight new sections | **UI complete.** Every existing screen redesigned onto one token set with a real dark mode, and **zero behaviour change**, verified by extracting all 340 data-layer statements across the 26 touched files before and after and comparing them (identical, bar one em-dash inside an error string). `scripts/theme-contrast-check.mjs` passes 91 checks in both modes after fixing four real WCAG failures it found; `scripts/copy-audit.mjs` passes. **Real data, working now:** Ads → Monitoring and Geography. **UI only, on a development fixture until Phase 2 creates their tables:** Site content, Payments, Certificates, Discounts, Customers — all gated, routed and navigable now, and empty in a production build (verified by grepping the bundle). **Live Activity** is an external Clarity link and needs `VITE_CLARITY_PROJECT_ID` plus the snippet on the buyer site. **Certificates is built pending Andy's confirmation** that the certificate is physical. Not yet exercised with a real login: no admin credentials were available this session, so the role gates on the new sections are asserted from `roles.ts` rather than driven in a browser — run `scripts/smoke.mjs` after seeding throwaway admins to close that. |

## Inviting admins by email (`admin-invite`)

The Admins screen can bring in someone who has **never used Cosora**. Deployed as
the `admin-invite` edge function (`verify_jwt: true`), `super_admin`-only,
verified server-side exactly like `admin-refund-payment` — a `support` session
calling it directly gets a real `403 forbidden`, not a hidden button.

**No password is ever generated or emailed.** New people get a Supabase-generated
secure invite link and set their own password at `/reset-password`. The credential
is created by its owner and never travels through an inbox.

The link-landing page (`src/pages/ResetPassword.tsx`, routed at `/reset-password`
and the alias `/set-password`) is what makes invites usable at all. It sits
outside `RequireAdmin` — a brand-new admin who has never signed in must be able to
reach it. It establishes the session from the URL hash the link carries (explicit
`onAuthStateChange` for `PASSWORD_RECOVERY` / `SIGNED_IN`, plus a direct
`getSession()` fallback for the timing race), shows a set-password form, and on
success drops them into the panel. With no link session it shows a plain
"this link isn't valid" state, never a dead form.

### It branches on PASSWORD presence, not user existence

The panel logs in with email + **password**, but every existing Cosora account
today is **OTP-only** — `auth.users.encrypted_password IS NULL` (verified: the
real signed-up accounts all have no password). So "already has an account" does
NOT mean "can log into this panel". Branching on existence would strand every
existing user: promoted to admin, but with no password and no link, unable to
sign in.

So the function branches on password presence, decided by the
`user_has_password(email)` `SECURITY DEFINER` function (auth.users isn't
client-readable; service-role only). Three branches, each reported distinctly so
the UI's message always matches what actually happened:

| Situation | `outcome` | Email | UI |
|---|---|---|---|
| No auth user at all | `invited` (`created: true`) | invite link sent (`/auth/v1/invite` creates + sends) | green |
| Exists, **no password** (OTP-only — the common case) | `invited` (`created: false`) | set-password/recovery link sent (`/auth/v1/recover`) | green |
| Exists, **has a password** | `promoted` | none — they can already sign in | blue |
| Any "invited" where the email **failed** (e.g. rate limit) | `invited`, `emailSent: false` + `warning` | the admin is granted, but they can't log in until a link reaches them | **amber warning** |

The role is validated against the live enum via `admin_role_values()` **before**
any user is created; validating after would orphan an auth user on a bad role.
For the OTP-only branch the admin grant is applied first (durable, reversible)
and the email attempted second, so a transient rate limit can't block the
promotion — but the UI shows the amber warning, never a false "emailed".

### Email sending: verified, but rate-limited

Confirmed working end-to-end, not assumed — the auth log shows real sends of
**both** email types this feature uses:

```
{"event":"mail.send","mail_type":"invite",  "mail_to":"…+cosora-admin-invite@gmail.com","level":"info"}
{"event":"mail.send","mail_type":"recovery","mail_to":"…+cosora-otp@gmail.com",         "level":"info"}
```

(`invite` = new-user branch; `recovery` = existing-OTP-only branch.)

**But this project has no custom SMTP.** It uses Supabase's built-in mailer
(`noreply@mail.app.supabase.io`), which is strictly rate-limited and intended for
testing — a second invite minutes later failed with `email rate limit exceeded`.
It may also refuse addresses outside the project team.

That failure is handled correctly and was verified: the function returns the real
error, the UI shows it verbatim, and **no account is created** (confirmed: zero
orphaned users after a rate-limited attempt). Nothing is ever reported as invited
when the email didn't go out.

**To use invites for real, configure custom SMTP** in Supabase → Auth → SMTP
Settings. Until then, expect invites to fail whenever the built-in quota is spent.

### Invite links must be allow-listed (DASHBOARD STEP — you must do this)

The invite calls `admin-invite` with an explicit
`redirectTo = <panel origin>/reset-password` — never the global default. But
Supabase **silently drops any `redirect_to` that isn't allow-listed** and falls
back to the project's Site URL, so the invitee lands on the **main app** instead
of this panel. This is not fixable in code.

In Supabase → Auth → **URL Configuration → Redirect URLs**, add:

- `http://localhost:5174/reset-password` — for local use
- the deployed origin's `/reset-password` once this panel is hosted

**Leave the Site URL pointed at the main app** — its own auth flows depend on it.
This is an *additional* allowed redirect, not a replacement. (`http://localhost:5174/**`
also works if you prefer a wildcard. `ADMIN_INVITE_REDIRECT_URL` overrides the
client value if set as a function secret.)

### Verifying the invite flow

```bash
scripts/seed-test-admins.sql          # throwaway logins
node scripts/invite-branches-test.mjs # ALL THREE branches + authz + validation (14 checks); recovery email SENDS
node scripts/invite-ui-branches.mjs   # browser: the 3 confirmations incl. the amber email-failed warning
node scripts/reset-flow-test.mjs      # /reset-password consumes a link session & sets a working password (6 checks)
node scripts/invite-tests.mjs         # (earlier) authz + enum validation + promote branch
node scripts/invite-send-test.mjs     # the invite branch — SENDS A REAL EMAIL
scripts/invite-tests-cleanup.sql      # ALWAYS run: reverts promotions, deletes test users
```

`invite-branches-test.mjs` targets two fixtures by fixed email — an OTP-only
(no-password) non-admin and a with-password non-admin — which must be seeded first
(create an `auth.users` row with `encrypted_password` NULL vs. a bcrypt hash; the
emails are in the script header). `invite-tests-cleanup.sql` removes everything,
including any `+cosora-*` invitees the tests create.

`invite-send-test.mjs` defaults to a plus-addressed variant of the project
owner's own inbox, so a test invite can only ever reach the person running it.
The cleanup script also reverts `demo-buyer` / `demo-vendor`, which the tests
promote to exercise the existing-user branch.

---

### Known limitations — read before trusting the UI

**Suspension is real, but it is not total.** Setting `profiles.account_status =
'suspended'` (only ever through `set_account_status()`) is enforced server-side
for two things, and they are the two that matter most:

- **Messaging.** `messages_insert` requires the sender's `account_status` to be
  `'active'`, so a suspended account cannot send a message even with the UI
  bypassed entirely.
- **Calling.** `callGate()` in textile-spark-net refuses in both directions
  (caller suspended, target suspended) and the vendor's contact card — phone,
  email, address, website — is hidden by the same rule.

It does **not** yet stop a suspended account posting RFQs, submitting quotes,
uploading products or videos, running ads, or writing reviews: those insert
policies are not gated on account status. Widening that is a deliberate product
decision — suspending someone over one chat incident should arguably not also
kill a live, paid ad campaign — and is tracked as its own migration.

The old claim here, that suspension "writes the row and nothing more", was
written before the chat gate shipped and is no longer true. The vendor screen's
banner says the same thing this paragraph does.

**Refunds are real code that has never executed.** `admin-refund-payment` is
deployed (`verify_jwt: true`) and calls Razorpay's live refund API. It has
**no simulation mode** — if the keys are missing or the call fails, it writes
nothing. Two things currently block an end-to-end refund:

- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are **not set** on this Supabase
  project. The function returns `503 not_configured` (confirmed by a real
  `finance_admin` call, which passed authorization and stopped there).
- All 7 existing invoices have `razorpay_payment_id = null` — they were seeded,
  not paid through the gateway. There is no payment to reverse, and the function
  refuses them with `no_payment_id`.

So the refund path is authorization-verified and gateway-correct, but the actual
Razorpay call is **unproven** until keys are set and a real payment flows through.
Nothing is ever marked refunded without a refund id from Razorpay.

**Pending refunds don't auto-finalise.** There is no refund webhook. A Razorpay
`pending` refund is recorded as `refund_status = 'pending'` and the invoice stays
`paid` until reconciled by hand. Only `processed` sets `status = 'refunded'`.

**Ads: pause is reversible by the vendor, reject is not.** `guard_ad_activation`
only permits reactivation from `paused`, so a vendor can resume a *paused*
campaign themselves; a *rejected* one they cannot. Use reject for anything that
must stay down. The UI states this.

**No pre-publish ad gate was added.** Ads still auto-publish on payment, as
before. This screen is takedown-only, by design.

**This is not a dispute system.** The flagged-items log is a note + timestamp +
author attached to a vendor/product/ad, for internal tracking. There is no
order/transaction/complaint concept in Cosora for a dispute to attach to, so no
status, assignee, or resolution exists. Labelled as such in the UI.

**Chat moderation — read these before trusting the screens:**

- **`20260802120000` must be applied before the review queue works.** Resume and
  Keep locked call `resolve_conversation_review()`; until the migration is run
  every action on that page fails with `PGRST202 function not found`. Nothing
  half-applies — it just doesn't work.
- **Blocking is two calls, not one transaction.** "Block buyer/vendor" calls
  `set_account_status()` and *then* `resolve_conversation_review()`. Suspend-first
  is deliberate: the reverse order fails silently in the way that matters — a
  review marked `buyer_blocked` with nobody actually suspended looks handled and
  leaves the queue. If the second call fails the UI says exactly that, and the
  item stays visibly pending.
- **There is no buyer profile page in this panel**, because buyers exist here
  only as chat participants. The buyer's suspend/reinstate control therefore
  lives on the chat thread view, next to the vendor's; the vendor gets the same
  control on their own vendor page as well.
- **Which participant is the buyer is inferred**, from whether they hold a
  `vendor_profiles` row — nothing on `conversations` records it. When neither or
  both do, the queue **disables** Block buyer / Block vendor and says why rather
  than guessing. Blocking the wrong person is not recoverable.
- **No realtime.** `conversations` is in the realtime publication, but this repo
  has no subscriptions anywhere and building that for one list would be a new
  pattern for its own sake. The chat lists refetch on window focus instead (a
  per-query override — the global default is `refetchOnWindowFocus: false`).
- **The chats list is capped at 200** most-recently-active conversations and the
  thread view at 500 messages. Both say so on screen when the cap is hit; older
  rows are not below, they are not loaded.
- **Deleting a flag pattern is not deactivating it.** Existing
  `conversation_reviews` rows point at it and a deleted one leaves them with no
  label — the queue then shows "pattern since deleted". The UI says this.

### Follow-ups required in `textile-spark-net`

1. **Broader suspension enforcement** (functional): `profiles.account_status`
   (never `vendor_profiles.account_status` — that column no longer exists) is
   already enforced for messaging and calling. Extending it to RFQ, quote,
   product, video, ad and review inserts means ANDing an `account_is_active()`
   predicate onto those `with_check` clauses. Own migration, independently
   revertable.
2. **Ad `rejected` status** (cosmetic): `src/lib/queries/ads.ts` types
   `AdStatus = "draft"|"active"|"paused"|"ended"` and `Advertisements.tsx` maps
   status → badge colour. A `rejected` ad renders with an unstyled badge until
   `'rejected'` is added to that union and map. Behaviour is already correct —
   the vendor's resume button only renders for `active|paused`.
3. **`trustSealFromParts` is duplicated** in `src/lib/trustSeal.ts` here (the two
   repos share no package). If the buyer-side seal rule changes, change both or
   this panel will explain a seal buyers aren't seeing.
