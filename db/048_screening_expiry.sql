-- ===========================================================================
-- 048_screening_expiry.sql — a check that lapses without anybody noticing
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- db/047 records that somebody's Working With Children Check was verified on a
-- day. Checks are not permanent: they expire, and they are revoked. Approval is
-- a statement about the past, and nothing in this product goes looking to see
-- whether it is still true.
--
-- That is the one gap in gate 1 with a child-safety consequence rather than a
-- commercial one, so it gets its own script.
--
-- ---------------------------------------------------------------------------
-- WHY A NEW TABLE RATHER THAN A COLUMN ON THE APPLICATION
-- ---------------------------------------------------------------------------
-- Two reasons, and the first is a dead end that had to be fixed either way:
--
--   1. `specialist_applications` IS DELIBERATELY IMMUTABLE. Its trigger refuses
--      any edit to what the applicant claimed, which is right — it is evidence
--      of what was checked. But every WWCC expires within five years, so a
--      renewed check could never be recorded anywhere. A specialist renewing
--      would have to re-apply annually, as though they were a stranger.
--
--   2. SCREENING BELONGS TO A PERSON, NOT TO AN APPLICATION. An application is
--      a moment. A person holds a current check, then a different current
--      check. That is a table with one live row and a history behind it — the
--      same shape as `memberships`, and for the same reason: "their check
--      lapsed in March" is a fact somebody asks about later.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT DO, DELIBERATELY: IT REVOKES NOTHING
-- ---------------------------------------------------------------------------
-- An expired check does not end a membership, does not remove an assignment,
-- and does not stop a specialist opening a record. That is not an oversight and
-- it is the part most worth arguing about, so here is the argument:
--
--   * Automatically cutting a working clinician off from their caseload
--     because a date passed would, in practice, most often mean somebody
--     renewed their check and has not told us yet. The cost of being wrong is
--     a child's therapy stopping mid-term.
--
--   * Enforcement cannot be uniform. Screening records exist for specialists,
--     who arrive through gate 1. Educators are verified by their school and
--     have no screening row at all, so any blanket "no access without a valid
--     check" rule would lock out every teacher in the product.
--
--   * Whether a lapsed check should suspend access, and after how long, is a
--     safeguarding POLICY belonging to Special Miles, not a default a
--     developer should pick. It is the sort of thing that has a legal answer.
--
-- So this script makes the fact impossible to miss and leaves the decision to
-- a person. `13-Screening-And-Expiry.md` records the question for Joe.
-- ===========================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'screening_check_type') then
    create type public.screening_check_type as enum (
      'wwcc',  -- Working With Children Check. State-based.
      'ndis'   -- NDIS Worker Screening Check. National, and separate.
    );
  end if;
end $$;

create table if not exists public.staff_screening (
  id uuid primary key default gen_random_uuid(),

  /*
   * NULL UNTIL THEY HAVE AN ACCOUNT, and that is the normal case rather than
   * the exception. A specialist is screened at gate 1, months before any
   * school engages them, and no profile exists until one does. The address is
   * what carries the record across that gap.
   */
  profile_id uuid references public.profiles(id) on delete cascade,

  email text not null
    check (email = lower(email))
    check (btrim(email) <> ''),

  check_type public.screening_check_type not null,

  -- A WWCC is issued by a state; the NDIS check is national, so this is null
  -- for those rather than a made-up value.
  state text check (
    state in ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')
  ),

  number text not null check (btrim(number) <> ''),

  -- The whole point of the table. Not nullable: a check with no expiry is a
  -- check nobody can ever confirm is still valid, which is the state this
  -- script exists to end.
  expires_on date not null,

  -- WHO SAID SO. The button is the attestation, not the check — MiZanova does
  -- not talk to the Office of the Children's Guardian. This records that a
  -- named person confirmed it at the source, on a day.
  verified_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id) on delete set null,

  source_application_id uuid
    references public.specialist_applications(id) on delete set null,

  -- ENDED, NOT DELETED — as with memberships. A renewal ends the old row and
  -- adds a new one, so "what were we relying on in March?" has an answer.
  ended_at timestamptz,

  created_at timestamptz not null default now()
);

