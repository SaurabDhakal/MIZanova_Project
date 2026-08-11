-- ===========================================================================
-- 019_staff_mfa_status.sql — let a Platform Admin see who has 2FA
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHY
-- ---------------------------------------------------------------------------
-- Teacher Verification offers "Reset 2FA" against every staff member, with no
-- idea whether any of them has an authenticator — factors live in Supabase's
-- `auth` schema, which a browser cannot read. So the button looked identical
-- before and after a reset, and identical for someone who never had 2FA at
-- all. An administrator pressing it learned nothing.
--
-- That is the same defect this project keeps finding: the screen not reflecting
-- what is true. This function is the missing fact.
--
-- WHAT IT DELIBERATELY DOES NOT RETURN: anything about the factor itself — no
-- secret, no id, no recovery code. Only whether one exists and how many codes
-- are unused. That is all an administrator needs to decide whether a reset is
-- warranted, and it is useless to anyone else.

begin;

create or replace function public.staff_mfa_status()
returns table (
  profile_id        uuid,
  has_authenticator boolean,
  codes_remaining   integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- security definer reads the auth schema, so the role check is the only
  -- thing standing between this and every account's 2FA state. It is not
  -- optional and it is not the caller's to skip.
  if not public.is_platform_admin() then
    raise exception 'Only a Platform Admin can see two-factor status.'
      using errcode = '42501';
  end if;

  return query
  select
    p.id,
    exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = p.id
        and f.status = 'verified'
    ),
    (
      select count(*)::integer
      from public.mfa_recovery_codes c
      where c.user_id = p.id
        and c.used_at is null
    )
  from public.profiles p;
end;
$$;

revoke all on function public.staff_mfa_status() from public, anon;
-- Granted to every signed-in user because the function refuses anyone who is
-- not a Platform Admin. Granting narrowly by role is not possible here; the
-- check inside is what enforces it.
grant execute on function public.staff_mfa_status() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked, from the BROWSER CONSOLE:
--
--   as a Platform Admin  → await supabase.rpc('staff_mfa_status')   rows
--   as anyone else       → the same call must fail with 42501
-- ---------------------------------------------------------------------------
