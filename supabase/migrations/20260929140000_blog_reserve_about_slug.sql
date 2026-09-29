-- Reserve the slug "about".
--
-- /blogs/about is now a real static route in the Journal app (the About page
-- moved there out of this repo's router). Next resolves a static segment ahead
-- of the [slug] catch-all, so a post saved with slug "about" would be shadowed
-- by the About page and permanently unreachable.
--
-- Same reasoning and same list as 20260929120100, which reserved 'category',
-- 'page' and 'api'. Body is unchanged apart from the added slug.

create or replace function public.blog_assert_slug(p_slug text, p_id uuid)
returns text language plpgsql set search_path = '' as $$
declare v_slug text := public.blog_slugify(p_slug);
begin
  if v_slug = '' then
    raise exception 'A post needs a title or a slug.' using errcode = '22023';
  end if;
  if v_slug in ('category', 'page', 'api', 'about') then
    raise exception 'The slug "%" is reserved by the blog router. Pick another.', v_slug
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.blog_posts b
     where b.slug = v_slug and (p_id is null or b.id <> p_id)
  ) then
    raise exception 'Another post already uses the slug "%".', v_slug
      using errcode = '23505';
  end if;
  return v_slug;
end $$;

-- CREATE OR REPLACE resets privileges to the PUBLIC default, so re-apply them.
-- This is a helper, not an admin RPC: it is called from inside the SECURITY
-- DEFINER save functions and nothing should reach it directly.
revoke execute on function public.blog_assert_slug(text, uuid) from public, anon;
