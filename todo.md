# Cosora — Deferred / Follow-Up Items

The deferred-items list is maintained in one place, in the primary repo:

→ `textile-spark-net/todo.md`

Items on it that land in THIS repo when they are picked up:

- ~~`delivery_team` admin role~~: built 2026-10-13 on branch `build/todo-batch-2026-10-13`; live once released.
- **GST / invoicing for ad purchases** (High, blocked on real Razorpay) — the
  admin-side refund and finance surfaces would need to understand ad invoices,
  which do not exist yet.

See also `MIGRATIONS.md` in this repo: the two repos share one Supabase project
and their migrations depend on each other in both directions.
