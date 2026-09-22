-- Remove everything scripts/seed-chat-fixtures.sql created, plus anything the
-- chat tests wrote against those fixtures.
--
-- ALWAYS run this when finished. The seeded accounts are real logins with a
-- known password.
--
-- Order matters: several of these tables FK each other, and two of them
-- (`account_suspensions`, `messages`) have NO client delete policy at all — the
-- only way to clear them is here, as the service role. That is by design, not an
-- oversight: a ledger a client can erase is not a ledger, and there is
-- deliberately no message-redaction path in this product.
--
-- Since admin-schema separation Phase 4c (2026-09-21) keyword_blocklist,
-- flag_patterns, chat_block_reasons, conversation_reviews and
-- account_suspensions live in the `admin` schema, which no client role (and not
-- service_role over REST) can reach. Run this in the SQL editor / as postgres.

-- Moderation rows first — conversation_reviews FKs both messages and
-- flag_patterns, so it has to go before either.
delete from public.notifications
 where profile_id::text like 'cf00000%';

delete from admin.conversation_reviews
 where conversation_id in (
   select id from public.conversations
    where user_a::text like 'cf00000%' or user_b::text like 'cf00000%'
 );

delete from admin.account_suspensions
 where profile_id::text like 'cf00000%';

delete from public.messages
 where conversation_id in (
   select id from public.conversations
    where user_a::text like 'cf00000%' or user_b::text like 'cf00000%'
 );

delete from public.calls
 where buyer_id::text like 'cf00000%' or vendor_id::text like 'cf00000%';

delete from public.conversations
 where user_a::text like 'cf00000%' or user_b::text like 'cf00000%';

-- Anything the tests wrote through the fixtures.
-- admin_flags lives in the admin schema since admin-schema separation Phase 3c.
delete from admin.admin_flags where entity_id::text like 'cf00000%';
-- chat-pipeline-matrix also writes '<TAG> support note' flags on a fixture
-- CONVERSATION, whose id is not cf-prefixed; they reference the rlstest support
-- account, so drop-test-admins.sql cannot delete that profile until they go.
delete from admin.admin_flags where note like 'chatfx-%';
delete from admin.keyword_blocklist where term like 'chatfx-%';
delete from admin.flag_patterns where label like 'chatfx-%';
-- chat-moderation-matrix.mjs's throwaway super_admin reasons: there is no client
-- delete path for a block reason (the panel deactivates), so they end here.
-- Never referenced by a suspension or review, so the FK restrict does not bite.
delete from admin.chat_block_reasons where reason like 'zz-verify-%';

-- Fixture content.
delete from public.quotes where vendor_id::text like 'cf00000%';
delete from public.rfqs where buyer_id::text like 'cf00000%';
delete from public.product_reviews where buyer_id::text like 'cf00000%';
delete from public.service_reviews where buyer_id::text like 'cf00000%';
delete from public.reviews where buyer_id::text like 'cf00000%' or vendor_id::text like 'cf00000%';
delete from public.advertisements where vendor_id::text like 'cf00000%';
delete from public.product_videos where vendor_id::text like 'cf00000%';
delete from public.product_images
 where product_id in (select id from public.products where vendor_id::text like 'cf00000%');
delete from public.products where vendor_id::text like 'cf00000%';
delete from public.subscription_invoices where vendor_id::text like 'cf00000%';
delete from public.vendor_subscriptions where vendor_id::text like 'cf00000%';
delete from public.vendor_profiles where id::text like 'cf00000%';

-- Accounts.
delete from public.profiles where email like 'chatfx-%';
delete from auth.identities where provider_id like 'chatfx-%';
delete from auth.users where email like 'chatfx-%';

select
  (select count(*) from auth.users where email like 'chatfx-%')                    as leftover_fixture_users,
  (select count(*) from public.conversations
     where user_a::text like 'cf00000%' or user_b::text like 'cf00000%')           as leftover_conversations,
  (select count(*) from admin.keyword_blocklist)                                   as blocklist_terms_must_be_0,
  (select count(*) from admin.flag_patterns)                                       as flag_patterns_must_be_3,
  (select count(*) from admin.chat_block_reasons)                                  as block_reasons_must_be_7,
  (select count(*) from public.profiles where account_status <> 'active')          as suspended_must_be_0;
