-- ===========================================================================
-- 059_appointments.sql — booking a session, as opposed to recording one
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ANNOUNCE IN THE GROUP CHAT BEFORE RUNNING. One Supabase project, four of us.
--
-- WHY THIS IS A SECOND TABLE AND NOT A COLUMN ON specialist_sessions.
--
-- db/028 records a session that HAPPENED: a date, a duration, trials, a summary
-- and a clinical note. Every row is evidence. Nothing in it can express "next
-- Tuesday at 10:15", and giving it a nullable date and a status would make the
-- most sensitive table in the product also the one holding intentions — so
-- "how much therapy has this child received this term?" would depend on
-- remembering a filter. A count that needs a filter to be true is the shape
-- this project keeps getting wrong.
--
-- So: an appointment is a plan, a session is a fact, and completing the former
-- produces the latter.
--
-- WHAT THIS DELIBERATELY DOES NOT DO.
--
-- The Figma screen shows drag-and-drop across a week, availability, invitations
-- and 72-hour reminders. This builds booking only. There is no availability
-- model — a specialist's working hours are not recorded anywhere, so "free" is
-- a claim this database cannot make — and no email in the product to send an
-- invitation or a reminder with. The screen says so rather than implying
-- otherwise.
--
-- WHO CAN SEE ONE. Verified assigned specialists and platform admins. Not
-- teachers, not school admins, not families — the same boundary db/028 draws,
-- for the same reason: when a child sees a therapist is health information, and
-- a principal reading the therapy calendar for their whole school is not what a
-- family agrees to when they consent to a referral. Telling a family their
-- child's appointment time is a good feature and a different one; it needs a
-- decision about who promises the time, not just a policy.

begin;

-- Needed for the overlap constraints below: it lets a gist index mix an
-- equality column (a uuid) with a range one.
--
-- IF THIS SCRIPT FAILS with "data type uuid has no default operator class for
-- access method gist", the extension is installed in a schema that is not on
-- the search path — Supabase sometimes puts it in `extensions`. Run
-- `create extension btree_gist with schema public;` once, then this file
-- again. `if not exists` will not move an existing installation, which is why
-- the error looks like a missing extension when one is present.
create extension if not exists btree_gist;

