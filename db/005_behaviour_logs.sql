-- ===========================================================================
-- MiZanova — 005_behaviour_logs.sql
-- The core of the product: a behaviour observation logged in under 20 seconds.
--
-- Column names and values come from the actual design, not from guesswork:
--   docs/Figma Pages Design/Behaviour Logging Model.png
--
-- Run 001-004 first. SAFE TO RUN TWICE.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The four behaviour categories, exactly as the logging screen offers them
-- ---------------------------------------------------------------------------
-- Four, not forty. The whole design goal is three taps while a teacher keeps
-- their eyes on the class; a long dropdown would defeat it. Nuance goes in the
-- notes field, not into more categories.
--
-- Neutral, observable language on purpose: these describe what was SEEN, not
-- what it means. The product is explicitly never diagnostic.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'behaviour_type') then
    create type public.behaviour_type as enum (
      'disruptive',  -- out of seat, shouting
      'withdrawn',   -- non-responsive, quiet
      'emotional',   -- crying, anxiety, frustration
      'physical'     -- pushing, throwing objects
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'behaviour_intensity') then
    create type public.behaviour_intensity as enum ('standard', 'medium', 'high');
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. behaviour_logs
-- ---------------------------------------------------------------------------
create table if not exists public.behaviour_logs (
  id            uuid primary key default gen_random_uuid(),

  student_id    uuid not null references public.students(id) on delete cascade,

  -- Who observed it. `on delete set null` because a log must survive the
  -- teacher leaving the school — the observation happened regardless.
  logged_by     uuid references public.profiles(id) on delete set null,

  behaviour_type public.behaviour_type not null,
  intensity      public.behaviour_intensity not null,

  notes         text,
  -- FR3 offers voice dictation. Worth recording which was used: dictated notes
  -- carry transcription errors that typed ones do not, and anyone reviewing a
  -- log later deserves to know that.
  notes_source  text not null default 'typed'
                  check (notes_source in ('typed', 'voice')),

  -- The timer on the logging screen. started_at is when the teacher pressed
  -- start; ended_at when they pressed stop.
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,

  -- Computed, so it can never disagree with the two timestamps above.
  duration_seconds integer generated always as (
                     extract(epoch from (ended_at - started_at))::integer
                   ) stored,

  -- When the behaviour happened, which is not always when it was logged — a
  -- teacher may write it up at lunchtime. Charts and daily summaries use this.
  occurred_at   timestamptz not null default now(),

  -- =====================================================================
  -- PARENT VISIBILITY IS OFF BY DEFAULT
  -- =====================================================================
  -- Raw observation notes are working notes between professionals. They can
  -- contain safeguarding concerns, third-party information, or a first
  -- impression that turns out to be wrong. Parents receive a considered daily
  -- summary (FR5), not a live feed of everything typed about their child.
  --
  -- So guardians can read a log only once someone has deliberately shared it.
  -- The RLS policy below enforces that; this is not a UI setting.
  shared_with_parents boolean not null default false,

  -- Safeguarding (FR14). A flagged log enters the school admin's queue.
  is_risk_flagged boolean not null default false,
  risk_note     text,

  -- For offline logging (NFR2). When a device queues logs without Wi-Fi and
  -- syncs later, a retry must not create duplicates. The client generates this
  -- id once, and the unique constraint makes re-sending the same log harmless.
  client_ref    uuid unique,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint behaviour_logs_ended_after_started
    check (ended_at is null or ended_at >= started_at)
);

drop trigger if exists behaviour_logs_set_updated_at on public.behaviour_logs;
create trigger behaviour_logs_set_updated_at
  before update on public.behaviour_logs
  for each row execute function public.set_updated_at();

-- Newest-first per student is the query every screen makes.
create index if not exists behaviour_logs_student_time_idx
  on public.behaviour_logs (student_id, occurred_at desc);

-- Powers the "Recent logs — in the last 24 hours" dashboard tile.
create index if not exists behaviour_logs_occurred_idx
  on public.behaviour_logs (occurred_at desc);

-- Powers the safeguarding queue; partial, so it stays tiny.
create index if not exists behaviour_logs_risk_idx
  on public.behaviour_logs (occurred_at desc)
  where is_risk_flagged;


-- ---------------------------------------------------------------------------
-- 3. Helper: may STAFF see this student?
-- ---------------------------------------------------------------------------
-- can_view_student() from 003 includes guardians. Here we need the staff-only
-- half of it, because guardians get their own, narrower policy below.
create or replace function public.can_staff_view_student(p_student_id uuid)
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
    or public.is_assigned_staff_for(p_student_id);
$$;

revoke all on function public.can_staff_view_student(uuid) from public, anon;
grant execute on function public.can_staff_view_student(uuid)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. Policies
-- ---------------------------------------------------------------------------
alter table public.behaviour_logs enable row level security;

-- Staff assigned to the student see everything about them.
drop policy if exists behaviour_logs_select_staff on public.behaviour_logs;
create policy behaviour_logs_select_staff
  on public.behaviour_logs for select to authenticated
  using (public.can_staff_view_student(student_id));

-- Guardians see only what has been shared with them. Two conditions, both
-- required: you must be this child's guardian AND the log must be shared.
drop policy if exists behaviour_logs_select_guardian on public.behaviour_logs;
create policy behaviour_logs_select_guardian
  on public.behaviour_logs for select to authenticated
  using (shared_with_parents and public.is_guardian_of(student_id));

-- Only assigned staff may log, and only in their own name. `logged_by =
-- auth.uid()` prevents recording an observation as though a colleague made it.
drop policy if exists behaviour_logs_insert on public.behaviour_logs;
create policy behaviour_logs_insert
  on public.behaviour_logs for insert to authenticated
  with check (
    public.is_assigned_staff_for(student_id)
    and logged_by = auth.uid()
  );

-- You may correct your own log; a school admin may correct any at their
-- school. Nobody else, and never a guardian.
drop policy if exists behaviour_logs_update on public.behaviour_logs;
create policy behaviour_logs_update
  on public.behaviour_logs for update to authenticated
  using (
    logged_by = auth.uid()
    or public.is_platform_admin()
    or (public.is_school_admin() and public.can_staff_view_student(student_id))
  )
  with check (
    logged_by = auth.uid()
    or public.is_platform_admin()
    or (public.is_school_admin() and public.can_staff_view_student(student_id))
  );

-- No DELETE policy. A behaviour record is part of a child's history and may be
-- evidence in a safeguarding matter. Corrections are edits, not erasures.

revoke all on public.behaviour_logs from anon;


-- ---------------------------------------------------------------------------
-- Done. Run db/verify.sql — `tables` should now include behaviour_logs and
-- `policies` should be 21.
-- ---------------------------------------------------------------------------
