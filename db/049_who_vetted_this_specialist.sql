-- ===========================================================================
-- 049_who_vetted_this_specialist.sql — "network specialist" or "our own"?
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- `12-Who-Lets-Whom-In.md` §4 asked for this and named the reason:
--
--   > a school reading a specialist's clinical notes deserves to know which of
--   > those they are.
--
-- A specialist can reach a school by two routes, and they are not equally
-- checked:
--
--   GATE 1 THEN GATE 2   applied at /for-specialists, Special Miles verified
--                        their registration and WWCC at the source, then a
--                        school engaged them.
--   GATE 2 ONLY          a school admin invited them directly, exactly as they
--                        would a teacher. Faster, legitimate, and nobody at
--                        Special Miles has checked anything.
--
-- Both are allowed — that was the recommendation, and it is the school's staff
-- member either way. What was missing is that the two look identical in the
-- directory, so "verified" reads as one thing when it means two.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A FUNCTION AND NOT A VIEW
-- ---------------------------------------------------------------------------
-- The obvious build is a view joining profiles to specialist_applications with
-- `security_invoker`, as db/048 does. IT WOULD BE SILENTLY WRONG.
--
-- A school admin has no select policy on specialist_applications — deliberately,
-- since it holds dates of birth and WWCC numbers. With security_invoker the
-- join reads that table as the CALLER, finds nothing, and reports every
-- specialist as un-vetted. Not an error: a confident wrong answer, on a
-- safeguarding label, in the direction that makes a checked person look
-- unchecked.
--
-- So it is `security definer`, which reads the application table with rights
-- the caller does not have, and answers exactly one question about it. This is
-- the shape the three rules in the resume doc describe: a definer function
-- taking a value off the row under test and querying a DIFFERENT table.
--
-- ---------------------------------------------------------------------------
-- WHAT IT WILL NOT ANSWER
-- ---------------------------------------------------------------------------
-- Only about people who hold a live membership at the caller's own
-- organisation. A function that answered for any profile id would be a way to
-- ask "is this address a vetted specialist?" about anybody on the platform,
-- which is a directory of practitioners that nobody agreed to publish.
--
-- It returns a DATE, not a boolean, and nothing else. Not the WWCC number, not
-- the date of birth, not the application. "Vetted, and when" is the whole of
-- what a school needs to decide whether to trust a set of clinical notes.
-- ===========================================================================

begin;

/**
 * Who among my staff was vetted by Special Miles, and when.
 *
 * One call for the whole directory rather than one per row: a per-row function
 * is forty round trips on a page that already has the list.
 *
 * Output columns are named so they cannot collide with a column in any table
 * this queries. That is not fussiness — db/046 shipped broken because `role`
 * meant both a column and a parameter inside one function.
 */
create or replace function public.my_staff_vetting()
returns table (staff_id uuid, vetted_on timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    max(a.approved_at)
  from public.profiles p
  join public.memberships m
    on m.profile_id = p.id
   and m.ended_at is null
   and m.organisation_id = public.my_school_id()
  join public.specialist_applications a
    on lower(a.email) = lower(p.email)
   and a.approved_at is not null
  group by p.id;
$$;

revoke all on function public.my_staff_vetting() from public, anon;
grant execute on function public.my_staff_vetting() to authenticated, service_role;

comment on function public.my_staff_vetting() is
  'Staff at MY organisation who hold an approved specialist application, and '
  'when it was approved. Returns nothing about anybody else, and nothing from '
  'the application beyond the date.';

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
-- As a school admin, this returns rows only for their own staff:
--
--   select * from public.my_staff_vetting();
--
-- As a parent or an unattached account it must return nothing at all, because
-- my_school_id() is null and the join finds no membership.
