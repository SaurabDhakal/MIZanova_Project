-- ---------------------------------------------------------------------------
-- 115 — A family can ask for a time
-- ---------------------------------------------------------------------------
-- FR6 and P05. A parent should be able to book a session with a specialist:
-- "a calendar view must clearly show the available dates and times for
-- assigned specialists", and a button that starts one.
--
-- Today the parent's Appointments screen is read-only and says so in its own
-- empty state: "When a specialist books a session with your child, it appears
-- here." Booking runs entirely one way. db/103 gave an INDIVIDUAL — somebody
-- with no school — the ability to ask, and a family with a child at a school
-- still cannot.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXTENDS specialist_appointments RATHER THAN COPYING db/103
-- ---------------------------------------------------------------------------
-- The opposite call to db/114's, for the opposite reason, and both are about
-- what the row is ABOUT.
--
-- `individual_bookings` exists because `specialist_appointments.student_id` is
-- not null and an individual has no student record. A parent's request is the
-- other way round: it is an appointment for a child, and the row it wants to
-- become is exactly the row a specialist would have created. Giving it a
-- second table would mean two calendars for the same clinician, two overlap
-- constraints that do not see each other, and a booking that changes tables
-- when it is accepted.
--
-- So it is the same table with one more status, and accepting is an UPDATE
-- rather than a copy.
--
-- ---------------------------------------------------------------------------
-- A REQUEST MUST NOT HOLD A SLOT, AND THIS IS THE PART THAT WOULD HAVE BROKEN
-- ---------------------------------------------------------------------------
-- Both overlap constraints in db/059 are `where (status = 'scheduled')`, so a
-- requested row does not reserve anything and several families may ask for the
-- same half hour. The first acceptance wins and the second is refused by the
-- database rather than by a check somebody remembered to write.
--
-- But `free_slots` in db/103 excludes appointments with `status <> 'cancelled'`
-- — a negative list, written when 'cancelled' was the only status that did not
-- occupy the diary. Adding 'requested' to the enum would have made every
-- unanswered request disappear from the calendar it was asked from, so one
-- family could quietly empty a specialist's availability for everybody else by
-- asking for everything. It becomes a positive list here: a slot is busy when
-- something is actually happening in it.
--
-- Rebuilt from db/103's live body, which `npm run sql-supersessions` confirms
-- is the only definition. `create or replace` swaps the whole function.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT HERE: THE PAYMENT
-- ---------------------------------------------------------------------------
-- FR6 says "book and pay". `fee_cents` has been on this table since db/073 and
-- is null on every row, because nobody has priced a specialist's afternoon —
-- BACKLOG has carried that as a decision for Special Miles since db/103 made
-- the same call for individuals. A price invented here would be the same
-- fabrication as the placeholder ABN this project has refused to print.
--
-- So a request is a REQUEST. `raise_appointment_invoice()` from db/073 already
-- turns an accepted appointment into an invoice the moment there is a figure
-- to put in it, and the accept step gains a payment then, through machinery
-- that already exists.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Two more things an appointment can be
-- ---------------------------------------------------------------------------
-- 'declined' is separate from 'cancelled' on purpose. Cancelled means it was
-- agreed and then called off; declined means it was never agreed. A family
-- reading "cancelled" against a time nobody ever accepted would reasonably
-- think they had lost something they had.
-- ---------------------------------------------------------------------------
alter table public.specialist_appointments
  drop constraint if exists specialist_appointments_status_check;
alter table public.specialist_appointments
  add constraint specialist_appointments_status_check
  check (status in ('requested', 'scheduled', 'completed', 'cancelled', 'declined'));

comment on column public.specialist_appointments.status is
  'requested — a family asked and nobody has answered. scheduled — agreed. '
  'completed — it happened, and session_id proves it. cancelled — it was '
  'agreed and called off. declined — it was never agreed. The two overlap '
  'constraints apply to scheduled only, so a request reserves nothing.';


