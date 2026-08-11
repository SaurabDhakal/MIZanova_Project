-- ===========================================================================
-- 039_organisations_and_memberships.sql — one identity, many memberships
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. COMMIT FIRST — this is
-- the largest structural change since db/001, and the free tier has no backup
-- but the files in db/ and `npm run backup`.
--
-- RUN `npm run backup` BEFORE THIS ONE. Not because it is expected to fail —
-- it renames a table and adds two — but because "expected to" is not a plan.
--
-- ---------------------------------------------------------------------------
-- THE PROBLEM
-- ---------------------------------------------------------------------------
-- `profiles.role` is one column and `profiles.school_id` is one column, so a
-- person is exactly one thing at exactly one place. Five ordinary situations
-- already break that, and at two hundred schools every one of them is common:
--
--   a specialist working across four schools          — 20-30 per school
--   a parent with children at two schools
--   a teacher who is also a parent at the same school
--   a Montessori guide who is a member of a centre AND an individual customer
--   somebody who changes schools in January
--
-- ---------------------------------------------------------------------------
-- THE DESIGN, AND WHY IT IS NOT WHAT IT FIRST LOOKS LIKE
-- ---------------------------------------------------------------------------
-- The obvious move is to delete `profiles.role`, replace it with memberships,
-- and rewrite all eighty-four policies to ask "does this person hold a role at
-- the organisation this row belongs to". That is correct, enormous, and would
-- touch every security rule in the product at once.
--
-- What is built instead separates two questions that were previously the same
-- one:
--
--   memberships               WHAT YOU MAY BE.  Source of truth. Many rows.
--   profiles.role/school_id   WHAT YOU CURRENTLY ARE.  Active context. One row.
--
-- Switching context is a function that checks a membership exists and then
-- moves the pointer. Every existing policy keeps asking `my_role()` and
-- `my_school_id()` and keeps getting one answer, because at any moment a person
-- IS acting as one role at one organisation.
--
-- This is how multi-tenant products actually work — a current workspace, chosen
-- from the ones you belong to — and it is the reason this migration can land
-- without rewriting a single policy.
--
-- IT ALSO TIGHTENS SECURITY RATHER THAN LOOSENING IT. `my_role()` now verifies
-- the pointer against a live membership. Today, an educator whose assignment
-- ends keeps `role = 'educator'` and `school_id` set forever, and nothing
-- notices. After this, ending their membership ends their access on the next
-- request.
--
-- ---------------------------------------------------------------------------
-- WHY `schools` BECOMES `organisations` BY RENAME
-- ---------------------------------------------------------------------------
-- A rename carries every foreign key with it automatically — `students`,
-- `profiles`, `invoices`, `resources` and the rest keep pointing at the same
-- table without a single ALTER. Creating a second table and migrating rows
-- would mean twenty foreign keys, a backfill, and a window where two tables
-- disagree about which schools exist.
--
-- A `schools` VIEW is left behind so nothing that still says `schools` breaks
-- while the application catches up. It is `security_invoker`, so Row-Level
-- Security on the underlying table still applies as the querying user — a view
-- that bypassed RLS would be a hole with a friendly name.

begin;

-- ---------------------------------------------------------------------------
-- 1. schools → organisations
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'schools'
                and table_type = 'BASE TABLE')
  then
    alter table public.schools rename to organisations;
  end if;
end $$;

