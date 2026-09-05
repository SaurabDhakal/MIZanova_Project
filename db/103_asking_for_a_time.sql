-- ---------------------------------------------------------------------------
-- 103 — Asking for a time
-- ---------------------------------------------------------------------------
-- db/102 recorded when a specialist works. This is the other half: somebody
-- with no school asking for one of those hours.
--
-- `specialist_appointments.student_id` is NOT NULL, so an individual cannot be
-- the subject of one. That is the third time this has come up — db/094 for AI
-- requests, db/101 for goals — and the answer is the same each time: a
-- person-scoped table beside the student-scoped one, rather than making a
-- column nullable and hoping the twenty policies that read it still mean what
-- they did.
--
-- ---------------------------------------------------------------------------
-- A REQUEST, NOT A PURCHASE, AND THAT IS THE HONEST SHAPE
-- ---------------------------------------------------------------------------
-- The tempting design is to take the money and confirm instantly. It would be
-- inventing two things nobody has decided: what a session costs, and that
-- Special Miles will see anybody who pays.
--
-- src/lib/plans.ts is explicit that published figures come from the client, and
-- Joe's brief says willingness to pay is still being researched with Practera.
-- A one-to-one session is also not a course — it is a person's afternoon, and
-- whether they take a particular referral is their call.
--
-- So: the individual asks for a time that is genuinely free, the specialist
-- accepts or declines, and `fee_cents` sits ready and null. When Special Miles
-- sets a price, the accept step gains a payment and nothing else moves.
--
-- ---------------------------------------------------------------------------
-- DOUBLE BOOKING IS REFUSED BY THE DATABASE
-- ---------------------------------------------------------------------------
-- A screen that offers only free slots is a courtesy; two people pressing the
-- same slot two seconds apart is the case that actually happens. An exclusion
-- constraint on the specialist and the time range means the second one loses,
-- whatever either screen believed.
--
-- It covers ACCEPTED bookings only. Two people may ask for the same hour —
-- that is a queue, not a clash — and refusing the second request would hand
-- the slot to whoever happened to be quicker rather than to whoever the
-- specialist chooses.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.individual_bookings (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  specialist_id  uuid not null references public.profiles(id) on delete cascade,

  starts_at      timestamptz not null,
  duration_minutes integer not null default 45
                   check (duration_minutes between 15 and 240),
  ends_at        timestamptz not null,

  status         text not null default 'requested'
                   check (status in ('requested', 'accepted', 'declined', 'cancelled')),

  -- What they want out of it, in their words. Optional: somebody who cannot
  -- summarise it in a sentence should still be able to ask.
  purpose        text check (length(purpose) <= 1000),
  -- Why it was declined or cancelled. A refusal with no reason is the thing
  -- people remember about a product.
  outcome_note   text check (length(outcome_note) <= 1000),

  -- Ready and deliberately unused. See the header.
  fee_cents      integer check (fee_cents is null or fee_cents > 0),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint individual_bookings_ends_after_start check (ends_at > starts_at)
);

create index if not exists individual_bookings_mine_idx
  on public.individual_bookings (profile_id, starts_at desc);
create index if not exists individual_bookings_theirs_idx
  on public.individual_bookings (specialist_id, starts_at desc);

create extension if not exists btree_gist;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'individual_bookings_no_clash'
  ) then
    alter table public.individual_bookings
      add constraint individual_bookings_no_clash
      exclude using gist (
        specialist_id with =,
        tstzrange(starts_at, ends_at) with &&
      )
      where (status = 'accepted');
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Which hours are actually free
-- ---------------------------------------------------------------------------
-- Derived, never stored. db/102 keeps the weekly pattern; this walks the days
-- in a range, cuts each availability band into slots, and drops any that
-- collide with something already in the diary.
--
-- BOTH DIARIES ARE CHECKED. A specialist's time is one resource: an hour taken
-- by a school appointment is not free for an individual, and vice versa.
-- Reading `specialist_appointments` here would normally be a permission
-- question, which is why this function is SECURITY DEFINER and returns only
-- start times — a caller learns that 2pm is taken, never who is in it.
--
-- Past slots are excluded. Offering somebody a time that has already happened
-- is the kind of detail that makes a product feel unfinished.
-- ---------------------------------------------------------------------------
create or replace function public.free_slots(
  p_specialist uuid,
  p_from       date,
  p_to         date,
  p_minutes    integer default 45
)
returns table (slot timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select d::date as day
    from generate_series(p_from, least(p_to, p_from + 60), interval '1 day') d
  ),
  bands as (
    select
      days.day,
      (days.day + a.starts_at) at time zone 'Australia/Sydney' as band_start,
      (days.day + a.ends_at)   at time zone 'Australia/Sydney' as band_end
    from days
    join public.specialist_availability a
      on a.specialist_id = p_specialist
     and a.weekday = extract(dow from days.day)
  ),
  candidates as (
    select generate_series(
             b.band_start,
             b.band_end - make_interval(mins => p_minutes),
             make_interval(mins => p_minutes)
           ) as slot
    from bands b
  )
  select c.slot
  from candidates c
  where c.slot > now()
    and not exists (
      select 1 from public.individual_bookings ib
      where ib.specialist_id = p_specialist
        and ib.status = 'accepted'
        and tstzrange(ib.starts_at, ib.ends_at)
            && tstzrange(c.slot, c.slot + make_interval(mins => p_minutes))
    )
    and not exists (
      select 1 from public.specialist_appointments sa
      where sa.specialist_id = p_specialist
        and sa.status <> 'cancelled'
        and tstzrange(sa.starts_at, sa.ends_at)
            && tstzrange(c.slot, c.slot + make_interval(mins => p_minutes))
    )
  order by c.slot;
$$;

revoke all on function public.free_slots(uuid, date, date, integer) from anon;
grant execute on function public.free_slots(uuid, date, date, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- Who sees a booking
-- ---------------------------------------------------------------------------
-- The two people in it, and nobody else. Not a platform admin: this is an
-- adult arranging their own appointment, and the same argument db/094 made
-- about private writing applies to who somebody chose to talk to.
-- ---------------------------------------------------------------------------
alter table public.individual_bookings enable row level security;

drop policy if exists individual_bookings_read on public.individual_bookings;
create policy individual_bookings_read
  on public.individual_bookings for select to authenticated
  using (profile_id = auth.uid() or specialist_id = auth.uid());

-- Asking is the individual's. They cannot book on anybody else's behalf, and
-- they cannot set their own status to 'accepted' — that is the specialist's
-- word, enforced below rather than trusted.
drop policy if exists individual_bookings_ask on public.individual_bookings;
create policy individual_bookings_ask
  on public.individual_bookings for insert to authenticated
  with check (profile_id = auth.uid() and status = 'requested');

-- Answering is the specialist's; cancelling is either's.
drop policy if exists individual_bookings_answer on public.individual_bookings;
create policy individual_bookings_answer
  on public.individual_bookings for update to authenticated
  using (specialist_id = auth.uid() or profile_id = auth.uid())
  with check (
    specialist_id = auth.uid()
    -- The person who asked may only ever withdraw.
    or (profile_id = auth.uid() and status = 'cancelled')
  );

revoke all on public.individual_bookings from anon;
grant select, insert, update on public.individual_bookings to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--   select * from public.free_slots('<specialist>', current_date, current_date + 14);
--
-- Accept a booking in one of those slots and it must disappear from the list.
-- As the individual, an update setting status='accepted' must be refused.
-- ---------------------------------------------------------------------------
