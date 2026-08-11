-- ===========================================================================
-- MiZanova — 003_rls_helpers.sql
-- Small functions the security policies in 004 are built from.
--
-- Run 001 and 002 first. SAFE TO RUN TWICE.
-- ===========================================================================
--
-- WHY THESE EXIST AT ALL — the infinite recursion trap
-- ---------------------------------------------------------------------------
-- The obvious way to write a policy on `profiles` is:
--
--     using ( school_id = (select school_id from profiles where id = auth.uid()) )
--
-- That deadlocks. To decide whether you may read a row in `profiles`, Postgres
-- runs the policy, which reads `profiles`, which runs the policy, which reads
-- `profiles`… Supabase reports it as
-- "infinite recursion detected in policy for relation profiles".
--
-- The fix is `security definer`. A security definer function runs with the
-- privileges of the user who CREATED it (the database owner), and the owner is
-- not subject to RLS. So the lookup happens once, cleanly, without re-entering
-- the policy.
--
-- That power is why each function below is deliberately tiny and read-only:
-- a security definer function is a hole through your security model, so it
-- should do exactly one boring thing. `set search_path = public` is part of
-- that — without it, someone who can create objects could shadow a table name
-- and change what the function actually reads.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Who am I?
-- ---------------------------------------------------------------------------
-- auth.uid() is provided by Supabase: the id of the signed-in user, taken from
-- the JWT. It is null when nobody is signed in, so every function below
-- returns null/false for anonymous visitors — denied by default, for free.

-- Named my_role() rather than current_role() because current_role is a
-- reserved Postgres keyword.
create or replace function public.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;


create or replace function public.my_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id from public.profiles where id = auth.uid();
$$;


create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'platform_admin' from public.profiles where id = auth.uid()),
    false
  );
$$;


create or replace function public.is_school_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'school_admin' from public.profiles where id = auth.uid()),
    false
  );
$$;


-- ---------------------------------------------------------------------------
-- May I see this particular child?
-- ---------------------------------------------------------------------------
-- These three answer the question the whole product turns on. Note that being
-- an educator at a school is NOT enough — you must be assigned to the student.
-- Least privilege: a Year 3 teacher has no business reading Year 6 behaviour
-- records they have no part in.

/** True if I am a guardian linked to this student. */
create or replace function public.is_guardian_of(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_guardians sg
    where sg.student_id = p_student_id
      and sg.profile_id = auth.uid()
  );
$$;


/** True if I am staff assigned to this student (teacher, aide, specialist). */
create or replace function public.is_assigned_staff_for(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_educators se
    where se.student_id = p_student_id
      and se.profile_id = auth.uid()
  );
$$;


/**
 * The single question every student-related policy asks.
 *
 * Order matters only for readability — Postgres short-circuits `or`.
 *   platform_admin  → Special Miles staff, everything
 *   school_admin    → any student at their own school
 *   assigned staff  → their own students only
 *   guardian        → their own children only
 * anyone else, and anonymous visitors → false
 */
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
      public.is_school_admin()
      and exists (
        select 1 from public.students s
        where s.id = p_student_id
          and s.school_id = public.my_school_id()
      )
    )
    or public.is_assigned_staff_for(p_student_id)
    or public.is_guardian_of(p_student_id);
$$;


-- ---------------------------------------------------------------------------
-- Tighten who may call these
-- ---------------------------------------------------------------------------
-- By default Postgres lets everyone execute a new function. These read from
-- protected tables, so anonymous visitors have no business running them.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.my_role()',
    'public.my_school_id()',
    'public.is_platform_admin()',
    'public.is_school_admin()',
    'public.is_guardian_of(uuid)',
    'public.is_assigned_staff_for(uuid)',
    'public.can_view_student(uuid)',
    'public.has_active_consent(uuid, public.consent_type)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- Done. `select public.my_role();` in the SQL editor returns null, which is
-- correct — the SQL editor is not a signed-in application user.
-- ---------------------------------------------------------------------------
