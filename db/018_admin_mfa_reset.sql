-- ===========================================================================
-- 018_admin_mfa_reset.sql — a Platform Admin can clear someone's 2FA
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHY
-- ---------------------------------------------------------------------------
-- Requiring two-factor authentication for staff (MFA_REQUIRED_ROLES) created a
-- way to be permanently locked out: lose the phone AND the ten recovery codes,
-- and there is no route back. Recovery codes cover the common case; this covers
-- the case where those are gone too.
--
-- It is the most dangerous button in the product. Whoever holds it can strip
-- the second factor from any staff account in any school — so the checks are
-- here, in the database, rather than only in the server that calls it. A
-- mistake in the server should not be able to hand this out.
--
-- The factor itself is deleted by the API server through Supabase's admin API,
-- because factors live in the `auth` schema and are Supabase's to manage. What
-- this function owns is authorising the act, clearing the recovery codes, and
-- making sure it is written down.

begin;

create or replace function public.admin_reset_mfa(
  p_actor_id   uuid,
  p_subject_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role public.user_role;
  v_role       public.user_role;
  v_name       text;
begin
  -- The actor is passed in rather than read from auth.uid() because the caller
  -- is the API server, acting for a signed-in admin. That is precisely why the
  -- role is checked HERE and execute is granted to service_role alone: a
  -- function taking "who is asking" as an argument must never be reachable
  -- from a browser, or anyone could claim to be an administrator.
  select role into v_actor_role
  from public.profiles
  where id = p_actor_id;

  if v_actor_role is distinct from 'platform_admin' then
    raise exception 'Only a Platform Admin can reset two-factor authentication.'
      using errcode = '42501';
  end if;

  select role, full_name into v_role, v_name
  from public.profiles
  where id = p_subject_id;

  if v_role is null then
    raise exception 'No such person.' using errcode = '02000';
  end if;

  -- The old codes belong to the authenticator being removed. Leaving them
  -- would mean a sheet of paper from before the reset still opened the
  -- account, which is the opposite of what a reset is for.
  delete from public.mfa_recovery_codes where user_id = p_subject_id;

  insert into public.admin_audit_events (
    actor_id, action, subject_id, subject_label, detail
  )
  values (
    p_actor_id,
    'staff.mfa_reset',
    p_subject_id,
    v_name,
    'Two-factor authentication cleared by an administrator. Their authenticator and all recovery codes stopped working, and they must enrol again before reaching any student records.'
  );

  return coalesce(v_name, 'Unnamed');
end;
$$;

revoke all on function public.admin_reset_mfa(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_reset_mfa(uuid, uuid) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked. From the BROWSER CONSOLE while signed in as ANY role —
-- every one of these must fail, including a Platform Admin's, because this is
-- not reachable from a browser at all:
--
--   await supabase.rpc('admin_reset_mfa', { p_actor_id: '…', p_subject_id: '…' })
--
-- The working path is Platform Admin → Teacher Verification → Reset 2FA,
-- which goes through the API server.
-- ---------------------------------------------------------------------------
