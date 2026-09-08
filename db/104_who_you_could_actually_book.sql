-- ---------------------------------------------------------------------------
-- 104 — Who you could actually book
-- ---------------------------------------------------------------------------
-- db/102 recorded working hours and db/103 built the asking. Measured against
-- the live database, an individual signed in and asked how many specialists
-- they could see:
--
--     specialists an individual can see: 0
--
-- Which is correct — `profiles` is not a directory, and an individual has no
-- school, no caseload and no relationship to anybody in it. It also means the
-- booking screen has nothing to put in a dropdown, so the two files before
-- this one are unreachable without a fourth.
--
-- ---------------------------------------------------------------------------
-- A VIEW, AND WHAT IS DELIBERATELY NOT IN IT
-- ---------------------------------------------------------------------------
-- Not the email address, not the phone number, not the school, not the
-- verification paperwork. A name, a picture and the fact that Special Miles
-- has verified them — which is what somebody needs to decide whether to ask
-- for an hour, and nothing more.
--
-- Opening `profiles` to individuals with a policy would have been the smaller
-- diff and the wrong one: a policy admits ROWS, and the columns nobody should
-- see would come with them.
--
-- ---------------------------------------------------------------------------
-- TWO CONDITIONS, BOTH OF WHICH ARE THE PRODUCT BEING HONEST
-- ---------------------------------------------------------------------------
-- VERIFIED ONLY. db/013 built a verification gate because Special Miles vouches
-- for the people in its network. Listing somebody unverified as bookable would
-- be that promise quietly withdrawn at the point it matters most.
--
-- AND ONLY IF THEY HAVE HOURS. A specialist who has never set their
-- availability has nothing to offer, and appearing in a list that leads to an
-- empty calendar is worse than not appearing — the person concludes the
-- product is broken rather than that nobody is free. This is the same rule
-- db/097's sample module follows: never show a door that opens onto nothing.
-- ---------------------------------------------------------------------------

begin;

create or replace view public.bookable_specialists as
select
  p.id,
  p.full_name,
  p.avatar_path,
  (
    select count(*)
    from public.specialist_availability a
    where a.specialist_id = p.id
  )::int as availability_bands
from public.profiles p
where p.role = 'specialist'
  and p.is_verified
  and exists (
    select 1
    from public.specialist_availability a
    where a.specialist_id = p.id
  );

comment on view public.bookable_specialists is
  'Verified specialists who have set working hours, with only the columns '
  'somebody needs to decide whether to ask for an hour. See db/104.';

revoke all on public.bookable_specialists from public, anon;
grant select on public.bookable_specialists to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it. As an individual, this must now return the verified specialists
-- who have hours, and nothing about anybody else:
--
--   select full_name, availability_bands from public.bookable_specialists;
--
-- And a specialist who clears their availability must vanish from it.
-- ---------------------------------------------------------------------------
