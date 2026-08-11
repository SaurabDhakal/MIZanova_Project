-- ===========================================================================
-- MiZanova — 008_goals.sql
-- SMART goals, their milestones, and IEP documents (FR24).
--
-- Design reference: docs/Figma Pages Design/Parent Goals & IEP.png
--
-- Run 001-007 first. SAFE TO RUN TWICE.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'goal_category') then
    create type public.goal_category as enum (
      'social_communication',
      'emotional_regulation',
      'motor_skills',
      'literacy',
      'numeracy',
      'self_care',
      'other'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'goal_status') then
    create type public.goal_status as enum (
      'not_started',
      'on_track',
      'needs_review',
      'achieved',
      'discontinued'
    );
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. goals
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,

  title         text not null check (btrim(title) <> ''),
  -- The SMART statement itself: what the student will do, how often, in what
  -- conditions. Long enough for a real one.
  description   text not null check (btrim(description) <> ''),

  category      public.goal_category not null default 'other',
  status        public.goal_status not null default 'not_started',

  target_date   date,

  -- 0-100. Maintained BY THE DATABASE when the goal has milestones (see the
  -- trigger below), and set by hand only for goals that have none. One column
  -- to read either way, so no screen has to know which kind of goal it is.
  progress_percent integer not null default 0
                     check (progress_percent between 0 and 100),

  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

create index if not exists goals_student_idx on public.goals (student_id);


-- ---------------------------------------------------------------------------
-- 3. goal_milestones
-- ---------------------------------------------------------------------------
-- The measurable steps. A goal without them is a wish; the "M" in SMART is
-- what these are for.
create table if not exists public.goal_milestones (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals(id) on delete cascade,

  title        text not null check (btrim(title) <> ''),
  is_done      boolean not null default false,
  done_at      timestamptz,
  done_by      uuid references public.profiles(id) on delete set null,

  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists goal_milestones_goal_idx
  on public.goal_milestones (goal_id, sort_order);


-- ---------------------------------------------------------------------------
-- 4. Progress is computed, not typed in
-- ---------------------------------------------------------------------------
-- A percentage a human types drifts from the milestones underneath it, and the
-- number is what a parent reads. Deriving it in the database means the bar on
-- the parent's screen cannot disagree with the ticked boxes on the teacher's.
--
-- Goals with no milestones keep whatever was set by hand — the trigger leaves
-- them alone rather than resetting them to zero.
create or replace function public.recalc_goal_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gid   uuid := coalesce(new.goal_id, old.goal_id);
  total integer;
  done  integer;
begin
  select count(*), count(*) filter (where is_done)
    into total, done
  from public.goal_milestones
  where goal_id = gid;

  if total > 0 then
    update public.goals
    set progress_percent = round(done::numeric * 100 / total)::integer
    where id = gid;
  end if;

  return null;
end;
$$;

drop trigger if exists goal_milestones_recalc on public.goal_milestones;
create trigger goal_milestones_recalc
  after insert or update or delete on public.goal_milestones
  for each row execute function public.recalc_goal_progress();


-- ---------------------------------------------------------------------------
-- 5. iep_documents
-- ---------------------------------------------------------------------------
-- A register of the documents that exist, not the files themselves. File
-- storage arrives with Supabase Storage later; a list a parent can see and
-- acknowledge is useful before then, and is honest about what it is.
create table if not exists public.iep_documents (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,

  name         text not null check (btrim(name) <> ''),
  document_date date not null default current_date,
  notes        text,

  -- Set once the file itself lives in Storage. Null until then.
  storage_path text,

  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists iep_documents_set_updated_at on public.iep_documents;
create trigger iep_documents_set_updated_at
  before update on public.iep_documents
  for each row execute function public.set_updated_at();

create index if not exists iep_documents_student_idx
  on public.iep_documents (student_id, document_date desc);


-- ---------------------------------------------------------------------------
-- 6. Acknowledgements — deliberately NOT a signature
-- ---------------------------------------------------------------------------
-- The Figma shows a "Sign Document" button. This records that a guardian
-- confirmed they have READ a document. It is not an electronic signature and
-- must never be presented as one: a real e-signature needs identity assurance,
-- tamper-evidence and a legally admissible audit trail, none of which exist
-- here. Calling this a signature would be a false claim about a legal document.
--
-- Its own table rather than columns on iep_documents, because guardians and
-- staff are the same database role and column-level grants cannot separate
-- "the parent may set acknowledged_at" from "staff may edit the rest".
create table if not exists public.iep_acknowledgements (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.iep_documents(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),

  unique (document_id, profile_id)
);


-- ---------------------------------------------------------------------------
-- 7. Policies
-- ---------------------------------------------------------------------------
alter table public.goals                enable row level security;
alter table public.goal_milestones      enable row level security;
alter table public.iep_documents        enable row level security;
alter table public.iep_acknowledgements enable row level security;

-- Everyone connected to the student reads goals: staff and guardians alike.
-- A goal a parent cannot see is a goal they cannot support at home.
drop policy if exists goals_select on public.goals;
create policy goals_select
  on public.goals for select to authenticated
  using (public.can_view_student(student_id));

-- Only staff write them. A parent contributes through home observations and
-- messages, not by editing the school's plan for their child.
drop policy if exists goals_write_staff on public.goals;
create policy goals_write_staff
  on public.goals for all to authenticated
  using (public.can_staff_view_student(student_id))
  with check (public.can_staff_view_student(student_id));

drop policy if exists goal_milestones_select on public.goal_milestones;
create policy goal_milestones_select
  on public.goal_milestones for select to authenticated
  using (
    exists (
      select 1 from public.goals g
      where g.id = goal_id and public.can_view_student(g.student_id)
    )
  );

drop policy if exists goal_milestones_write_staff on public.goal_milestones;
create policy goal_milestones_write_staff
  on public.goal_milestones for all to authenticated
  using (
    exists (
      select 1 from public.goals g
      where g.id = goal_id and public.can_staff_view_student(g.student_id)
    )
  )
  with check (
    exists (
      select 1 from public.goals g
      where g.id = goal_id and public.can_staff_view_student(g.student_id)
    )
  );

drop policy if exists iep_documents_select on public.iep_documents;
create policy iep_documents_select
  on public.iep_documents for select to authenticated
  using (public.can_view_student(student_id));

drop policy if exists iep_documents_write_staff on public.iep_documents;
create policy iep_documents_write_staff
  on public.iep_documents for all to authenticated
  using (public.can_staff_view_student(student_id))
  with check (public.can_staff_view_student(student_id));

drop policy if exists iep_ack_select on public.iep_acknowledgements;
create policy iep_ack_select
  on public.iep_acknowledgements for select to authenticated
  using (
    exists (
      select 1 from public.iep_documents d
      where d.id = document_id and public.can_view_student(d.student_id)
    )
  );

-- A guardian acknowledges in their own name only. No update and no delete
-- policy: an acknowledgement is a record of something that happened, and
-- un-acknowledging is not a thing.
drop policy if exists iep_ack_insert on public.iep_acknowledgements;
create policy iep_ack_insert
  on public.iep_acknowledgements for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.iep_documents d
      where d.id = document_id and public.is_guardian_of(d.student_id)
    )
  );

revoke all on public.goals                from anon;
revoke all on public.goal_milestones      from anon;
revoke all on public.iep_documents        from anon;
revoke all on public.iep_acknowledgements from anon;


-- ---------------------------------------------------------------------------
-- Done. db/verify.sql: four new tables; policies becomes 40 (8 added here).
-- ---------------------------------------------------------------------------
