# Cosora — Deferred / Follow-Up Items

The deferred-items list is maintained in one place, in the primary repo:

→ `textile-spark-net/todo.md`

Items on it that land in THIS repo when they are picked up:

- **`delivery_team` admin role** (Medium) — `admin_role_type` enum,
  `certificate_fulfiller()`, and `SECTION_READ`/`SECTION_WRITE` in
  `src/lib/roles.ts` must change together. The roles file is UX only; the
  database is the authority, and they must not drift.
- **GST / invoicing for ad purchases** (High, blocked on real Razorpay) — the
  admin-side refund and finance surfaces would need to understand ad invoices,
  which do not exist yet.

See also `MIGRATIONS.md` in this repo: the two repos share one Supabase project
and their migrations depend on each other in both directions.
