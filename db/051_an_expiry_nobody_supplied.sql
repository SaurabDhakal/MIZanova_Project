-- ===========================================================================
-- 051_an_expiry_nobody_supplied.sql — a date this software made up
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- db/048 seeds a screening record from every approved application. For an NDIS
-- Worker Screening Check it had no expiry date to seed — db/047's form asks for
-- the number and never asks when it runs out — so it wrote:
--
--     current_date + 30
--
-- with a comment calling it a placeholder that would "read as expiring and
-- prompt somebody to put the real one in".
--
-- THAT REASONING DOES NOT SURVIVE SEEING IT ON THE SCREEN. The card says:
--
--     NDIS Worker Screening Check · 4516497 · expires 5 September 2026
--
-- It does not say "we made this up". It states a date about a child-safety
-- check as though somebody had supplied it, and in thirty days it will say
-- EXPIRED about a check that may be perfectly current — or, if anyone edits it
-- forward, VALID about one that is not. A number this software invented, shown
-- as a record, is the fault this project has caught nine times wearing a
-- different coat: not a count that was never taken, but a date nobody ever gave.
--
-- The honest state is "we do not know", and until now the column could not hold
-- it.
--
-- ---------------------------------------------------------------------------
-- THREE CHANGES, ONE PROBLEM
-- ---------------------------------------------------------------------------
--   1. `expires_on` may be null, and the report calls that `unknown` rather
--      than sorting it in among real dates.
--   2. The invented rows are set back to null. They are precisely
--      identifiable: seeded NDIS rows are the only ones with a
--      source_application_id.
--   3. The application form starts asking, so this stops happening. A number
--      with no date is half a record, and the half that is missing is the half
--      that expires.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. "We do not know" becomes representable
-- ---------------------------------------------------------------------------
alter table public.staff_screening
  alter column expires_on drop not null;

comment on column public.staff_screening.expires_on is
  'When this check runs out. NULL means nobody has told us — which is a worse '
  'state than an expired one, because nothing can be inferred from it. It is '
  'never to be filled in with a guess.';


-- ---------------------------------------------------------------------------
-- 2. Un-invent the dates
-- ---------------------------------------------------------------------------
-- Only the seeded NDIS rows. A check recorded by a person through the screen
-- has no source_application_id and a date they read off a register, and must
-- not be touched.
update public.staff_screening
   set expires_on = null
 where check_type = 'ndis'
   and source_application_id is not null
   and ended_at is null;


-- ---------------------------------------------------------------------------
-- 3. The report tells the three states apart
-- ---------------------------------------------------------------------------
-- REPRODUCED IN FULL. `create or replace view` replaces the whole definition,
-- and rebuilding one from memory is how db/046 silently deleted db/036. Column
-- names, types and order are unchanged; only the CASE gains a branch.
create or replace view public.screening_overview
with (security_invoker = true) as
select
  s.id,
  s.profile_id,
  s.email,
  s.check_type,
  s.state,
  s.number,
  s.expires_on,
  s.verified_at,
  p.full_name,
  -- Null rather than a large number when there is no date. "999 days left"
  -- would sort an unknown check to the safe end of a list ordered by urgency.
  (s.expires_on - current_date) as days_remaining,
  case
    -- FIRST, because it is the most urgent and the easiest to hide. A check
    -- with no expiry cannot be trusted at all, where an expired one at least
    -- tells you what happened and when.
    when s.expires_on is null then 'unknown'
    when s.expires_on < current_date then 'expired'
    -- SIXTY DAYS because a WWCC renewal is not instant and a school term is
    -- ten weeks. Warning somebody the week it lapses is telling them after it
    -- is too late to act without disruption.
    when s.expires_on < current_date + 60 then 'expiring'
    else 'valid'
  end as state_of_check,
  s.last_reminded_at
from public.staff_screening s
left join public.profiles p on p.id = s.profile_id
where s.ended_at is null;


-- ---------------------------------------------------------------------------
-- 4. Stop collecting half a record
-- ---------------------------------------------------------------------------
alter table public.specialist_applications
  add column if not exists ndis_expiry date;

comment on column public.specialist_applications.ndis_expiry is
  'When their NDIS Worker Screening Check runs out. Asked for because db/048 '
  'otherwise had to invent one, and did.';

-- The immutability trigger must know about the new column, or a reviewer could
-- quietly edit the one screening date on the application while every other
-- field stayed protected. REPRODUCED IN FULL for the same reason as the view.
create or replace function public.specialist_applications_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.full_name, new.email, new.phone, new.date_of_birth, new.profession,
      new.profession_other, new.registration_body, new.registration_number,
      new.years_experience, new.regions, new.about, new.wwcc_state,
      new.wwcc_number, new.wwcc_expiry, new.ndis_screening_number,
      new.ndis_expiry, new.created_at)
     is distinct from
     (old.full_name, old.email, old.phone, old.date_of_birth, old.profession,
      old.profession_other, old.registration_body, old.registration_number,
      old.years_experience, old.regions, old.about, old.wwcc_state,
      old.wwcc_number, old.wwcc_expiry, old.ndis_screening_number,
      old.ndis_expiry, old.created_at)
  then
    raise exception
      'An application records what somebody claimed. Only its status and '
      'review note can change.'
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'new' then
      new.reviewed_at := null;
      new.reviewed_by := null;
    else
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
    end if;

    -- Set on first approval and never moved afterwards. See the column note.
    if new.status = 'approved' and old.approved_at is null then
      new.approved_at := now();
    else
      new.approved_at := old.approved_at;
    end if;
  else
    new.approved_at := old.approved_at;
  end if;

  return new;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
-- The invented dates are gone and read as unknown rather than as a deadline:
--
--   select email, check_type, expires_on, days_remaining, state_of_check
--     from public.screening_overview order by check_type;
--
-- The NDIS row must show a null expiry and 'unknown'.
