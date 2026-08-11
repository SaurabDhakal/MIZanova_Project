-- ===========================================================================
-- MiZanova — 007_home_observations.sql
-- What parents contribute: moments observed at home (FR8).
--
-- Design reference: docs/Figma Pages Design/Parent Home Observations.png
--
-- Run 001-006 first. SAFE TO RUN TWICE.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Categories, taken from the chart on the design
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'observation_category') then
    create type public.observation_category as enum (
      'language',
      'social_emotional',
      'motor',
      'sensory',
      'cognitive',
      'other'
    );
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. home_observations
-- ---------------------------------------------------------------------------
-- Deliberately NOT the same table as behaviour_logs, even though the two look
-- similar. A behaviour log is a professional record made by a teacher inside a
-- duty of care; a home observation is a parent telling the school something
-- they noticed. Different authors, different authority, different retention
-- expectations, and — crucially — different visibility rules. Merging them
-- would mean one set of policies trying to serve both.
create table if not exists public.home_observations (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,

  -- The parent who wrote it. Kept if their account goes, so the school's
  -- picture of the child does not develop holes.
  logged_by    uuid references public.profiles(id) on delete set null,

  title        text not null check (btrim(title) <> ''),
  body         text not null check (btrim(body) <> ''),
  category     public.observation_category not null default 'other',

  -- When it happened at home, which is often not when it was written up.
  observed_on  date not null default current_date,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists home_observations_set_updated_at on public.home_observations;
create trigger home_observations_set_updated_at
  before update on public.home_observations
  for each row execute function public.set_updated_at();

create index if not exists home_observations_student_idx
  on public.home_observations (student_id, observed_on desc);


-- ---------------------------------------------------------------------------
-- 3. Policies
-- ---------------------------------------------------------------------------
alter table public.home_observations enable row level security;

-- Guardians read their own child's observations, including ones written by the
-- other parent — a shared picture of the child is the point.
drop policy if exists home_observations_select_guardian on public.home_observations;
create policy home_observations_select_guardian
  on public.home_observations for select to authenticated
  using (public.is_guardian_of(student_id));

-- Staff assigned to the student read them too. Unlike behaviour logs, which
-- default to hidden from parents, home observations are shared with school
-- BY DEFAULT — the parent wrote them precisely so the school would see them.
-- The asymmetry is deliberate and runs in the safe direction: the person who
-- created the record is the one it is shared with by default.
drop policy if exists home_observations_select_staff on public.home_observations;
create policy home_observations_select_staff
  on public.home_observations for select to authenticated
  using (public.can_staff_view_student(student_id));

-- Only a guardian writes one, and only in their own name.
drop policy if exists home_observations_insert on public.home_observations;
create policy home_observations_insert
  on public.home_observations for insert to authenticated
  with check (
    public.is_guardian_of(student_id)
    and logged_by = auth.uid()
  );

-- Authors may correct their own. Staff may not edit what a parent wrote —
-- altering someone else's account of their own child is not a power the school
-- should have.
drop policy if exists home_observations_update on public.home_observations;
create policy home_observations_update
  on public.home_observations for update to authenticated
  using (logged_by = auth.uid())
  with check (logged_by = auth.uid());

-- No delete policy.

revoke all on public.home_observations from anon;


-- ---------------------------------------------------------------------------
-- Done. db/verify.sql: tables gains home_observations; policies becomes 32.
-- ---------------------------------------------------------------------------
