# Changelog

Reverse-chronological. Newest entry at the top.

Companion to `README.md`, which describes the panel as it stands *now*; this file records
how it got there and why. The buyer/vendor app keeps its own, much longer log at
`textile-spark-net/documentation/changelog.md` — a change touching both repos gets an
entry in each, from that repo's point of view.

---

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
