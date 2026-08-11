-- ===========================================================================
-- MiZanova — 002_students.sql
-- Students, who is allowed to be connected to them, and consent.
--
-- Run 001_foundation.sql first.
-- SAFE TO RUN TWICE.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. students
-- ---------------------------------------------------------------------------
-- The heart of the product. Everything else — behaviour logs, strategies,
-- goals, messages — hangs off a row in this table.
create table if not exists public.students (
  id           uuid primary key default gen_random_uuid(),

  -- not null, unlike profiles.school_id: a student ALWAYS belongs to a school.
  -- This is the column every RLS policy will check to keep schools separated.
  school_id    uuid not null references public.schools(id) on delete restrict,

  first_name   text not null,
  last_name    text not null,

  -- =====================================================================
  -- THE PRIVACY GUARANTEE, ENFORCED BY POSTGRES
  -- =====================================================================
  -- Locked decision: parents see first name + initial only — "Ethan M."
  --
  -- This is a GENERATED column. Postgres computes it on every write and the
  -- value cannot be inserted or updated directly. So parent-facing screens
  -- select display_name, and there is no way for a future developer — or a
  -- careless `select *` — to leak a surname through that path. The rule lives
  -- in the database, where it cannot be forgotten, rather than in UI code
  -- that has to remember it on all 42 screens.
  --
  -- The `case` handles a missing surname so we never render "Ethan .".
  display_name text generated always as (
                 btrim(
                   first_name || ' ' ||
                   case when btrim(last_name) <> ''
                        then left(btrim(last_name), 1) || '.'
                        else '' end
                 )
               ) stored,

  date_of_birth date,

  -- Free text on purpose: Australian states disagree (NSW says Kindergarten,
  -- QLD and VIC say Prep). A check constraint here would reject real schools.
  year_level   text,

  -- The school's own identifier for this student, as printed on their roll —
  -- the "#4021" in the Figma designs. Not our primary key.
  external_ref text,

  -- Students leave. We deactivate rather than delete so their behaviour history
  -- and audit trail survive, which the record-keeping obligations require.
  is_active    boolean not null default true,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- A school cannot have two students with the same roll number.
  unique (school_id, external_ref)
);

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

create index if not exists students_school_id_idx on public.students (school_id);
create index if not exists students_is_active_idx on public.students (is_active);


-- ---------------------------------------------------------------------------
-- 2. student_guardians — which parent accounts may see which student
-- ---------------------------------------------------------------------------
-- A join table, because the relationship is many-to-many in real life: a child
-- can have two parents in the app, and a parent can have three children at the
-- school. Storing a single parent_id on students would model neither.
--
-- This table IS the parent's permission. The RLS policy in 003 will read it to
-- answer "may this signed-in parent see this student?".
create table if not exists public.student_guardians (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,

  relationship text not null default 'guardian'
                 check (relationship in
                   ('mother','father','parent','carer','guardian','other')),

  -- Who receives the daily summary and is contacted first.
  is_primary   boolean not null default false,

  created_at   timestamptz not null default now(),

  -- The same person cannot be linked to the same child twice.
  unique (student_id, profile_id)
);

create index if not exists student_guardians_student_idx
  on public.student_guardians (student_id);
create index if not exists student_guardians_profile_idx
  on public.student_guardians (profile_id);


-- ---------------------------------------------------------------------------
-- 3. student_educators — which staff member may see which student
-- ---------------------------------------------------------------------------
-- Same idea for staff. Being an educator at a school is NOT enough to see every
-- student in it; you see the students you are assigned to. That is the
-- least-privilege reading of the brief, and it is what makes the safeguarding
-- rules meaningful.
--
-- Specialists appear here too — their caseload is rows in this table.
create table if not exists public.student_educators (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,

  -- 'class_teacher' for the educator who logs day to day, 'specialist' for a
  -- clinician carrying this student on their caseload, 'support' for aides.
  assignment   text not null default 'class_teacher'
                 check (assignment in ('class_teacher','support','specialist')),

  created_at   timestamptz not null default now(),

  unique (student_id, profile_id, assignment)
);

create index if not exists student_educators_student_idx
  on public.student_educators (student_id);
create index if not exists student_educators_profile_idx
  on public.student_educators (profile_id);


-- ---------------------------------------------------------------------------
-- 4. consents — FR25
-- ---------------------------------------------------------------------------
-- Consent is not a checkbox on the students table. Under the Australian
-- Privacy Principles you have to be able to show WHAT was consented to, BY
-- WHOM, WHEN, against WHICH version of the privacy notice, and whether it was
-- later withdrawn. A boolean can answer none of those questions.
--
-- Rows here are a record, not a setting. Revoking sets revoked_at; it does not
-- delete the row, because "consent was given then withdrawn on 3 March" is
-- itself the fact you must be able to prove.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'consent_type') then
    create type public.consent_type as enum (
      'data_processing',        -- storing the student's records at all
      'ai_strategy_generation', -- sending anonymised context to the AI
      'parent_portal_access',   -- this guardian may use the parent portal
      'specialist_referral',    -- may be referred to a specialist
      'photo_media'             -- images may be stored
    );
  end if;
end $$;

create table if not exists public.consents (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students(id) on delete cascade,

  -- The guardian who gave it. Kept even if their account is later removed, so
  -- the record stays provable — hence `on delete set null`, not cascade.
  granted_by     uuid references public.profiles(id) on delete set null,

  consent_type   public.consent_type not null,

  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz,

  -- Which version of the privacy notice they were shown. Without this you
  -- cannot demonstrate WHAT they agreed to once the wording changes.
  policy_version text not null default 'v1',

  notes          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Cannot be revoked before it was granted.
  constraint consents_revoked_after_granted
    check (revoked_at is null or revoked_at >= granted_at)
);

drop trigger if exists consents_set_updated_at on public.consents;
create trigger consents_set_updated_at
  before update on public.consents
  for each row execute function public.set_updated_at();

create index if not exists consents_student_idx on public.consents (student_id);

-- Only ONE live consent of each type per student. A student cannot have two
-- simultaneously active 'ai_strategy_generation' consents saying different
-- things. Revoked rows are excluded, so the full history is still kept.
create unique index if not exists consents_one_active_per_type
  on public.consents (student_id, consent_type)
  where revoked_at is null;


-- ---------------------------------------------------------------------------
-- 5. Helper: is consent currently active?
-- ---------------------------------------------------------------------------
-- Used by application code and, later, by the AI pipeline: before any student
-- context is sent for strategy generation, this must return true.
create or replace function public.has_active_consent(
  p_student_id uuid,
  p_type       public.consent_type
)
returns boolean
language sql
stable
security invoker      -- respects the caller's RLS, deliberately
set search_path = public
as $$
  select exists (
    select 1
    from public.consents c
    where c.student_id = p_student_id
      and c.consent_type = p_type
      and c.revoked_at is null
  );
$$;


-- ---------------------------------------------------------------------------
-- 6. Lock everything down
-- ---------------------------------------------------------------------------
-- Same reasoning as 001: denied by default, permissions granted deliberately
-- in 003. These tables hold children's records — they do not go near the
-- internet without policies written on purpose.
alter table public.students          enable row level security;
alter table public.student_guardians enable row level security;
alter table public.student_educators enable row level security;
alter table public.consents          enable row level security;


-- ---------------------------------------------------------------------------
-- Done. Run db/verify.sql to see the new state.
-- ---------------------------------------------------------------------------