-- ---------------------------------------------------------------------------
-- 2. A family may ask
-- ---------------------------------------------------------------------------
-- Narrow in four ways at once, and every one of them matters:
--
--   is_guardian_of        their own child, not any child
--   status = 'requested'  they cannot write themselves a confirmed booking
--   the specialist is on THIS child's caseload — P05 says "assigned
--                         specialists", and a family should not be able to
--                         put a clinician they have never met into their diary
--   am_i_verified() on the specialist, so an unvetted account cannot be
--                         booked into a child's record by anybody
-- ---------------------------------------------------------------------------
drop policy if exists specialist_appointments_insert_guardian
  on public.specialist_appointments;
create policy specialist_appointments_insert_guardian
  on public.specialist_appointments for insert to authenticated
  with check (
    status = 'requested'
    and public.is_guardian_of(student_id)
    and exists (
      select 1
      from public.student_educators se
      join public.profiles p on p.id = se.profile_id
      where se.student_id = specialist_appointments.student_id
        and se.profile_id = specialist_appointments.specialist_id
        and se.assignment = 'specialist'
        and p.role = 'specialist'
        -- db/013's column, read directly rather than through am_i_verified(),
        -- which asks about the CALLER and the caller here is the parent. A
        -- specialist cannot create their own appointment unverified (db/059),
        -- so a family must not be able to create one for them either.
        and p.is_verified
    )
  );

-- ---------------------------------------------------------------------------
-- 3. And may take it back, while it is still only a question
-- ---------------------------------------------------------------------------
-- Withdrawing an unanswered request is the family's own business. Once a
-- specialist has agreed it, cancelling is theirs — a parent silently removing
-- a clinician's committed hour is a different thing, and db/059's update
-- policy already says who owns an agreed booking.
--
-- The `with check` pins the destination as well as the source. Without it the
-- policy would permit requested → scheduled, which is a family confirming
-- their own appointment.
-- ---------------------------------------------------------------------------
drop policy if exists specialist_appointments_withdraw_guardian
  on public.specialist_appointments;
create policy specialist_appointments_withdraw_guardian
  on public.specialist_appointments for update to authenticated
  using (
    status = 'requested'
    and public.is_guardian_of(student_id)
  )
  with check (
    status = 'cancelled'
    and public.is_guardian_of(student_id)
  );


-- ---------------------------------------------------------------------------
-- 4. Busy means something is happening, not "not cancelled"
-- ---------------------------------------------------------------------------
-- The whole body from db/103, with one clause changed — see the header. The
-- individual_bookings half is unchanged and already uses a positive test.
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
        -- POSITIVE LIST. Was `status <> 'cancelled'`, which would now count an
        -- unanswered request and a declined one as occupied time.
        and sa.status in ('scheduled', 'completed')
        and tstzrange(sa.starts_at, sa.ends_at)
            && tstzrange(c.slot, c.slot + make_interval(mins => p_minutes))
    )
  order by c.slot;
$$;

revoke all on function public.free_slots(uuid, date, date, integer) from anon;
grant execute on function public.free_slots(uuid, date, date, integer) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
-- As a guardian, asking their child's assigned specialist for a free slot:
--
--   insert into public.specialist_appointments
--     (student_id, specialist_id, starts_at, duration_minutes, status, purpose)
--   values ('<child>', '<their specialist>', '<a free slot>', 45, 'requested',
--           'Mornings are hard');                              -- 1 row
--
-- And the four refusals, each of which must fail:
--
--   ...the same row with status 'scheduled'   -- writing your own confirmation
--   ...a specialist NOT on this child's caseload
--   ...another family's child
--   ...update ... set status = 'scheduled' where status = 'requested'
--                                             -- confirming your own request
--
-- Then the slot must STILL be offered, because a request reserves nothing:
--
--   select count(*) from public.free_slots('<specialist>', current_date,
--                                          current_date + 14, 45)
--    where slot = '<the slot just requested>';   -- 1, not 0
--
-- db/verify.sql: policies increases by two.
-- ---------------------------------------------------------------------------
