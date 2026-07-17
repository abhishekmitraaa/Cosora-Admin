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

`support` can additionally write the flagged-items log (`admin_flags`) — the only
table it may write.

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

`vendor_profiles.account_status` already existed — Prompt 1 added it.

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
| 3 — Product moderation queue | **Working**; approve/reject + required reason, live/rejected tabs |
| 4 — Vendor accounts & verification | **Working for verification. Suspension writes the flag only — see below.** |
| 5 — Ads post-publish takedown | **Working**; needs a small cosmetic follow-up in textile-spark-net (below) |
| 6 — Subscriptions & billing | **Plan change / cancel working. Refunds cannot execute on this project — Razorpay keys are not set.** |
| 7 — Reporting + flagged-items log | **Working**, from real rows |

### Known limitations — read before trusting the UI

**Vendor suspension is a flag, not enforcement.** Setting `account_status =
'suspended'` writes the row and nothing more. Nothing in `textile-spark-net`
reads it yet, so a suspended vendor's products and ads stay visible to buyers and
an open session keeps working. Delivering real suspension needs a follow-up in
that repo (filter on `account_status` in the buyer-side product/ad queries, and
reject the session). The UI says exactly this on the vendor screen.

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

### Follow-ups required in `textile-spark-net`

1. **Vendor suspension enforcement** (functional): read `vendor_profiles.account_status`
   in the buyer-facing product/ad queries and hide suspended vendors' content;
   kick or block an in-progress suspended session.
2. **Ad `rejected` status** (cosmetic): `src/lib/queries/ads.ts` types
   `AdStatus = "draft"|"active"|"paused"|"ended"` and `Advertisements.tsx` maps
   status → badge colour. A `rejected` ad renders with an unstyled badge until
   `'rejected'` is added to that union and map. Behaviour is already correct —
   the vendor's resume button only renders for `active|paused`.
3. **`trustSealFromParts` is duplicated** in `src/lib/trustSeal.ts` here (the two
   repos share no package). If the buyer-side seal rule changes, change both or
   this panel will explain a seal buyers aren't seeing.
