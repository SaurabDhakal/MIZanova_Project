-- ===========================================================================
-- 016_mfa_recovery.sql — recovery codes for two-factor authentication
-- ===========================================================================
-- Run this in the Supabase SQL editor. COMMIT YOUR WORK FIRST: the free tier
-- has no backups. Safe to run twice.
--
-- WHY THIS TABLE EXISTS AT ALL
-- ---------------------------------------------------------------------------
-- Supabase handles TOTP itself: enrolling a phone, and checking the six digits
-- at sign-in. What it does not handle is a teacher who drops their phone in a
-- playground.
--
-- And it cannot be worked around in the browser, because Supabase requires a
-- user to already be at aal2 — to have passed 2FA — before they may remove
-- their own authenticator. Someone locked out is by definition at aal1. So a
-- recovery code cannot "skip" the check; it proves who you are well enough to
-- have the factor REMOVED, after which you enrol a new phone.
--
-- That removal is done by the API server with the service key, which is why
-- redemption below is deliberately not callable from a browser.
--
-- WHY PLAIN SHA-256 AND NOT BCRYPT
-- ---------------------------------------------------------------------------
-- These codes are 80 bits of random, unlike a password someone invented. There
-- is no dictionary to try and no cheaper attack than brute force over 2^80, so
-- a slow hash would buy nothing and cost a second of CPU on every attempt.
-- Passwords are different, and Supabase already hashes those properly.

begin;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
-- Only hashes are stored. If this table leaks, the codes in it are still
-- useless — which is the entire point of not storing what was shown to the
-- user.
create table if not exists public.mfa_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,

  code_hash  text not null,

  -- Set the moment a code is spent. The row is KEPT rather than deleted, so
  -- "this account was recovered on 4 August" stays answerable — the same
  -- reasoning as consents in db/002.
  used_at    timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists mfa_recovery_codes_user_idx
  on public.mfa_recovery_codes (user_id)
  where used_at is null;

-- One hash can only exist once per user, so a repeated generation cannot
-- silently produce a collision.
create unique index if not exists mfa_recovery_codes_unique
  on public.mfa_recovery_codes (user_id, code_hash);

alter table public.mfa_recovery_codes enable row level security;

-- ---------------------------------------------------------------------------
-- 2. No policies. Deliberately.
-- ---------------------------------------------------------------------------
-- RLS is on and NOTHING is granted, so this table is unreadable and unwritable
-- from any browser session, including its owner's. Everything below goes
-- through the two functions instead.
--
-- A user has no reason to read even their own hashes: knowing the hash of a
-- code you have lost helps nobody but an attacker who has stolen the database.
-- What a user legitimately needs is "how many do I have left", which is the
-- count function below.
revoke all on public.mfa_recovery_codes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Generate a fresh set
-- ---------------------------------------------------------------------------
-- Returns the ten codes ONCE, in plain text, and stores only their hashes.
-- They cannot be retrieved afterwards; the UI must make that clear before the
-- user navigates away.
--
-- Generating replaces any previous set. If you set up a new phone, every code
-- printed for the old one stops working — otherwise a photo of a recovery
-- sheet from last year would still open the account.
create or replace function public.generate_recovery_codes()
returns text[]
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user  uuid := auth.uid();
  v_codes text[] := '{}';
  v_code  text;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  delete from public.mfa_recovery_codes where user_id = v_user;

  for i in 1..10 loop
    -- 10 random bytes = 20 hex characters = 80 bits. Split with a hyphen
    -- because a human has to copy this off a screen without losing their place.
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
-- 4. How many are left
-- ---------------------------------------------------------------------------
-- The one thing a signed-in user may ask about their own codes.
create or replace function public.recovery_codes_remaining()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.mfa_recovery_codes
  where user_id = auth.uid()
    and used_at is null;
$$;

revoke all on function public.recovery_codes_remaining() from public, anon;
grant execute on function public.recovery_codes_remaining() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Redeem one — SERVER ONLY
-- ---------------------------------------------------------------------------
-- Takes a user id rather than reading auth.uid(), because the caller is the
-- API server acting on behalf of someone who cannot yet fully authenticate.
--
-- THAT IS EXACTLY WHY IT IS NOT GRANTED TO `authenticated`. A function that
-- accepts "which user" as an argument and is callable from a browser would let
-- any signed-in person burn another person's recovery codes. Execute is granted
-- to service_role alone, and that key never leaves the server.
--
-- Returns true only if an unused code matched, and marks it used in the same
-- statement so the same code cannot be redeemed twice by two racing requests.
create or replace function public.redeem_recovery_code(
  p_user_id uuid,
  p_code    text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash    text;
  v_updated integer;
begin
  -- Normalised the same way the UI normalises it: people type these with
  -- stray spaces and in whatever case their keyboard was in.
  v_hash := encode(
    extensions.digest(upper(btrim(p_code)), 'sha256'),
    'hex'
  );

  update public.mfa_recovery_codes
     set used_at = now()
   where user_id = p_user_id
     and code_hash = v_hash
     and used_at is null;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.redeem_recovery_code(uuid, text)
  from public, anon, authenticated;
grant execute on function public.redeem_recovery_code(uuid, text) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- CHECKING IT WORKED — NOT FROM THIS EDITOR.
--
-- `generate_recovery_codes()` reads auth.uid(), and the SQL editor runs as the
-- `postgres` role with no user session, so auth.uid() is null and the function
-- correctly refuses with "Not signed in.". That is the function working, not
-- failing. (`recovery_codes_remaining()` is worse: here it returns 0 for
-- nobody, which looks like an answer and is not.)
--
-- DO NOT call generate_recovery_codes() by hand to "test" it. Codes belong to
-- an authenticator; generating them on their own produces ten valid codes for
-- an account with 2FA switched off, which looks like protection and is not.
-- That happened during testing, and db/017 now makes the database refuse it.
-- Enrol on /account/security instead, which generates them at the right
-- moment.
--
-- Safe to run in the BROWSER CONSOLE while signed in — `supabase` is exposed
-- on window in development by src/lib/supabase.ts:
--
--   await supabase.rpc('recovery_codes_remaining')   // how many are left
--
-- And the two that must FAIL, proving the table is unreachable from a browser
-- and that one user cannot burn another's codes:
--
--   await supabase.from('mfa_recovery_codes').select('*')
--   await supabase.rpc('redeem_recovery_code', { p_user_id: '…', p_code: 'X' })
--
-- To confirm from a terminal that the objects merely EXIST, without a signed-in
-- user, `npm run security-check` covers the anonymous case.
-- ---------------------------------------------------------------------------
