-- ===========================================================================
-- 074_a_student_can_have_an_account.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: THE BRIEF NAMES FIVE KINDS OF USER AND THIS PRODUCT HAS FOUR
-- ---------------------------------------------------------------------------
-- Joe Abboud's requirement 1: "multi-user permissions (admin, educators,
-- parents, students, organisations)". The platform is meant to let people
-- "enrol in tailored learning pathways" and reach "Student Development
-- Programs — executive functioning and study skills training, self-advocacy
-- and resilience development".
--
-- A student in this database is a RECORD, not an account. `students` is a row
-- that adults write about; nobody can sign in as one.
--
-- ---------------------------------------------------------------------------
-- THIS IS THE MOST DANGEROUS THING IN THE PROJECT, SO IT IS THE NARROWEST
-- ---------------------------------------------------------------------------
-- Every other role added here widened who could see records ABOUT children.
-- This one lets a child in, and the obvious implementation — "a student is like
-- a parent, but for themselves" — is wrong in a way that causes harm rather
-- than embarrassment.
--
-- A BEHAVIOUR LOG IS NEVER VISIBLE TO THE CHILD IT IS ABOUT. Not the notes, not
-- the intensity, not the count. These are staff observations written for other
-- staff — "meltdown during transitions, high intensity" — and a child reading
-- their own file is a wellbeing incident, not a feature. Self-advocacy means a
-- young person working on their own goals, not reading what adults wrote about
-- them on a bad day.
--
-- A SAFEGUARDING FLAG IS NEVER VISIBLE EITHER, and for a sharper reason: the
-- concern may be about somebody at home, and a student account is most likely
-- opened on a family device. There is no version of this where the child is the
-- right person to learn that a flag exists.
--
-- ---------------------------------------------------------------------------
-- TWO KEYS, BECAUSE ONE IS NOT ENOUGH
-- ---------------------------------------------------------------------------
-- An account exists only when BOTH are true:
--
--   1. the school has linked a profile to the student record, and
--   2. a guardian has given `student_portal_access` consent.
--
-- Either alone is a single point of failure. The school alone would let a
-- school create accounts for children whose families never agreed; the
-- guardian alone would let a family create one at a school that has not set the
-- child up.
--
-- NO AGE THRESHOLD IS WRITTEN HERE, deliberately. `date_of_birth` exists and it
-- would be easy to add "year 7 and above". Whether a particular child should
-- have an account is a judgement about that child — some fifteen-year-olds
-- should not, some ten-year-olds should — and a number in a migration would
-- override the two people who actually know. The school and the guardian
-- deciding together IS the age gate.
--
-- REVOKING CONSENT CLOSES THE DOOR IMMEDIATELY, because the policies below read
-- the consent every time rather than copying a flag onto the profile. db/021
-- already makes consent revocable; this inherits that for free.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The role, and the consent that permits it
-- ---------------------------------------------------------------------------
-- `alter type ... add value` cannot run inside a transaction block in older
-- Postgres and cannot be undone. Guarded so a second run is silent.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'student'
  ) then
    alter type public.user_role add value 'student';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'consent_type' and e.enumlabel = 'student_portal_access'
  ) then
    -- The sibling of 'parent_portal_access' from db/002, which established that
    -- reaching a portal at all is a thing a guardian agrees to.
    alter type public.consent_type add value 'student_portal_access';
  end if;
end $$;

commit;

-- A new enum value cannot be used in the same transaction that created it.
begin;

-- ---------------------------------------------------------------------------
-- 2. The link between a record and an account
-- ---------------------------------------------------------------------------
alter table public.students
  add column if not exists profile_id uuid
    references public.profiles(id) on delete set null;

-- One account per student, one student per account. Without this a profile
-- could be attached to two children and would read both their goals.
create unique index if not exists students_one_profile
  on public.students (profile_id)
  where profile_id is not null;

comment on column public.students.profile_id is
  'The account this student signs in with, if the school has created one. Null is the normal case. An account is only usable while a guardian consent of student_portal_access is also live — see db/074.';


