-- ===========================================================================
-- 066_a_school_can_correct_its_own_details.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- `organisations` holds a school's name, suburb, state, timezone and ABN, and
-- until now only a platform admin could write any of it. A school with a
-- misspelled name or a wrong ABN had exactly one route: ring Special Miles.
-- That is a whole role with no self-service over its own record.
--
-- ---------------------------------------------------------------------------
-- WHAT A SCHOOL MUST NOT BE ABLE TO CHANGE, AND WHY A TRIGGER RATHER THAN A
-- COLUMN GRANT
-- ---------------------------------------------------------------------------
-- `status` is commercial. A school that could write it could take itself off
-- 'suspended' — and since db/063 that is not cosmetic, it is the difference
-- between its educators being able to add children or not. `kind` decides
-- which product they are, which is also a Special Miles decision.
--
-- The obvious enforcement is the db/004 pattern: revoke UPDATE and grant it
-- back column by column. That does not work here. Column grants attach to the
-- ROLE, and a platform admin is `authenticated` too — so revoking UPDATE on
-- `status` would break the Schools page's own status control, and putting that
-- back would mean routing it through a security-definer function and rewriting
-- a working path for no gain.
--
-- A BEFORE UPDATE trigger asks who is doing it instead of what column it is,
-- which is the actual rule: a school may correct its details, and only Special
-- Miles may change what a school IS. It also covers a psql prompt, which a
-- policy on this table alone would not.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. A school administrator may write to their own organisation
-- ---------------------------------------------------------------------------
-- `my_school_id()` is the membership-backed answer from db/039, so this is the
-- school they actually belong to rather than one they can name. The platform
-- admin's existing all-rows policy is untouched.
drop policy if exists organisations_update_own on public.organisations;
create policy organisations_update_own
  on public.organisations for update to authenticated
  using (public.is_school_admin() and id = public.my_school_id())
  with check (public.is_school_admin() and id = public.my_school_id());


-- ---------------------------------------------------------------------------
-- 2. What only Special Miles may change
-- ---------------------------------------------------------------------------
create or replace function public.organisations_guard_managed_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_platform_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception
      'Only Special Miles can change a school''s status.'
      using errcode = '42501';
  end if;

  if new.kind is distinct from old.kind then
    raise exception
      'Only Special Miles can change what kind of organisation this is.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists organisations_guard_managed_fields on public.organisations;
create trigger organisations_guard_managed_fields
  before update on public.organisations
  for each row execute function public.organisations_guard_managed_fields();


-- ---------------------------------------------------------------------------
-- 3. A school correcting its own record is worth recording
-- ---------------------------------------------------------------------------
-- db/064 audits status changes and db/065 audits corrections to a child's
-- record. A school renaming itself or changing its ABN belongs in the same
-- trail: it is the sort of edit somebody asks about later, and the previous
-- value is the part they want.
create or replace function public.audit_organisation_details()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed text[] := '{}';
begin
  -- ::text on every literal. `text[] || 'name'` makes Postgres try to read the
  -- literal AS an array — the fault that took down behaviour-log edits when
  -- db/065 first went in.
  if new.name is distinct from old.name then
    changed := changed || format('name, was "%s"', old.name);
  end if;
  if new.suburb is distinct from old.suburb then
    changed := changed || 'suburb'::text;
  end if;
  if new.state is distinct from old.state then
    changed := changed || 'state'::text;
  end if;
  if new.timezone is distinct from old.timezone then
    changed := changed || format('timezone %s to %s', old.timezone, new.timezone);
  end if;
  if new.abn is distinct from old.abn then
    changed := changed || 'ABN'::text;
  end if;

  if array_length(changed, 1) is null then
    return null;
  end if;

  insert into public.admin_audit_events
    (actor_id, school_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    new.id,
    'school.details_changed',
    new.id,
    new.name,
    'Changed ' || array_to_string(changed, ', ') || '.'
  );
  return null;
end;
$$;

drop trigger if exists audit_organisation_details on public.organisations;
create trigger audit_organisation_details
  after update on public.organisations
  for each row execute function public.audit_organisation_details();

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
-- Signed in as a SCHOOL ADMIN, from the browser console:
--
--   await supabase.from('schools').update({ suburb: 'Parramatta' })
--     .eq('id', '<their own id>').select('id')      // one row
--
--   await supabase.from('schools').update({ status: 'active' })
--     .eq('id', '<their own id>')                   // refused, 42501
--
-- And an entry appears on the Audit Log naming the school, what changed, and
-- what it was before.
-- ---------------------------------------------------------------------------
