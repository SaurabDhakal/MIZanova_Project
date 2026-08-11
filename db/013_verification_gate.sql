-- ===========================================================================
-- MiZanova — 013_verification_gate.sql
-- Make verification actually gate access to student records (FR18).
--
-- Run 001-012 first. SAFE TO RUN TWICE.
-- ===========================================================================
--
-- ⚠️ READ THIS BEFORE RUNNING
--
-- After this script, UNVERIFIED staff can see no student data at all. Their
-- rosters, dashboards and queues will be empty until a Platform Admin verifies
-- them on the Teacher Verification screen.
--
-- That is the intended behaviour, and it is very likely to lock out the
-- accounts you have been testing with. To fix, verify them — or, in a hurry:
--
--   update public.profiles p set is_verified = true
--   from auth.users u where u.id = p.id and u.email = 'your-email-here';
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- `is_verified` existed but nothing read it. Every staff member could see the
-- students they were assigned to whether or not anyone had checked who they
-- were, while the banner on their own dashboard said records would become
-- available "before" verification. The requirement was a display-only flag and
-- the screen made a promise the system did not keep.
--
-- Guardians are deliberately NOT gated: parents are not identity-verified by
-- the school, and their access comes from being a child's guardian.
--
-- Platform Admins are not gated either, or verifying the first person would be
-- impossible — nobody could ever be verified because nobody was verified.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Am I verified?
-- ---------------------------------------------------------------------------
create or replace function public.am_i_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_verified from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.am_i_verified() from public, anon;
grant execute on function public.am_i_verified() to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. Staff access now requires verification
-- ---------------------------------------------------------------------------
-- Replaces the version from 005. Every policy that calls it inherits the
-- change — behaviour logs, AI strategies, home observations, goals, IEP
-- documents and the safeguarding queue all tighten at once, from one edit.
create or replace function public.can_staff_view_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or (
      public.am_i_verified()
      and (
        (
          public.is_school_admin()
          and exists (
            select 1 from public.students s
            where s.id = p_student_id
              and s.school_id = public.my_school_id()
          )
        )
        or public.is_assigned_staff_for(p_student_id)
      )
    );
$$;


-- ---------------------------------------------------------------------------
-- 3. The same gate on the wider check
-- ---------------------------------------------------------------------------
-- Replaces the version from 003. Note the guardian branch sits OUTSIDE the
-- verification condition: a parent's access is not conditional on the school
-- having checked their identity documents.
create or replace function public.can_view_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or (
      public.am_i_verified()
      and (
        (
          public.is_school_admin()
          and exists (
            select 1 from public.students s
            where s.id = p_student_id
              and s.school_id = public.my_school_id()
          )
        )
        or public.is_assigned_staff_for(p_student_id)
      )
    )
    or public.is_guardian_of(p_student_id);
$$;


-- ---------------------------------------------------------------------------
-- Who is locked out right now?
-- ---------------------------------------------------------------------------
-- Run this after the script to see who needs verifying.
--
--   select u.email, p.role, p.is_verified
--   from public.profiles p join auth.users u on u.id = p.id
--   where p.role in ('educator','specialist','school_admin')
--     and p.is_verified = false;
--
-- No new tables or policies — policy count stays at 48.
-- ---------------------------------------------------------------------------