-- One live check of each kind per person. A renewal supersedes; it does not
-- accumulate, or the expiry report would count somebody twice and disagree
-- with itself about which date matters.
create unique index if not exists staff_screening_one_live
  on public.staff_screening (email, check_type)
  where ended_at is null;

create index if not exists staff_screening_expiry_idx
  on public.staff_screening (expires_on) where ended_at is null;

create index if not exists staff_screening_profile_idx
  on public.staff_screening (profile_id) where ended_at is null;

comment on table public.staff_screening is
  'The CURRENT working-with-children and NDIS checks held by a person, with '
  'superseded ones kept. Renewing ends the old row rather than editing it.';


-- ---------------------------------------------------------------------------
-- Renewing supersedes, automatically
-- ---------------------------------------------------------------------------
-- Recording a renewal is one insert. Without this, it is an insert AND an
-- update, in that order, and forgetting the update leaves two live rows with
-- different expiry dates — which is worse than no record, because the report
-- would then be able to show whichever one it liked.
--
-- ---------------------------------------------------------------------------
-- BEFORE INSERT, NOT AFTER. THIS WAS WRITTEN THE WRONG WAY ROUND FIRST.
-- ---------------------------------------------------------------------------
-- As an AFTER trigger it never ran: `staff_screening_one_live` is checked while
-- the row is being inserted, so recording a renewal failed with a duplicate key
-- error before the trigger that was supposed to make room for it fired.
--
--   duplicate key value violates unique constraint "staff_screening_one_live"
--
-- BEFORE is the fix rather than a preference. The old rows leave the partial
-- index when their `ended_at` is set, and only then is the new tuple written,
-- so there is nothing to collide with.
create or replace function public.staff_screening_supersede()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.staff_screening
     set ended_at = now()
   where email = new.email
     and check_type = new.check_type
     and ended_at is null
     and id <> new.id;

  return new;
end $$;

drop trigger if exists staff_screening_supersede on public.staff_screening;
create trigger staff_screening_supersede
  before insert on public.staff_screening
  for each row execute function public.staff_screening_supersede();


-- ---------------------------------------------------------------------------
-- The report the screen and the sweep both read
-- ---------------------------------------------------------------------------
-- A view rather than the same CASE expression written twice, because a screen
-- calling something "expiring" and an email calling it "valid" is exactly the
-- kind of disagreement nobody notices until it matters.
--
-- `security_invoker` so the caller's RLS applies — a view is otherwise a way to
-- read a protected table with the view owner's rights, which is how a careful
-- schema grows a hole.
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
  -- Negative once it has passed, which reads correctly in both directions.
  (s.expires_on - current_date) as days_remaining,
  case
    when s.expires_on < current_date then 'expired'
    -- SIXTY DAYS because a WWCC renewal is not instant and a school term is
    -- ten weeks. Warning somebody the week it lapses is telling them after it
    -- is too late to act without disruption.
    when s.expires_on < current_date + 60 then 'expiring'
    else 'valid'
  end as state_of_check
from public.staff_screening s
left join public.profiles p on p.id = s.profile_id
where s.ended_at is null;

comment on view public.screening_overview is
  'Live checks with days remaining and a status. Read by the platform admin '
  'screen and the sweep script, so both say the same thing.';

/*
 * THE PEOPLE THE REPORT WOULD OTHERWISE LEAVE OUT.
 *
 * A screen that lists expiring checks answers "whose check is running out?"
 * and silently omits the more urgent question: whose check do we not hold at
 * all? Somebody approved with no number never appears in `screening_overview`,
 * because there is nothing to expire — and they are the first person to chase,
 * not the last.
 *
 * This is not hypothetical. The very first real application was approved with
 * an expiry date and no number, which is what prompted the guard on the review
 * screen. That guard stops new ones; this finds the ones already through.
 */
