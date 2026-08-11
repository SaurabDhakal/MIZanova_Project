-- ===========================================================================
-- 017_recovery_codes_need_a_factor.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHY
-- ---------------------------------------------------------------------------
-- generate_recovery_codes() in db/016 would hand out ten codes to anyone who
-- asked, whether or not they had an authenticator. That happened immediately
-- in testing: an account ended up holding ten valid recovery codes with 2FA
-- switched off.
--
-- Recovery codes for an account with no second factor are a key to a door
-- that is not locked. Worse than useless — they LOOK like protection, and the
-- person holding them believes their account is secured when it is not.
--
-- A recovery code exists to get past an authenticator. No authenticator, and
-- there is nothing to get past.

begin;

-- Same function as db/016 with one guard added at the top. Everything else is
-- unchanged; see 016 for why SHA-256 and why the previous set is destroyed.
create or replace function public.generate_recovery_codes()
returns text[]
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_user  uuid := auth.uid();
  v_codes text[] := '{}';
  v_code  text;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  -- The guard. `auth.mfa_factors` is Supabase's own table; a row reaches
  -- 'verified' only after a code from the authenticator app has been checked,
  -- so this cannot be satisfied by starting a setup and walking away.
  if not exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = v_user
      and f.status = 'verified'
  ) then
    raise exception
      'Set up an authenticator app before generating recovery codes. Codes on an account with no second factor protect nothing.'
      using errcode = '22023';
  end if;

  delete from public.mfa_recovery_codes where user_id = v_user;

  for i in 1..10 loop
    v_code := upper(encode(extensions.gen_random_bytes(10), 'hex'));
    v_code := left(v_code, 10) || '-' || right(v_code, 10);

    v_codes := array_append(v_codes, v_code);

    insert into public.mfa_recovery_codes (user_id, code_hash)
    values (
      v_user,
      encode(extensions.digest(v_code, 'sha256'), 'hex')
    );
  end loop;

  return v_codes;
end;
$$;

revoke all on function public.generate_recovery_codes() from public, anon;
grant execute on function public.generate_recovery_codes() to authenticated;

-- ---------------------------------------------------------------------------
-- Clear codes that were issued to accounts with no authenticator
-- ---------------------------------------------------------------------------
-- These are the ones the guard above would now refuse to create. Deleting
-- them rather than leaving them is the point: their only effect is to make
-- someone believe they are protected. A fresh set is issued the moment an
-- authenticator is actually enrolled.
delete from public.mfa_recovery_codes c
where not exists (
  select 1
  from auth.mfa_factors f
  where f.user_id = c.user_id
    and f.status = 'verified'
);

commit;

-- ---------------------------------------------------------------------------
-- Check it worked, from the BROWSER CONSOLE while signed in (auth.uid() is
-- null in this editor — see the note at the end of db/016):
--
--   await supabase.rpc('generate_recovery_codes')
--
-- With no authenticator enrolled that must now fail with the message above.
-- Enrol one on /account/security and it will succeed.
-- ---------------------------------------------------------------------------
