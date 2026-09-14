# Migrations

**This repo's `supabase/migrations/` is only half the story.**

`Cosora-Admin` and `textile-spark-net` share one Supabase project
(`vxdhhgdfubqedfpwfyrb`). Migrations in the two repos depend on each other in
**both directions** and must be applied as a single timestamp-ordered list, not
repo by repo.

Concretely, from this repo:

- `20260912120000_ad_campaign_state_model.sql` **creates** `ad_review_log`,
  which `textile-spark-net/…/20260912120200_ad_eligibility_targeting_and_sweep.sql`
  then alters.
- `20260913120000_ad_review_hardening.sql` **revokes grants on**
  `is_ad_eligible`, `ad_targeting_matches`, `ad_viewer_city`,
  `vendor_account_in_good_standing` and `ad_frequency_capped` — all five of
  which are **created by** that same buyer-repo migration. Run the hardening
  migration first and the revokes fail on functions that do not exist, leaving
  them callable by `anon`.

**The full procedure, the ordered list, and the edge-function deployment
caveats live in one place — do not duplicate them here:**

→ `textile-spark-net/MIGRATIONS.md`