create table if not exists public.specialist_appointments (
  id             uuid primary key default gen_random_uuid(),

  student_id     uuid not null references public.students(id) on delete cascade,
  -- Cascades, unlike specialist_sessions.specialist_id. A session must keep its
  -- author after they leave because it is a clinical record; an appointment
  -- belonging to nobody is just a hole in a calendar.
  specialist_id  uuid not null references public.profiles(id) on delete cascade,

  -- timestamptz, NOT a date plus a time column. A booking is one instant, and
  -- two columns are two things that can disagree. Schools are in one country
  -- and several timezones — see schools.timezone.
  starts_at      timestamptz not null,
  duration_minutes integer not null default 30
                   check (duration_minutes > 0 and duration_minutes <= 480),

  -- A REAL COLUMN, MAINTAINED BY A TRIGGER, and it has to be.
  --
  -- The obvious way to write the overlap constraints below is
  -- `tstzrange(starts_at, starts_at + make_interval(mins => duration_minutes))`.
  -- Postgres refuses it: `timestamptz + interval` is STABLE rather than
  -- IMMUTABLE, because an interval can carry days and months and those depend
  -- on the session's TimeZone across a daylight-saving boundary. An index
  -- expression must be immutable, so the constraint is rejected outright — and
  -- a generated column would be refused for exactly the same reason.
  --
  -- Two plain columns and `tstzrange(starts_at, ends_at)` sidestep it, because
  -- the two-argument constructor IS immutable. Nothing may supply this: the
  -- trigger overwrites it on every insert and update.
  ends_at        timestamptz not null,

  status         text not null default 'scheduled'
                   check (status in ('scheduled', 'completed', 'cancelled')),

  -- "Articulation — R sounds". Free text on purpose: a fixed list of session
  -- types would be invented here rather than by the people who run them.
  purpose        text,

  -- Set when the appointment is completed. See the trigger below: 'completed'
  -- without one is refused, so the status cannot claim a session that does not
  -- exist.
  session_id     uuid references public.specialist_sessions(id) on delete set null,
  cancelled_reason text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists specialist_appointments_specialist_idx
  on public.specialist_appointments (specialist_id, starts_at);
create index if not exists specialist_appointments_student_idx
  on public.specialist_appointments (student_id, starts_at);

drop trigger if exists specialist_appointments_set_updated_at
  on public.specialist_appointments;
create trigger specialist_appointments_set_updated_at
  before update on public.specialist_appointments
  for each row execute function public.set_updated_at();

-- Derived, never supplied. A caller sending its own ends_at would be able to
-- book a half-hour appointment that reserves one minute, which is a hole
-- straight through both overlap constraints.
create or replace function public.appointments_set_ends_at()
returns trigger
language plpgsql
as $$
begin
  new.ends_at := new.starts_at + make_interval(mins => new.duration_minutes);
  return new;
end;
$$;

drop trigger if exists specialist_appointments_set_ends_at
  on public.specialist_appointments;
create trigger specialist_appointments_set_ends_at
  before insert or update on public.specialist_appointments
  for each row execute function public.appointments_set_ends_at();

-- ---------------------------------------------------------------------------
-- Nobody is in two places at once
-- ---------------------------------------------------------------------------
-- Enforced here rather than in the browser because two tabs, two specialists
-- and one retried request all defeat a check written in JavaScript. `where
-- (status = 'scheduled')` means cancelling genuinely frees the slot, and a
-- completed appointment stops blocking one.
alter table public.specialist_appointments
  drop constraint if exists specialist_appointments_specialist_no_overlap;
alter table public.specialist_appointments
  add constraint specialist_appointments_specialist_no_overlap
  exclude using gist (
    specialist_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'scheduled');

-- And neither is the child. Two specialists on one caseload booking the same
-- half hour is the collision nobody sees coming, because each of them is
-- looking at their own calendar.
alter table public.specialist_appointments
  drop constraint if exists specialist_appointments_student_no_overlap;
alter table public.specialist_appointments
  add constraint specialist_appointments_student_no_overlap
  exclude using gist (
    student_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'scheduled');

-- ---------------------------------------------------------------------------
-- 'completed' means there is a session to point at
-- ---------------------------------------------------------------------------
-- Without this, marking an appointment done is a status change and nothing
-- else — the Schedule screen would count delivered minutes from
-- specialist_sessions while the calendar showed appointments completed, and the
-- two would drift apart with no way to tell which was lying.
create or replace function public.appointments_completion_needs_a_session()
returns trigger
language plpgsql
as $$
declare
  session_student uuid;
begin
  if new.status = 'completed' then
    if new.session_id is null then
      raise exception
        'Record the session before marking this appointment complete.'
        using errcode = '22023';
    end if;

    select student_id into session_student
    from public.specialist_sessions where id = new.session_id;

    if session_student is distinct from new.student_id then
      raise exception
        'That session belongs to a different child.'
        using errcode = '22023';
    end if;
  end if;

  if new.status = 'cancelled' and new.session_id is not null then
    raise exception
      'A cancelled appointment cannot point at a session.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists specialist_appointments_completion_guard
  on public.specialist_appointments;
create trigger specialist_appointments_completion_guard
  before insert or update on public.specialist_appointments
  for each row execute function public.appointments_completion_needs_a_session();

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
alter table public.specialist_appointments enable row level security;

-- A verified specialist assigned to the child. `am_i_verified()` and
-- `is_assigned_staff_for()` rather than `can_staff_view_student()`, which also
-- admits school administrators — see db/029 for why that distinction exists.
drop policy if exists specialist_appointments_select on public.specialist_appointments;
create policy specialist_appointments_select
  on public.specialist_appointments for select to authenticated
  using (
    public.my_role() = 'specialist'
    and public.am_i_verified()
    and public.is_assigned_staff_for(student_id)
  );

drop policy if exists specialist_appointments_select_platform on public.specialist_appointments;
create policy specialist_appointments_select_platform
  on public.specialist_appointments for select to authenticated
  using (public.is_platform_admin());

drop policy if exists specialist_appointments_insert on public.specialist_appointments;
create policy specialist_appointments_insert
  on public.specialist_appointments for insert to authenticated
  with check (
    public.my_role() = 'specialist'
    and public.am_i_verified()
    and public.is_assigned_staff_for(student_id)
    and specialist_id = auth.uid()
  );

-- Only the specialist it belongs to may move, cancel or complete it. A
-- colleague on the same caseload can see it; rearranging someone else's day is
-- a different thing.
drop policy if exists specialist_appointments_update on public.specialist_appointments;
create policy specialist_appointments_update
  on public.specialist_appointments for update to authenticated
  using (specialist_id = auth.uid() and public.am_i_verified())
  with check (specialist_id = auth.uid() and public.am_i_verified());

-- No delete policy. Cancelling keeps the row, because "this was booked and
-- called off" is a different fact from "this was never booked" — and the
-- second one is what a deleted row looks like.

revoke all on public.specialist_appointments from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked, from the BROWSER CONSOLE, signed in as a verified
-- specialist with somebody on your caseload.
--
--   const { data: s } = await supabase.from('students').select('id').limit(1)
--   const at = new Date(Date.now() + 864e5).toISOString()
--
--   await supabase.from('specialist_appointments').insert({
--     student_id: s[0].id,
--     specialist_id: (await supabase.auth.getUser()).data.user.id,
--     starts_at: at, duration_minutes: 30,
--   })                                   -- succeeds
--
--   await supabase.from('specialist_appointments').insert({
--     student_id: s[0].id,
--     specialist_id: (await supabase.auth.getUser()).data.user.id,
--     starts_at: at, duration_minutes: 30,
--   })                                   -- REFUSED: 23P01, overlapping
--
-- The second one failing is the point. Booking is only worth having if the
-- database is the thing that refuses a clash — a browser cannot, because the
-- other tab is not asking it.
-- ---------------------------------------------------------------------------
