-- ===========================================================================
-- MiZanova — 004_rls_policies.sql
-- Who may read and write each row. This file IS the access control system.
--
-- Run 001, 002 and 003 first. SAFE TO RUN TWICE.
-- ===========================================================================
--
-- TWO WORDS YOU NEED TO KNOW
-- ---------------------------------------------------------------------------
--   USING      — which existing rows you are allowed to SEE or touch.
--                Applies to select, update, delete.
--   WITH CHECK — what the row is allowed to LOOK LIKE after you write it.
--                Applies to insert and update.
--
-- Both matter. `using` alone on an update would let a teacher take a student
-- row they can see and reassign it to another school. `with check` is what
-- stops the row leaving their control on the way out.
--
-- HOW MULTIPLE POLICIES COMBINE
-- ---------------------------------------------------------------------------
-- Policies for the same command are OR-ed together: if ANY policy grants
-- access, access is granted. So each one below is a separate, readable reason
-- to be allowed in, rather than one giant unreadable boolean. If NO policy
-- matches, access is refused — that is what makes "deny by default" work.
--
-- `to authenticated` means the policy only applies to signed-in users.
-- Anonymous visitors match no policy at all and therefore get nothing.
-- ===========================================================================


-- ###########################################################################
-- profiles
-- ###########################################################################

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_select_platform_admin on public.profiles;
create policy profiles_select_platform_admin
  on public.profiles for select to authenticated
  using (public.is_platform_admin());

drop policy if exists profiles_select_school_admin on public.profiles;
create policy profiles_select_school_admin
  on public.profiles for select to authenticated
  using (public.is_school_admin() and school_id = public.my_school_id());

-- Staff can see the other STAFF at their school — the directory in the Figma
-- designs. Deliberately excludes parent profiles: a teacher has no reason to
-- browse a list of every parent in the school.
drop policy if exists profiles_select_staff_directory on public.profiles;
create policy profiles_select_staff_directory
  on public.profiles for select to authenticated
  using (
    public.my_role() in ('educator', 'specialist')
    and school_id = public.my_school_id()
    and role in ('educator', 'specialist', 'school_admin')
  );

-- You may edit your own profile. WHICH COLUMNS you may edit is controlled by
-- the column grants at the bottom of this file, not here — RLS works on whole
-- rows and cannot express "everything except role".
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT policy, on purpose. Profiles are created only by the signup
-- trigger from 001. No DELETE policy either — accounts are removed through
-- Supabase auth, which cascades.


-- ###########################################################################
-- schools
-- ###########################################################################

drop policy if exists schools_select_own on public.schools;
create policy schools_select_own
  on public.schools for select to authenticated
  using (id = public.my_school_id() or public.is_platform_admin());

-- Only Special Miles staff create or change schools (tenants).
drop policy if exists schools_write_platform_admin on public.schools;
create policy schools_write_platform_admin
  on public.schools for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());


-- ###########################################################################
-- students
-- ###########################################################################

-- The whole access model in one line. See can_view_student() in 003.
drop policy if exists students_select on public.students;
create policy students_select
  on public.students for select to authenticated
  using (public.can_view_student(id));

-- Adding a student: school admins and educators, and only into their OWN
-- school. The with check on school_id is what stops someone creating a student
-- inside a different tenant.
drop policy if exists students_insert on public.students;
create policy students_insert
  on public.students for insert to authenticated
  with check (
    public.is_platform_admin()
    or (
      public.my_role() in ('school_admin', 'educator')
      and school_id = public.my_school_id()
    )
  );

-- Editing a student: staff only, never guardians. A parent can see their
-- child's record; they cannot rewrite it.
drop policy if exists students_update on public.students;
create policy students_update
  on public.students for update to authenticated
  using (
    public.is_platform_admin()
    or (public.is_school_admin() and school_id = public.my_school_id())
    or (
      public.my_role() in ('educator', 'specialist')
      and public.is_assigned_staff_for(id)
    )
  )
  with check (
    public.is_platform_admin()
    or school_id = public.my_school_id()
  );

