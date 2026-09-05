-- ─────────────────────────────────────────────────────────────
-- regex_probe() — let the flag-pattern editor test a pattern before saving it,
-- using the engine that will actually run it.
--
-- Why this is not done in JavaScript.
--
--   Postgres regexes are POSIX ARE. JavaScript regexes are ECMA-262. They
--   overlap enough to be mistaken for each other and differ exactly where it
--   matters here:
--
--     '(\+?91[\-\s]?)?[6-9]\d{9}\y'   -- valid ARE; JS throws "Nothing to repeat"
--     '\y(whats\s?app|telegram)\y'    -- valid ARE; JS ACCEPTS it and silently
--                                     -- reads \y as a literal "y"
--     '\bword\b'                      -- valid in both, but \b is a word
--                                     -- boundary in JS and a BACKSPACE in ARE
--
--   So a `new RegExp(pattern)` check would reject two of the three patterns
--   this project actually ships, and would pass a `\b` pattern that is silently
--   dead in production. The second failure mode is the dangerous one: it looks
--   like validation while validating the wrong language.
--
--   The flag_patterns_pattern_valid CHECK proves a pattern COMPILES. It cannot
--   prove it MATCHES anything. This closes that gap by letting an admin see the
--   real answer against a real sample before the pattern goes live and starts
--   locking conversations.
--
-- Safety: gated to the same roles that may write flag_patterns, so this exposes
-- no evaluation an admin could not already trigger by inserting the pattern.
-- Returns the error text instead of raising, because the caller is a form that
-- wants to render "here is what is wrong", not a failed request.
-- ─────────────────────────────────────────────────────────────

create or replace function public.regex_probe(p_pattern text, p_sample text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $BODY$
declare
  v_matches boolean;
begin
  if not (public.is_admin() and public.admin_role() in ('support', 'super_admin')) then
    raise exception 'not authorized: probing a pattern requires the support or super_admin role'
      using errcode = '42501';
  end if;

  -- `~*` is what check_message_flag_patterns() uses, so the probe answers the
  -- question the trigger will actually ask (case-insensitive), not a similar one.
  begin
    select coalesce(p_sample, '') ~* p_pattern into v_matches;
  exception when others then
    return jsonb_build_object('valid', false, 'matches', false, 'error', sqlerrm);
  end;

  return jsonb_build_object('valid', true, 'matches', v_matches, 'error', null);
end;
$BODY$;

revoke all on function public.regex_probe(text, text) from public, anon;
grant execute on function public.regex_probe(text, text) to authenticated, service_role;
