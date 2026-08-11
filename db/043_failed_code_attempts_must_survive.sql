-- ===========================================================================
-- 043_failed_code_attempts_must_survive.sql — a counter that could never count
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHAT WAS WRONG.
--
-- `redeem_guardian_code` recorded a failed attempt and then refused:
--
--   update public.guardian_access_codes set attempts = attempts + 1 ...
--   raise exception 'That code was issued to a different email address...'
--
-- RAISE ROLLS BACK THE WHOLE FUNCTION. The increment never survived, so
-- `attempts` stayed at zero however many times somebody tried a code from the
-- wrong account — and the "1 failed attempt" line built into the Family access
-- screen would have read zero for ever.
--
-- A counter that cannot count is worse than no counter: somebody reads it,
-- sees nothing, and concludes nothing has been tried.
--
-- Found by a test asserting the number went up. Nothing about the screen
-- looked wrong, because the refusal itself worked perfectly.
--
-- ---------------------------------------------------------------------------
-- THE FIX, AND WHY IT IS A BETTER SHAPE ANYWAY
-- ---------------------------------------------------------------------------
-- The function no longer raises for things a person can do wrong. It returns
-- what happened.
--
-- Raising is for a caller that has made a programming mistake. "This code was
-- issued to a different address", "this code has already been used" and "this
-- code expired" are none of those — they are the ordinary outcomes of a parent
-- typing something, and every one of them needs a message a parent can read
-- and, in one case, a row that has to be written down.
--
-- An exception cannot leave a trace behind it. A returned result can.
--
-- The server checks `ok` and turns `message` into the response. Nothing else
-- may call this — it is service_role only — so there is one caller to keep
-- honest.

begin;

drop function if exists public.redeem_guardian_code(text, uuid, text);

create function public.redeem_guardian_code(
  p_code_hash     text,
  p_profile_id    uuid,
  p_profile_email text
)
returns table (
  ok         boolean,
  message    text,
  student_id uuid,
  child_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  code public.guardian_access_codes%rowtype;
begin
  select * into code
    from public.guardian_access_codes
   where code_hash = p_code_hash
     for update;

  if not found then
    return query select false, 'That code is not valid.'::text, null::uuid, null::text;
    return;
  end if;
  if code.revoked_at is not null then
    return query select false,
      'That code has been withdrawn by the school.'::text, null::uuid, null::text;
    return;
  end if;
  if code.redeemed_at is not null then
    return query select false,
      'That code has already been used.'::text, null::uuid, null::text;
    return;
  end if;
  if code.expires_at < now() then
    return query select false,
      'That code has expired. Ask the school for a new one.'::text,
      null::uuid, null::text;
    return;
  end if;

  if lower(btrim(p_profile_email)) <> code.guardian_email then
    -- THE WHOLE REASON THIS FUNCTION NO LONGER RAISES. This update has to
    -- commit: somebody trying a code from the wrong account is either confused
    -- or should not have it, and the school is shown the number either way.
    update public.guardian_access_codes
       set attempts = attempts + 1
     where id = code.id;

    return query select false,
      'That code was issued to a different email address. Sign in with the address the school sent it to.'::text,
      null::uuid, null::text;
    return;
  end if;

  update public.guardian_access_codes
     set redeemed_at = now(), redeemed_by = p_profile_id
   where id = code.id;

  insert into public.student_guardians (student_id, profile_id)
  values (code.student_id, p_profile_id)
  on conflict do nothing;

  return query
    select true,
           null::text,
           code.student_id,
           s.first_name || ' ' || left(s.last_name, 1) || '.'
      from public.students s
     where s.id = code.student_id;
end;
$$;

revoke all on function public.redeem_guardian_code(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.redeem_guardian_code(text, uuid, text)
  to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked. Issue a code to one address, then try it from another —
-- the refusal should be the same, and this should now climb:
--
--   select guardian_email, attempts, redeemed_at
--   from public.guardian_access_codes
--   order by issued_at desc limit 5;
--
-- `npm test` covers it: "the wrong address is refused, and the attempt is
-- counted" fails against the old function and passes against this one.
-- ---------------------------------------------------------------------------