-- ---------------------------------------------------------------------------
-- 3. Which student the signed-in person IS
-- ---------------------------------------------------------------------------
-- Returns null unless BOTH keys are turned: the school has linked the account,
-- and a guardian consent is live. Every policy below is built on this, so the
-- double lock cannot be forgotten in one place and remembered in another.
--
-- security definer because it reads `students` and `consents`, which the
-- student's own policies do not yet admit — the helper is what admits them.
-- ---------------------------------------------------------------------------
create or replace function public.my_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.students s
  where s.profile_id = auth.uid()
    and s.is_active
    and exists (
      select 1 from public.consents c
      where c.student_id = s.id
        and c.consent_type = 'student_portal_access'
        -- db/002 records a consent by its existence and withdraws it with
        -- `revoked_at`; there is no boolean. `granted_at` is not null by
        -- definition, so "live" is exactly "not revoked".
        and c.revoked_at is null
    )
  limit 1;
$$;

revoke all on function public.my_student_id() from public, anon;
grant execute on function public.my_student_id() to authenticated;


-- ---------------------------------------------------------------------------
-- 4. What a student may read
-- ---------------------------------------------------------------------------
-- Additive policies only. Postgres ORs multiple permissive policies together,
-- so nothing here can widen what any other role sees.
-- ---------------------------------------------------------------------------

-- Their own record, so the app can greet them and know their school. Not other
-- children at the school — `id = my_student_id()`, never `school_id = ...`.
drop policy if exists students_select_self on public.students;
create policy students_select_self
  on public.students for select to authenticated
  using (id = public.my_student_id());

-- Their own goals. THIS IS THE POINT OF THE ROLE: a young person working on
-- what they are trying to get better at is what "self-advocacy and resilience
-- development" means in the brief.
drop policy if exists goals_select_student on public.goals;
create policy goals_select_student
  on public.goals for select to authenticated
  using (student_id = public.my_student_id());

drop policy if exists goal_milestones_select_student on public.goal_milestones;
create policy goal_milestones_select_student
  on public.goal_milestones for select to authenticated
  using (
    exists (
      select 1 from public.goals g
      where g.id = goal_milestones.goal_id
        and g.student_id = public.my_student_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. What a student may NOT read, said out loud
-- ---------------------------------------------------------------------------
-- There is deliberately NO policy on behaviour_logs, on safeguarding, on
-- messages, on consents, on iep_documents, on invoices or on student_access_events.
--
-- Written as a comment rather than left to inference, because the absence of a
-- policy is invisible and somebody reading this file later will wonder whether
-- it was decided or forgotten:
--
--   behaviour_logs    — staff observations about the child. See the header.
--   safeguarding      — may concern the child's home. Never.
--   messages          — conversations between the adults in a child's care team.
--   iep_documents     — written for adults, and often names a diagnosis a family
--                       may not have discussed with the child yet. That
--                       conversation belongs to them, not to a login screen.
--   invoices          — a child is not the payer and should not be shown a debt.
--   student_access_events — who read their file is a question for their guardian.
--
-- Any of these becoming visible later is a product decision with a safeguarding
-- dimension, not a policy somebody adds while tidying up.
-- ---------------------------------------------------------------------------

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
--   where t.typname = 'user_role' order by e.enumsortorder;
--   -- 'student' present
--
-- The double lock. With the profile linked but NO consent, this must return
-- null, and every policy above therefore matches nothing:
--
--   select public.my_student_id();
--
-- And the one that matters most. Signed in as a student with both keys turned,
-- ALL THREE of these must return 0:
--
--   select count(*) from public.behaviour_logs;
--   select count(*) from public.messages;
--   select count(*) from public.iep_documents;
--
-- STILL TO BUILD, and named so the role is not mistaken for finished: nothing
-- creates a student account yet. A school administrator needs a control that
-- makes the profile, links it and checks the consent — the same shape as
-- InviteStaffSection. Until that exists, `profile_id` is set by hand.
-- ---------------------------------------------------------------------------
