-- ---------------------------------------------------------------------------
-- 083 — Making the database ask for the second factor, not just the browser
-- ---------------------------------------------------------------------------
-- IN db/proposed/ ON PURPOSE, AND THAT IS THE ONLY REASON IT IS NOT IN db/.
-- scripts/apply-db.mjs picks up every `NNN_*.sql` sitting directly in db/ that
-- it has not already recorded, so a file left there is applied by the next run
-- of that script for any unrelated reason — which is not how a change that can
-- empty the roster for everyone currently signed in should arrive.
--
-- To apply it, move it into db/ first:
--     git mv db/proposed/083_*.sql db/
--     node scripts/apply-db.mjs
--     npm test
-- ---------------------------------------------------------------------------
-- src/lib/roles.ts says why four roles must have two-factor authentication:
--
--     Everyone here can open records about identifiable children — a stolen
--     password should not be enough on its own.
--
-- Today that sentence is enforced in exactly one place: ProtectedRoute.tsx, in
-- the browser. The file's own comment is honest about what that is worth —
-- "This is CONVENIENCE, not security. It runs in the browser, where anyone can
-- edit it... The actual protection is Row-Level Security."
--
-- Except Row-Level Security never got told. Measured on 4 September 2026:
--
--     0 of 127 policies look at the authentication assurance level.
--
-- Every policy asks what your ROLE is and none asks whether you passed the
-- second factor. The publishable key ships in the JavaScript bundle by design,
-- so a stolen educator password plus that key reads children's behaviour
-- records, safeguarding flags and messages without ever meeting a code prompt.
-- The browser gate is not in the path; it is a different program.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS ENFORCES, AND WHAT IT DELIBERATELY DOES NOT
-- ---------------------------------------------------------------------------
-- The rule below is: IF YOU HAVE AN AUTHENTICATOR, YOU MUST HAVE USED IT.
--
-- It is not the stronger rule — "every staff session must be aal2" — and the
-- reason is worth stating rather than hiding. The RLS suite signs in with
-- `signInWithPassword` and enrols no factors, so every one of its users sits at
-- aal1 with a staff role. The strict rule fails all 484 tests in 30 files, and
-- a security change whose first effect is a red suite gets reverted rather than
-- understood. Reaching the strict rule means teaching tests/helpers/world.ts to
-- enrol TOTP and complete a challenge; that is real work and it is not this
-- file.
--
-- So the gap that remains is a staff account that has never enrolled at all.
-- Today that is one account, educator1@gmail.com, and ProtectedRoute already
-- marches it to /account/security on every sign-in. The other eight staff
-- accounts are enrolled, and for those eight a stolen password stops being
-- enough the moment this is applied.
--
-- ---------------------------------------------------------------------------
-- WHY THE WAY OUT STAYS OPEN
-- ---------------------------------------------------------------------------
-- `profiles_select_own` is `(id = auth.uid())` and is left alone on purpose.
-- Somebody held at aal1 can still read their own profile, so the app can load,
-- name them, and take them to the enrolment form. Gating that policy too would
-- lock the only door out of the state this file creates.
--
-- Parents and students are untouched. They are single-factor by design — see
-- MFA_REQUIRED_ROLES — and `is_guardian_of()` is deliberately not gated below.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. The rule, in one place
-- ---------------------------------------------------------------------------
create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Anonymous, or a role that is single-factor by design.
    not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in (
          'educator', 'specialist', 'school_admin', 'platform_admin'
        )
    )
    -- Staff who have never enrolled. There is no factor to demand yet, and
    -- refusing here would deny the profile read that gets them to the form.
    or not exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = auth.uid()
        and f.status = 'verified'
    )
    -- Staff with an authenticator: it must have been used in THIS session.
    -- Supabase puts the level in the token, so this costs no extra read.
    or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

comment on function public.mfa_satisfied() is
  'True unless the caller holds a staff role, has a verified authenticator, and '
  'has not completed the second factor in this session. See db/083.';

revoke all on function public.mfa_satisfied() from anon;
grant execute on function public.mfa_satisfied() to authenticated;


-- ---------------------------------------------------------------------------
-- 2. The five helpers that assert something about staff
-- ---------------------------------------------------------------------------
-- Chosen by reading which functions actually decide staff access, not by
-- gating everything that moves:
--
--   my_role()                127 policies read it; the main lever
--   is_platform_admin()       53 policies, and used standalone
--   is_school_admin()         24 policies, and used standalone
--   is_assigned_staff_for()   staff-only by definition; can_view_student()
--                             reaches data through it
--   am_i_verified()           6 policies use it WITHOUT a role check beside it
--
-- can_view_student() needs no change: it is composed from four of the above,
-- and its guardian branch stays open, which is correct.
-- ---------------------------------------------------------------------------

create or replace function public.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and public.mfa_satisfied();
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
  ) and public.mfa_satisfied();
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
  ) and public.mfa_satisfied();
$$;


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
  ) and public.mfa_satisfied();
$$;


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
  ) and public.mfa_satisfied();
$$;


-- ---------------------------------------------------------------------------
-- BEFORE YOU APPLY THIS
-- ---------------------------------------------------------------------------
-- Everyone already signed in stays signed in, and a session that never
-- completed a challenge is aal1 until it is replaced. So any enrolled staff
-- member currently working will start getting empty screens rather than an
-- error, because RLS returns no rows rather than refusing loudly. They sign out
-- and back in, complete the code prompt, and it is over. Tell the team before
-- applying, not after — an unexplained empty roster reads as data loss.
--
-- Run the suite straight afterwards. It should stay at 484 passing: its users
-- have no factors, so they take the second branch above.
--
-- ---------------------------------------------------------------------------
-- TO UNDO
-- ---------------------------------------------------------------------------
-- Re-run db/003_rls_helpers.sql and db/013_verification_gate.sql, which define
-- these five functions without the gate, then drop public.mfa_satisfied().
-- Nothing else in this file changes a table, a policy or a row.
