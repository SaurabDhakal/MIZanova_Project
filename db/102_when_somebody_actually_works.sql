-- ---------------------------------------------------------------------------
-- 102 — When somebody actually works
-- ---------------------------------------------------------------------------
-- src/pages/specialist/Schedule.tsx has said this since it was written:
--
--     An empty slot in the grid means nothing is booked in it, not that you
--     are free — working hours are recorded nowhere in MiZanova, so
--     availability is a claim this calendar cannot make.
--
-- That sentence is the reason nobody can book anything. Joe's brief sells
-- "bookable advisory sessions" and "1:1 consultancy and workshop bookings" as
-- a revenue stream, and the product has a calendar that can only ever show
-- what already happened. A family cannot request a time, an individual has no
-- way in at all, and Special Miles cannot sell an hour it cannot describe.
--
-- This is the missing half. It records nothing about who books what — that is
-- the next file — it only lets a specialist say when they work.
--
-- ---------------------------------------------------------------------------
-- RECURRING WEEKLY HOURS, NOT A LIST OF SLOTS
-- ---------------------------------------------------------------------------
-- The tempting shape is a row per bookable slot. It is wrong twice over: it
-- needs a job to generate rows forever, and it makes "I work Tuesday
-- mornings" — which is what a person actually knows about themselves — into
-- fifty rows that fall out of step the moment the pattern changes.
--
-- So this stores the PATTERN. A weekday and two times, which is how somebody
-- describes their own week out loud. What is free on a given Tuesday is that
-- pattern minus what is already booked, worked out when somebody asks rather
-- than stored.
--
-- ---------------------------------------------------------------------------
-- NO OVERLAPS, ENFORCED HERE
-- ---------------------------------------------------------------------------
-- Two overlapping bands on the same day would double-count an hour and
-- silently offer it twice. An exclusion constraint refuses that in the
-- database rather than in whichever screen happens to be writing, which is the
-- same reasoning every other constraint in this schema follows.
--
-- ---------------------------------------------------------------------------
-- WHO CAN READ IT
-- ---------------------------------------------------------------------------
-- Any signed-in person can read any specialist's working hours, and that is
-- deliberate rather than an oversight. Knowing that somebody works Tuesday
-- mornings is not private — it is the thing a booking screen exists to show,
-- and it says nothing about who they saw or why. What is private is the
-- appointment, and that is governed by `specialist_appointments`, which this
-- file does not touch.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.specialist_availability (
  id            uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references public.profiles(id) on delete cascade,

  -- 0 = Sunday, matching Postgres `extract(dow ...)` so the comparison in a
  -- query needs no arithmetic anybody can get wrong.
  weekday       smallint not null check (weekday between 0 and 6),
  starts_at     time not null,
  ends_at       time not null,

  -- Where they are, when it is not wherever the child is. Null means the
  -- ordinary arrangement rather than "unknown".
  note          text check (length(note) <= 200),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint specialist_availability_ends_after_start check (ends_at > starts_at)
);

create index if not exists specialist_availability_who_idx
  on public.specialist_availability (specialist_id, weekday, starts_at);

-- Two bands on the same day for the same person must not overlap. btree_gist
-- is what lets a plain equality (the specialist, the weekday) sit beside a
-- range overlap in one constraint.
create extension if not exists btree_gist;

-- POSTGRES HAS NO RANGE TYPE FOR `time`. It ships int4range, numrange,
-- daterange, tsrange and tstzrange, and nothing for a time of day — so the
-- obvious `timerange(starts_at, ends_at)` in the constraint below fails with
-- "function timerange(time, time) does not exist". Defining it is one line and
-- keeps the constraint readable; the alternative is storing minutes-from-
-- midnight as integers, which makes every query about working hours arithmetic
-- rather than times.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'timerange') then
    create type public.timerange as range (subtype = time);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'specialist_availability_no_overlap'
  ) then
    alter table public.specialist_availability
      add constraint specialist_availability_no_overlap
      exclude using gist (
        specialist_id with =,
        weekday with =,
        public.timerange(starts_at, ends_at) with &&
      );
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Yours to set, everybody's to read
-- ---------------------------------------------------------------------------
alter table public.specialist_availability enable row level security;

drop policy if exists specialist_availability_read on public.specialist_availability;
create policy specialist_availability_read
  on public.specialist_availability for select to authenticated
  using (true);

-- Only the specialist themselves, and only rows about themselves. A platform
-- admin is admitted because Special Miles administers the network and will be
-- asked to fix somebody's hours while they are on leave.
drop policy if exists specialist_availability_write on public.specialist_availability;
create policy specialist_availability_write
  on public.specialist_availability for all to authenticated
  using (specialist_id = auth.uid() or public.is_platform_admin())
  with check (specialist_id = auth.uid() or public.is_platform_admin());

revoke all on public.specialist_availability from anon;
grant select, insert, update, delete on public.specialist_availability to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it. As a specialist, two overlapping bands on one day must be refused:
--
--   insert into public.specialist_availability (specialist_id, weekday, starts_at, ends_at)
--   values (auth.uid(), 2, '09:00', '12:00');   -- ok
--   insert into public.specialist_availability (specialist_id, weekday, starts_at, ends_at)
--   values (auth.uid(), 2, '11:00', '15:00');   -- refused, overlaps
--
-- And as anybody else: readable, but not writable.
-- ---------------------------------------------------------------------------