alter table public.organisations
  add column if not exists kind text not null default 'school',
  add column if not exists status text not null default 'active',
  add column if not exists abn text,
  add column if not exists state text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_kind_check') then
    alter table public.organisations add constraint organisations_kind_check
      check (kind in ('school', 'ecec', 'montessori', 'ndis_provider',
                      'corporate', 'practice'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organisations_status_check') then
    alter table public.organisations add constraint organisations_status_check
      check (status in ('active', 'trial', 'suspended', 'closed'));
  end if;
end $$;

-- Compatibility. Simple views over one table are updatable in Postgres, so
-- existing inserts and reads keep working untouched.
drop view if exists public.schools;
create view public.schools with (security_invoker = true) as
  select id, name, created_at from public.organisations;

grant select, insert, update on public.schools to authenticated;
revoke all on public.schools from anon;


-- ---------------------------------------------------------------------------
-- 2. memberships — what a person MAY be
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  id              uuid primary key default gen_random_uuid(),

  profile_id      uuid not null references public.profiles(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,

  role            public.user_role not null
                    check (role in ('educator', 'specialist', 'school_admin')),

  started_at      timestamptz not null default now(),
  -- ENDED, NOT DELETED. "This person worked here until March" is a fact
  -- somebody asks about after a record has been read by the wrong person.
  ended_at        timestamptz,

  invited_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- One live membership per person, per organisation, per role. They may hold
-- two roles at one school — a specialist who also administers it — but not the
-- same one twice.
create unique index if not exists memberships_one_live
  on public.memberships (profile_id, organisation_id, role)
  where ended_at is null;

create index if not exists memberships_profile_idx
  on public.memberships (profile_id) where ended_at is null;
create index if not exists memberships_org_idx
  on public.memberships (organisation_id) where ended_at is null;

comment on table public.memberships is
  'What a person MAY be. profiles.role + profiles.school_id is what they currently ARE.';


-- ---------------------------------------------------------------------------
-- 3. Backfill from what exists today
-- ---------------------------------------------------------------------------
-- Every current educator, specialist and school admin gets a membership for
-- the school they are already attached to. Parents are deliberately excluded:
-- a parent belongs to a CHILD, through student_guardians, not to a school.
-- Platform admins belong to nothing, which is the point of the role.
insert into public.memberships (profile_id, organisation_id, role, started_at)
select p.id, p.school_id, p.role, coalesce(p.created_at, now())
from public.profiles p
where p.school_id is not null
  and p.role in ('educator', 'specialist', 'school_admin')
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- 4. The helpers everything already calls, now membership-aware
-- ---------------------------------------------------------------------------
-- SAME NAMES, SAME SIGNATURES, SAME ANSWERS FOR EVERY EXISTING CASE. That is
-- deliberate: eighty-four policies call these, and a migration that also
-- rewrites eighty-four policies is a migration nobody can review.

/**
 * What am I acting as right now?
 *
 * NOW VERIFIED. Previously this read profiles.role and trusted it. A staff
 * member whose role or school was set once kept it forever, even after they
 * left — because nothing ever checked again.
 *
 * Parents and platform admins are exempt by design, not by omission: a parent's
 * access comes from being a guardian of a child, and a platform admin belongs
 * to no organisation at all.
 */
create or replace function public.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and (
      p.role in ('parent', 'platform_admin')
      or exists (
        select 1 from public.memberships m
        where m.profile_id = p.id
          and m.organisation_id = p.school_id
          and m.role = p.role
          and m.ended_at is null
      )
    );
$$;

/** Which organisation am I acting at? Same verification. */
create or replace function public.my_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.school_id
  from public.profiles p
  where p.id = auth.uid()
    and (
      p.role in ('parent', 'platform_admin')
      or exists (
        select 1 from public.memberships m
        where m.profile_id = p.id
          and m.organisation_id = p.school_id
          and m.role = p.role
          and m.ended_at is null
      )
    );
$$;

revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated, service_role;
revoke all on function public.my_school_id() from public, anon;
grant execute on function public.my_school_id() to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. New questions, for the screens that will need them
-- ---------------------------------------------------------------------------

/** Everywhere I could be acting, so a person can be offered the choice. */
create or replace function public.my_memberships()
returns table (
  organisation_id   uuid,
  organisation_name text,
  organisation_kind text,
  role              public.user_role,
  is_current        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         o.name,
         o.kind,
         m.role,
         (m.organisation_id = p.school_id and m.role = p.role)
  from public.memberships m
  join public.organisations o on o.id = m.organisation_id
  join public.profiles p on p.id = m.profile_id
  where m.profile_id = auth.uid()
    and m.ended_at is null
  order by o.name, m.role;
$$;

revoke all on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated, service_role;


/**
 * Move the pointer. Refuses anything the caller does not hold a live
 * membership for, so this is safe to expose to a browser — which is the point,
 * because switching schools is something a specialist does several times a day.
 */
create or replace function public.switch_context(
  p_organisation_id uuid,
  p_role            public.user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.memberships m
    where m.profile_id = auth.uid()
      and m.organisation_id = p_organisation_id
      and m.role = p_role
      and m.ended_at is null
  ) then
    raise exception 'You do not have that role at that organisation.'
      using errcode = '42501';
  end if;

  update public.profiles
     set school_id = p_organisation_id,
         role      = p_role
   where id = auth.uid();
end;
$$;

revoke all on function public.switch_context(uuid, public.user_role)
  from public, anon;
grant execute on function public.switch_context(uuid, public.user_role)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 6. Policies on the new tables
-- ---------------------------------------------------------------------------
alter table public.memberships enable row level security;

-- You can see your own. An administrator sees their organisation's, because
-- "who works here" is the question Directory & Access answers.
drop policy if exists memberships_select on public.memberships;
create policy memberships_select
  on public.memberships for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_platform_admin()
    or (public.is_school_admin() and organisation_id = public.my_school_id())
  );

-- NO INSERT POLICY. A membership is granted by accepting an invitation, which
-- runs as service_role — the same reasoning as db/035. Nobody adds themselves
-- to a school by writing a row.

-- Ending one IS an ordinary administrative act.
drop policy if exists memberships_end on public.memberships;
create policy memberships_end
  on public.memberships for update to authenticated
  using (
    public.is_platform_admin()
    or (public.is_school_admin() and organisation_id = public.my_school_id())
  )
  with check (
    public.is_platform_admin()
    or (public.is_school_admin() and organisation_id = public.my_school_id())
  );

revoke all on public.memberships from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked. Run ALL of these.
--
-- 1. Everyone who had a school now has a membership:
--      select count(*) from public.profiles
--       where school_id is not null
--         and role in ('educator','specialist','school_admin');
--      select count(*) from public.memberships where ended_at is null;
--    The two numbers must match.
--
-- 2. The compatibility view still answers:
--      select count(*) from public.schools;
--
-- 3. Nobody lost their role. From the BROWSER as each of the five accounts,
--    the dashboard must still load and show what it did before. If a staff
--    member's screens go empty, their backfilled membership is missing —
--    check step 1 rather than changing a policy.
--
-- 4. `npm test` — 148 assertions. They exercise my_role() and my_school_id()
--    through every policy in the product, which is exactly what changed here.
-- ---------------------------------------------------------------------------
