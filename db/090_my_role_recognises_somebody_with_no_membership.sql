-- ---------------------------------------------------------------------------
-- 090 — `my_role()` recognises somebody who belongs to nothing
-- ---------------------------------------------------------------------------
-- db/088 and db/089 added the `individual` role and gave it two courses and an
-- article. Measured immediately afterwards, signed in as a real individual
-- account: courses 0, modules 0, articles 0. Everything the role exists for
-- was invisible.
--
-- `my_role()` is not db/003's one-line version any more. It was rewritten to
-- return a role only when the person's belonging can be PROVEN:
--
--     p.role in ('parent', 'platform_admin', 'student')
--     or exists (an active membership joining the profile to its school)
--
-- That is a good rule. Staff must be members of the school they claim; the
-- three listed roles are exempt because "their belonging is recorded somewhere
-- other than `memberships`" — a parent through student_guardians, a student
-- through students.profile_id, a platform admin by being one.
--
-- `individual` is in neither branch. It is not on the list, and it has no
-- school to hold a membership with — that is the entire point of the role. So
-- my_role() returned null, and every policy shaped
-- `my_role() = any (audiences)` returned nothing. The Academy and the Library
-- were empty for the only role that has nothing else.
--
-- ---------------------------------------------------------------------------
-- WHY ADDING IT TO THE LIST IS THE RIGHT FIX AND NOT A WEAKENING
-- ---------------------------------------------------------------------------
-- The list is not "roles we trust". It is "roles whose belonging is not a
-- membership". An individual's belonging is to nobody, which is a stronger
-- statement than the other three make, not a weaker one: there is no school to
-- verify against because the person is not claiming one.
--
-- And it grants nothing beyond the audience. Checked against the live database
-- as an individual before this file existed: students 0, goals 0, behaviour
-- logs 0, ai_strategies 0, messages 0, consents 0, invoices 0, schools 0, other
-- profiles 0. Every one of those goes through can_view_student(), a membership,
-- or a guardian link, and an individual has none. Returning their role changes
-- only what the audience-driven content policies answer.
--
-- ---------------------------------------------------------------------------
-- db/proposed/083 REWRITES THIS FUNCTION TOO
-- ---------------------------------------------------------------------------
-- If that file is ever applied it must carry this branch with it, or the
-- Academy goes dark for individuals again. It has been updated in place to
-- include it — but if these two are ever reconciled by hand, this is the line
-- that matters.
-- ---------------------------------------------------------------------------

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
      -- 'student' joins these for the same reason they are here: their
      -- belonging is recorded somewhere other than `memberships`.
      -- 'individual' joins them because there is nothing for it to belong to.
      p.role in ('parent', 'platform_admin', 'student', 'individual')
      or exists (
        select 1 from public.memberships m
        where m.profile_id = p.id
          and m.organisation_id = p.school_id
          and m.role = p.role
          and m.ended_at is null
      )
    );
$$;


-- ---------------------------------------------------------------------------
-- Check it. Signed in as an individual:
--   select public.my_role();                          -- 'individual'
--   select count(*) from public.courses;              -- 2
--   select count(*) from public.articles;             -- 1
--   select count(*) from public.students;             -- still 0
-- ---------------------------------------------------------------------------
