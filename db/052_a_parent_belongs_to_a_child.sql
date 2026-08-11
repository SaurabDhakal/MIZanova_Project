-- ===========================================================================
-- 052_a_parent_belongs_to_a_child.sql — the parents a school cannot see
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- FIXES A LIVE DEFECT, found while designing the people directory.
--
-- `profiles_select_school_admin` in db/004 reads:
--
--     using (public.is_school_admin() and school_id = public.my_school_id())
--
-- which asks whether the PROFILE carries the school's id. For staff that is
-- exactly right. For a parent it is a question about the wrong thing, and
-- db/039 said so in its own backfill:
--
--   > Parents are deliberately excluded: a parent belongs to a CHILD, through
--   > student_guardians, not to a school.
--
-- The data agrees. On the development database all three parents have children
-- at the same school, and only one of them carries that school's id — the one
-- created by the original seed. The two who arrived through `/link`, which is
-- the real route, have `school_id` null, because nothing in redeeming a
-- guardian code sets it and nothing should.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ACTUALLY BROKEN
-- ---------------------------------------------------------------------------
-- A school administrator could see one parent in three. Not an error, not an
-- empty screen — a shorter list, which is the kind of wrong nobody notices.
--
-- `fetchParentAccounts` feeds the "link a guardian to this child" control in
-- Directory & Access, so an administrator trying to connect a second child to
-- a parent who joined by code simply could not find them. The parent existed,
-- the child existed, and the only way to make the connection was a code that
-- had already been spent.
--
-- ---------------------------------------------------------------------------
-- THE SHAPE, AND WHY IT IS THIS ONE
-- ---------------------------------------------------------------------------
-- The three rules in `05-Resume-Here.md` govern this exactly:
--
--   1. A policy must not query another RLS-protected table inline, or the
--      policies recurse. `student_guardians` has policies of its own.
--   2. A policy must not look up the row it was already handed.
--   3. A policy must ask the question its own row is about.
--
-- The shape that satisfies all three is a `security definer` function taking a
-- value read OFF the row under test — here `profiles.id` — and querying only a
-- DIFFERENT table. That is what this is.
--
-- The existing policy is left alone. Policies are OR'd, so staff keep working
-- exactly as before and parents gain the route that was always the right one.
-- ===========================================================================

begin;

/**
 * Is this person a guardian of a child at the school I am working in?
 *
 * Answers about the CHILD's school, not the guardian's profile. A parent with
 * children at two schools is legitimately visible to both administrators, and
 * only in respect of the child that makes it true.
 */
create or replace function public.is_guardian_at_my_school(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_guardians sg
    join public.students s on s.id = sg.student_id
    where sg.profile_id = p_profile_id
      and s.school_id = public.my_school_id()
  );
$$;

revoke all on function public.is_guardian_at_my_school(uuid) from public, anon;
grant execute on function public.is_guardian_at_my_school(uuid)
  to authenticated, service_role;

comment on function public.is_guardian_at_my_school(uuid) is
  'True when this profile is a guardian of a student at the caller''s current '
  'school. Asks about the child''s school, because that is what makes a parent '
  'a parent AT a school.';


-- A school administrator sees the parents of their students. Nothing else
-- about parents changes: staff cannot browse them (db/004 excludes parent rows
-- from the staff directory policy deliberately), and no parent gains any view
-- of another.
drop policy if exists profiles_select_school_admin_parents on public.profiles;
create policy profiles_select_school_admin_parents
  on public.profiles for select to authenticated
  using (
    public.is_school_admin()
    and role = 'parent'
    and public.is_guardian_at_my_school(id)
  );

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
-- Signed in as a school administrator, this must now return every parent who
-- has a child at their school, not only those whose profile happens to carry
-- the school's id:
--
--   select full_name, school_id from public.profiles where role = 'parent';
--
-- And as an educator it must still return nothing — a teacher has no reason to
-- browse a list of every parent in the school.
