-- ===========================================================================
-- 077_a_student_belongs_to_a_school_without_a_membership.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: my_role() ANSWERS NULL FOR EVERY STUDENT
-- ---------------------------------------------------------------------------
-- db/039 split identity in two. `memberships` is what you MAY be at an
-- organisation; `profiles` is what you currently ARE. `my_role()` returns the
-- profile's role only when one of two things holds:
--
--     p.role in ('parent', 'platform_admin')
--     or a LIVE MEMBERSHIP backs it
--
-- db/074 added `student` and it satisfies neither. `memberships.role` carries a
-- check constraint listing the staff roles, so a student cannot hold one — and
-- the exemption list was written before the role existed.
--
-- So every student account answers null to `my_role()`, and the account still
-- appeared to work: db/074's own policies use `my_student_id()`, which is
-- independent, so goals loaded fine. What silently did not work was anything
-- asking the ORDINARY question. db/075's Academy matches
-- `my_role() = any (audiences)`, so a course published for students reached no
-- student at all.
--
-- FOUND BY RESTORING db/046. Repairing an unrelated mistake put the membership
-- insert back into `redeem_invitation`, which then tried to create a
-- `student` membership and was refused by the constraint — and the refusal is
-- what exposed this. The Academy tests never covered it because they exercise
-- parents and educators; a student against a role-based policy was the case
-- nobody wrote.
--
-- ---------------------------------------------------------------------------
-- A STUDENT IS EXEMPTED, NOT GIVEN A MEMBERSHIP
-- ---------------------------------------------------------------------------
-- The other repair is to widen `memberships_role_check` and let students hold
-- one. That is rejected here.
--
-- A membership means "this person may act in this capacity at this
-- organisation", and everything reading it — the school switcher, staff
-- vetting, `my_memberships()` — means staff by it. A student's link to their
-- school is `students.school_id`, which is not optional, is already unique to
-- them, and is what every other part of the product uses. Adding a second
-- record of the same fact creates two places to end a child's connection to a
-- school and one of them will be forgotten.
--
-- It also puts students in the same position as parents, which is where they
-- belong: a parent has no membership either, because their connection to a
-- school runs through a child rather than through employment.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- Both functions, reproduced whole
-- ---------------------------------------------------------------------------
-- Read back from db/039 rather than rewritten from the idea of them. The last
-- migration to touch a function here rebuilt it from its ANCESTOR and silently
-- deleted two later fixes; the only difference below is 'student' in the
-- exemption list.
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
      -- 'student' joins these two for the same reason they are here: their
      -- belonging is recorded somewhere other than `memberships`.
      p.role in ('parent', 'platform_admin', 'student')
      or exists (
        select 1 from public.memberships m
        where m.profile_id = p.id
          and m.organisation_id = p.school_id
          and m.role = p.role
          and m.ended_at is null
      )
    );
$$;

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
      p.role in ('parent', 'platform_admin', 'student')
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
grant execute on function public.my_role() to authenticated;
revoke all on function public.my_school_id() from public, anon;
grant execute on function public.my_school_id() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
-- Signed in as a student whose school has linked them AND whose guardian has
-- consented:
--
--   select public.my_role();       -- 'student', not null
--   select public.my_school_id();  -- their school
--
-- And the thing this was blocking. With a course published for '{student}':
--
--   select count(*) from public.courses;  -- at least 1
--
-- WIDENING my_role() IS NOT A WIDENING OF ACCESS BY ITSELF — it returns what
-- `profiles.role` already said. Every policy that consumes it still decides on
-- its own terms, and db/074's tests assert that a student reaches no behaviour
-- log, no message, no IEP and no other child. Those must still pass, and they
-- are the reason this is safe to do.
-- ---------------------------------------------------------------------------
