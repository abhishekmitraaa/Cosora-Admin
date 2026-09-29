-- Purge the Journal's ISR cache when a post changes.
--
-- Without this, a published post waits up to the full hour of `revalidate =
-- 3600` before it appears at www.cosora.in/blogs. Verified before writing: no
-- http_request trigger existed on blog_posts, so nothing was calling the
-- revalidate endpoint that cosora-blogs has been shipping since launch.
--
-- Implemented with net.http_post rather than supabase_functions.http_request:
-- this project has pg_net 0.20.4 and no supabase_functions schema, so the
-- wrapper the Supabase dashboard's "Database Webhooks" UI writes does not exist
-- here. Same shape as the existing faqs_queue_snapshot and
-- site_config_queue_snapshot triggers.
--
-- THE SECRET IS NOT IN THIS FILE. All three Cosora repos are public, so the
-- value lives in Vault under the name 'blog_revalidate_secret' and is read at
-- call time. Set it once, outside version control:
--
--   select vault.create_secret('<value of REVALIDATE_SECRET>',
--                              'blog_revalidate_secret',
--                              'x-revalidate-secret header for the Journal ISR purge');
--
-- It must match REVALIDATE_SECRET in the cosora-blogs Vercel project. A
-- mismatch shows up as a 401 in net._http_response, never as a failed write.

create or replace function public.blog_posts_revalidate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_secret text;
  v_new_slug text := null;
  v_old_slug text := null;
  v_new_status text := null;
  v_old_status text := null;
begin
  if tg_op <> 'INSERT' then
    v_old_slug := old.slug;
    v_old_status := old.status;
  end if;
  if tg_op <> 'DELETE' then
    v_new_slug := new.slug;
    v_new_status := new.status;
  end if;

  -- A draft that is still a draft has never been on the public site, so there
  -- is nothing cached to purge. Every other transition is worth a call,
  -- including publish, unpublish, rename and delete.
  if coalesce(v_old_status, 'draft') = 'draft' and coalesce(v_new_status, 'draft') = 'draft' then
    return null;
  end if;

  begin
    select s.decrypted_secret into v_secret
      from vault.decrypted_secrets s
     where s.name = 'blog_revalidate_secret';

    if v_secret is null then
      raise warning 'blog revalidate not sent: Vault secret blog_revalidate_secret is missing';
      return null;
    end if;

    -- Deliberately NOT deduplicated per transaction, unlike faqs_queue_snapshot.
    -- admin_blog_post_save clears is_featured on the previously featured row in
    -- the same transaction as the save, and that row's card genuinely changed.
    -- Collapsing the two would send only the first row's slug and leave the
    -- post the editor actually saved stale.
    perform net.http_post(
      url     := 'https://www.cosora.in/blogs/api/revalidate',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-revalidate-secret', v_secret),
      body    := jsonb_build_object(
                   'type', tg_op,
                   'table', tg_table_name,
                   'record', case when v_new_slug is null then null
                                  else jsonb_build_object('slug', v_new_slug) end,
                   'old_record', case when v_old_slug is null then null
                                      else jsonb_build_object('slug', v_old_slug) end),
      timeout_milliseconds := 30000
    );
  exception when others then
    -- Never fail an editor's save over a cache purge. The hourly ISR window is
    -- the fallback, exactly as it was before this trigger existed.
    raise warning 'blog revalidate not sent: %', sqlerrm;
  end;

  return null;
end
$fn$;

revoke execute on function public.blog_posts_revalidate() from public, anon, authenticated;

drop trigger if exists trg_blog_posts_revalidate on public.blog_posts;
create trigger trg_blog_posts_revalidate
  after insert or update or delete on public.blog_posts
  for each row execute function public.blog_posts_revalidate();