-- No DELETE policy. Students are deactivated (is_active = false), never
-- deleted, so behaviour history and the audit trail survive.


-- ###########################################################################
-- student_guardians — who is linked to which child
-- ###########################################################################

drop policy if exists student_guardians_select on public.student_guardians;
create policy student_guardians_select
  on public.student_guardians for select to authenticated
  using (public.can_view_student(student_id));

-- Only admins create these links. This is the single most sensitive write in
-- the system: inserting a row here grants a person access to a child's
-- records. It is never self-service.
drop policy if exists student_guardians_write on public.student_guardians;
create policy student_guardians_write
  on public.student_guardians for all to authenticated
  using (
    public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
  )
  with check (
    public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
  );


-- ###########################################################################
-- student_educators — staff assignments and specialist caseloads
-- ###########################################################################

drop policy if exists student_educators_select on public.student_educators;
create policy student_educators_select
  on public.student_educators for select to authenticated
  using (public.can_view_student(student_id));

-- Same reasoning: assigning staff to a child is an administrative act.
-- A teacher cannot add themselves to a student they are curious about.
drop policy if exists student_educators_write on public.student_educators;
create policy student_educators_write
  on public.student_educators for all to authenticated
  using (
    public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
  )
  with check (
    public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
  );


-- ###########################################################################
-- consents — FR25
-- ###########################################################################

drop policy if exists consents_select on public.consents;
create policy consents_select
  on public.consents for select to authenticated
  using (public.can_view_student(student_id));

-- Consent is GIVEN BY the guardian. The `granted_by = auth.uid()` clause means
-- a guardian cannot record consent as if it came from someone else.
drop policy if exists consents_insert on public.consents;
create policy consents_insert
  on public.consents for insert to authenticated
  with check (
    (public.is_guardian_of(student_id) and granted_by = auth.uid())
    or public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
  );

-- Withdrawing consent: the guardian, or an admin acting on a written request.
drop policy if exists consents_update on public.consents;
create policy consents_update
  on public.consents for update to authenticated
  using (
    public.is_guardian_of(student_id)
    or public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
  )
  with check (
    public.is_guardian_of(student_id)
    or public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
  );

-- No DELETE policy. "Consent was given on 3 March and withdrawn on 9 May" is
-- itself the record you must be able to produce. Deleting it destroys the
-- evidence that the withdrawal was honoured.


-- ###########################################################################
-- Column-level grants — the hole RLS cannot plug
-- ###########################################################################
-- RLS decides WHICH ROWS you may touch. It cannot say "this row, but not the
-- role column". Without the grants below, `profiles_update_own` would let any
-- signed-in user run:
--
--     update profiles set role = 'platform_admin' where id = auth.uid();
--
-- …and hand themselves the entire platform. That is the same hole the signup
-- trigger closes at registration; this closes it afterwards.
--
-- Column privileges are the right tool: a user may update their own name, and
-- the database refuses even to consider a write to role, school_id or
-- is_verified. Those change only through the SQL editor or, later, a
-- deliberate security definer function with its own audit trail.
revoke update on public.profiles from authenticated;
grant  update (first_name, last_name) on public.profiles to authenticated;

-- Defence in depth: anonymous visitors have no business touching these tables
-- at all. RLS already refuses them, but a table they cannot reach is better
-- than a table they can reach and are then denied.
revoke all on public.profiles          from anon;
revoke all on public.schools           from anon;
revoke all on public.students          from anon;
revoke all on public.student_guardians from anon;
revoke all on public.student_educators from anon;
revoke all on public.consents          from anon;


-- ---------------------------------------------------------------------------
-- Done. Run db/verify.sql — `policies` should now list 17 names:
--   profiles          5   schools           2   students   3
--   student_guardians 2   student_educators 2   consents   3
-- ---------------------------------------------------------------------------
