-- ---------------------------------------------------------------------------
-- 086 — An account promoted out of `student` stops being that student
-- ---------------------------------------------------------------------------
-- Found on 5 September 2026 by reusing an address. lazysaurab@gmail.com was
-- invited as a student and accepted, which set `students.profile_id` on Ethan
-- Mitchell's row to that account — that is how db/074 gives a child a sign-in.
-- The same address was then invited as an educator and accepted.
--
-- `redeem_invitation` changed the role. Nothing changed the link. So:
--
--     profiles.role      = 'educator', verified, at the school
--     students.profile_id -> that same account, on Ethan Mitchell
--     student_educators   = no assignment to anybody
--
-- A verified educator, assigned to no child, still named as the account that
-- IS one.
--
-- ---------------------------------------------------------------------------
-- NOTHING IS EXPOSED TODAY, AND THE REASON IS WORTH WRITING DOWN
-- ---------------------------------------------------------------------------
-- Measured before writing this: that account reads 0 students and 0 goals, and
-- `my_student_id()` returns null. db/074 requires a live
-- `student_portal_access` consent as well as the link, and Ethan Mitchell has
-- no consent rows at all.
--
-- So the only thing standing between a stale link and a child's goals is a
-- consent the family has not happened to give. "Your child's own sign-in" is
-- one of six switches on the family's Privacy screen and granting it is an
-- ordinary thing to do. On the day they did, an unassigned educator would
-- quietly acquire student-level access to that child — through the identity
-- path, going around `is_assigned_staff_for()` entirely, with nothing on any
-- screen to show it had happened.
--
-- A latent hole that a family opens by consenting is worse than a live one,
-- because nobody is looking when it opens.
--
-- ---------------------------------------------------------------------------
-- THREE PARTS, AND THE ORDER MATTERS
-- ---------------------------------------------------------------------------
-- 1. Harden the function, so a stale link grants nothing even if one exists.
-- 2. Clear the link when a role moves away from student, so they stop existing.
-- 3. Clean up the rows already there.
--
-- Part 1 alone would close the hole. Parts 2 and 3 are there because a row
-- saying an educator is a child is wrong even when nothing reads it, and the
-- next person to write a query against `students.profile_id` should not have to
-- know this story.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. The function refuses anybody who is not a student
-- ---------------------------------------------------------------------------
-- The role is read straight from `profiles` rather than through `my_role()`,
-- deliberately. db/083 (proposed) makes `my_role()` depend on the caller's
-- authentication assurance level, and whether a student may see their own goals
-- has nothing to do with two-factor — coupling them here would mean a change to
-- the MFA rule silently changing what a child can open.
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
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'student'
    )
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
-- 2. Leaving the student role releases the student row
-- ---------------------------------------------------------------------------
-- On `profiles` rather than in the accept endpoint, because the role is changed
-- by `redeem_invitation` — a database function — and could be changed again by
-- a future one, or by hand in SQL during a support call. The rule belongs where
-- every path has to pass it.
-- ---------------------------------------------------------------------------
create or replace function public.release_student_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'student' and new.role <> 'student' then
    update public.students
       set profile_id = null
     where profile_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_release_student_link on public.profiles;
create trigger profiles_release_student_link
  after update of role on public.profiles
  for each row
  when (old.role is distinct from new.role)
  execute function public.release_student_link();


-- ---------------------------------------------------------------------------
-- 3. The rows already wrong
-- ---------------------------------------------------------------------------
-- One at the time of writing. Written as a set so it stays correct whenever it
-- is run, rather than naming the account.
-- ---------------------------------------------------------------------------
update public.students s
   set profile_id = null
 where s.profile_id is not null
   and exists (
     select 1
     from public.profiles p
     where p.id = s.profile_id
       and p.role <> 'student'
   );


-- ---------------------------------------------------------------------------
-- Check it. Both should be 0.
-- ---------------------------------------------------------------------------
--   select count(*) as students_linked_to_a_non_student
--   from public.students s
--   join public.profiles p on p.id = s.profile_id
--   where p.role <> 'student';
--
-- And, signed in as the promoted account:
--   select public.my_student_id();   -- null