create or replace view public.approved_without_screening
with (security_invoker = true) as
select
  a.id as application_id,
  a.full_name,
  a.email,
  a.profession,
  a.approved_at
from public.specialist_applications a
where a.approved_at is not null
  and a.status = 'approved'
  and not exists (
    select 1 from public.staff_screening s
    where s.email = a.email
      and s.ended_at is null
  );

comment on view public.approved_without_screening is
  'Approved specialists with no screening record at all. More urgent than an '
  'expiring one: there is nothing to expire because nothing was recorded.';


-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.staff_screening enable row level security;

-- Special Miles only, as with the applications these come from. A screening
-- number is not something a school needs; whether a person's check is CURRENT
-- is, and exposing that to school admins without the number is its own piece
-- of work — see doc 13.
drop policy if exists staff_screening_select on public.staff_screening;
create policy staff_screening_select
  on public.staff_screening for select to authenticated
  using (public.is_platform_admin());

-- Recording a renewal is an ordinary act by a reviewer, unlike the application
-- it came from — that arrives from a stranger and the server writes it.
drop policy if exists staff_screening_insert on public.staff_screening;
create policy staff_screening_insert
  on public.staff_screening for insert to authenticated
  with check (public.is_platform_admin());

-- Ending one by hand: "this person's check was revoked" cannot wait for its
-- expiry date to come round.
drop policy if exists staff_screening_update on public.staff_screening;
create policy staff_screening_update
  on public.staff_screening for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- No delete policy. A lapsed check is precisely what an audit asks about.

revoke all on public.staff_screening from anon;
revoke all on public.screening_overview from anon;
revoke all on public.approved_without_screening from anon;


-- ---------------------------------------------------------------------------
-- Seed from what has already been approved
-- ---------------------------------------------------------------------------
-- Idempotent: the partial unique index means a second run inserts nothing.
-- Applications approved without a number produce no row, which is correct and
-- is why the report has a "no check recorded" section — those people are the
-- ones to chase first.
insert into public.staff_screening
  (email, check_type, state, number, expires_on, verified_at, verified_by,
   source_application_id)
select
  a.email,
  'wwcc',
  a.wwcc_state,
  a.wwcc_number,
  a.wwcc_expiry,
  coalesce(a.approved_at, now()),
  a.reviewed_by,
  a.id
from public.specialist_applications a
where a.approved_at is not null
  and a.wwcc_number is not null
  and a.wwcc_expiry is not null
  and not exists (
    select 1 from public.staff_screening s
    where s.email = a.email and s.check_type = 'wwcc' and s.ended_at is null
  );

insert into public.staff_screening
  (email, check_type, number, expires_on, verified_at, verified_by,
   source_application_id)
select
  a.email,
  'ndis',
  a.ndis_screening_number,
  -- NDIS checks run five years. The application never asked for the date, so
  -- this is a placeholder that will read as "expiring" and prompt somebody to
  -- put the real one in — deliberately, rather than a far-future date that
  -- would quietly pass for valid.
  current_date + 30,
  coalesce(a.approved_at, now()),
  a.reviewed_by,
  a.id
from public.specialist_applications a
where a.approved_at is not null
  and a.ndis_screening_number is not null
  and not exists (
    select 1 from public.staff_screening s
    where s.email = a.email and s.check_type = 'ndis' and s.ended_at is null
  );

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select email, check_type, expires_on, days_remaining, state_of_check
--     from public.screening_overview order by days_remaining;
--
-- And that a renewal supersedes rather than accumulating — insert a second
-- wwcc row for the same address and confirm the first one gains an ended_at:
--
--   select count(*) from public.staff_screening
--    where email = '...' and check_type = 'wwcc' and ended_at is null;   -- 1
