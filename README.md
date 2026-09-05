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

Sign in with an account whose `profiles.is_admin = true`. `profiles.admin_role`
then decides which sections render.

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
   `vendor_profiles.is_verified` / `account_status`, `profiles.is_admin` /
   `admin_role`, `advertisements.status`, and the moderation reason columns).
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

| Role | Products | Vendors | Ads | Subscriptions | Reports | Admins |
|---|---|---|---|---|---|---|
| `super_admin` | write | write | write | write | read | **write** |
| `product_moderator` | write | – | – | – | read | – |
| `vendor_ops` | – | write | – | – | read | – |
| `ads_moderator` | – | – | write | – | read | – |
| `finance_admin` | – | – | – | write | read | – |
| `support` | read | read | read | read | read | – |

`support` can additionally write the flagged-items log (`admin_flags`).

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

## Verifying the gates

Two scripts drive the **real database with real logins** (anon key + password, so
PostgREST runs as `authenticated`, exactly what the triggers check).

```bash
# 1. Seed throwaway accounts + isolated fixtures (SQL editor / service role).
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
| 4 — Vendor accounts & verification | **Working.** Verification writes `vendor_profiles.is_verified`. Suspension is account-level (`profiles.account_status` via `set_account_status()`) and is **really enforced for chat and calling** — not yet for RFQs, quotes, listings or ads. See below. |
| 5 — Ads post-publish takedown | **Working**; needs a small cosmetic follow-up in textile-spark-net (below) |
| 6 — Subscriptions & billing | **Plan change / cancel working. Refunds cannot execute on this project — Razorpay keys are not set.** |
| 7 — Reporting + flagged-items log | **Working**, from real rows |
| Phase 3 — Chat moderation (7 screens) | **Working.** Review queue with pending + four audit tabs, thread transcript with the flagged-items log, keyword blocklist, flag patterns (with a live Postgres-side pattern test), block reasons, and Accounts. `resolve_conversation_review()` is applied and verified end to end against the live project (16/16). Support/super_admin only; verified with real logins by `scripts/chat-moderation-matrix.mjs`. |

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
