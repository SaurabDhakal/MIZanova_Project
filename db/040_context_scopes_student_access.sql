-- ===========================================================================
-- 040_context_scopes_student_access.sql — working somewhere means seeing there
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHAT WAS WRONG.
--
-- db/039 gave people memberships at several organisations and an active
-- context saying which one they are working at. The context switcher moved
-- that pointer correctly — and nothing on screen changed.
--
-- Because `can_view_student` never asked. Its staff branch is:
--
--   or public.is_assigned_staff_for(p_student_id)
--
-- and that function answers one question: is there a row in student_educators
-- linking this person to this child. It has no opinion about schools.
--
-- So a specialist who switched to Rosebank Montessori kept seeing all four
-- Parramatta children, because they are still assigned to them. The dropdown
-- said "You only see records for the place you are working in", and that was
-- simply untrue.
--
-- NOT A BREACH — they are entitled to those children either way. It is
-- cross-tenant bleed, which is the thing a school asks about first: while I am
-- working in your building, whose children are on your screen.
--
-- ---------------------------------------------------------------------------
-- THE FIX
-- ---------------------------------------------------------------------------
-- Assigned staff see a child only while working at that child's organisation.
--
-- For everybody with one membership this changes nothing at all: their active
-- context is the only school they have, and every child they are assigned to
-- is at it. It only bites where it should — somebody who genuinely works in
-- two places, looking at one of them.
--
-- GUARDIANS ARE UNTOUCHED. A parent has no organisation and no context; they
-- reach their child through student_guardians, and always will.
--
-- PLATFORM ADMINS ARE UNTOUCHED. Seeing across every tenant is the role.
--
-- ---------------------------------------------------------------------------
-- THE CONSEQUENCE WORTH STATING
-- ---------------------------------------------------------------------------
-- A specialist can no longer see their whole caseload on one screen when it
-- spans schools. That is a real loss, and it is the right trade: a combined
-- view would mean one school's children appearing under another school's name,
-- and no school would accept that. If a combined caseload is wanted later it
-- should be a deliberate screen that labels each child's school, not an
-- accident of a policy that forgot to ask.

begin;

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
        or (
          public.is_assigned_staff_for(p_student_id)
          -- NEW: and only while working at that child's organisation.
          and exists (
            select 1 from public.students s
            where s.id = p_student_id
              and s.school_id = public.my_school_id()
          )
        )
      )
    );
$$;


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
        or (
          public.is_assigned_staff_for(p_student_id)
          and exists (
            select 1 from public.students s
            where s.id = p_student_id
              and s.school_id = public.my_school_id()
          )
        )
      )
    )
    -- Outside the verification AND the context conditions, deliberately. A
    -- parent's access to their own child depends on neither.
    or public.is_guardian_of(p_student_id);
$$;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
-- As a specialist with memberships at two schools, switch between them: the
-- caseload should show that school's children and no others. Switching back
-- should bring the first school's children back.
--
-- Nobody with a single membership should notice anything. If a normal teacher
-- suddenly sees no students, their profile's school_id and the school of the
-- students they are assigned to have drifted apart:
--
--   select p.full_name, so.name as working_at, st.first_name, s2.name as child_at
--   from public.student_educators se
--   join public.profiles p on p.id = se.profile_id
--   join public.students st on st.id = se.student_id
--   join public.organisations s2 on s2.id = st.school_id
--   left join public.organisations so on so.id = p.school_id
--   where p.school_id is distinct from st.school_id;
--
-- Any row is somebody assigned to a child at a school they are not currently
-- working at — which after db/036 should only happen for genuine multi-school
-- staff.
-- ---------------------------------------------------------------------------
