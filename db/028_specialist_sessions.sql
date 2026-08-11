-- ===========================================================================
-- 028_specialist_sessions.sql — the specialist's own record of a session
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- From docs/Full and final figma design/Clinical Session Entry.png, with two
-- deliberate departures.
--
-- 1. TWO NOTE FIELDS, NOT ONE.
--
-- The design has a single "Clinical observations" box and two switches that
-- share it with the teacher and the parent, under a line reading "HIPAA Ready:
-- all shared summaries are automatically sanitized of restricted PHI."
--
-- Nothing sanitises anything. There is no such mechanism here or anywhere in
-- this product, and HIPAA is United States law — the Australian Privacy
-- Principles are what apply. A false assurance printed on the most sensitive
-- screen in the system is worse than no assurance, because a clinician reads
-- it and writes more freely than they otherwise would.
--
-- So the record separates what a specialist writes for themselves from what
-- they choose to say to others:
--
--   specialist_sessions        the facts, and a summary written FOR others
--   specialist_session_notes   the professional record. Specialists only.
--
-- TWO TABLES, NOT TWO COLUMNS, and that is the whole point. A first draft put
-- clinical_notes on the same row behind a comment promising the application
-- would not show it to anyone. That is not a boundary: once a row is shared,
-- Row-Level Security permits the whole row, and Postgres column grants apply
-- to a ROLE rather than a row — every signed-in user is `authenticated`, so
-- there is no grant that hides a column from a teacher while showing it to a
-- specialist.
--
-- Separate tables mean sharing a session cannot expose the notes, because the
-- notes are not in the thing being shared.
--
-- 2. SCHOOL ADMINISTRATORS CANNOT READ THESE.
--
-- Everywhere else in MiZanova a school admin sees their whole school. Not
-- here. A speech therapist's session notes about a child are closer to health
-- information than to a behaviour log, and "the principal can read every
-- therapy note in the school" is not something a family would assume when they
-- consented to a referral.
--
-- They still see that sessions HAPPENED through goals and IEP documents. They
-- do not see what was written in them. Say so before changing it.

begin;

create table if not exists public.specialist_sessions (
  id             uuid primary key default gen_random_uuid(),

  student_id     uuid not null references public.students(id) on delete cascade,
  -- The specialist who ran it. Kept on delete so the record does not lose its
  -- author, in the same way consents keep granted_by.
  specialist_id  uuid references public.profiles(id) on delete set null,

  session_date   date not null default current_date,
  duration_minutes integer not null default 30 check (duration_minutes > 0),

  -- Which IEP goal this session worked on, if any. Optional: not every
  -- session maps onto one, and forcing a choice produces a wrong one.
  goal_id        uuid references public.goals(id) on delete set null,

  -- The design's "8 / 10 → 80%". Stored as the two counts, never the
  -- percentage: a percentage cannot be re-derived into the trials behind it,
  -- and "8 of 10" and "80 of 100" are very different sessions.
  trials_successful integer check (trials_successful >= 0),
  trials_total      integer check (trials_total > 0),
  constraint sessions_trials_make_sense
    check (
      (trials_successful is null and trials_total is null)
      or (trials_successful is not null and trials_total is not null
          and trials_successful <= trials_total)
    ),

  -- Written FOR a teacher or a family. Everything a specialist writes for
  -- themselves lives in specialist_session_notes.
  shared_summary text,

  shared_with_teacher boolean not null default false,
  shared_with_parents boolean not null default false,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists specialist_sessions_student_idx
  on public.specialist_sessions (student_id, session_date desc);

drop trigger if exists specialist_sessions_set_updated_at on public.specialist_sessions;
create trigger specialist_sessions_set_updated_at
  before update on public.specialist_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sharing cannot be claimed without something to share
-- ---------------------------------------------------------------------------
-- A session marked "shared with parents" whose summary is empty tells a family
-- nothing while appearing to include them. Either write something for them or
-- do not tell them you did.
create or replace function public.sessions_require_summary_to_share()
returns trigger
language plpgsql
as $$
begin
  if (new.shared_with_teacher or new.shared_with_parents)
     and coalesce(btrim(new.shared_summary), '') = '' then
    raise exception
      'Write a summary before sharing this session. Clinical notes are never shared.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists specialist_sessions_summary_guard on public.specialist_sessions;
create trigger specialist_sessions_summary_guard
  before insert or update on public.specialist_sessions
  for each row execute function public.sessions_require_summary_to_share();

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
alter table public.specialist_sessions enable row level security;

-- Specialists assigned to this student. The professional record, in full.
drop policy if exists specialist_sessions_select_specialist on public.specialist_sessions;
create policy specialist_sessions_select_specialist
  on public.specialist_sessions for select to authenticated
  using (
    public.my_role() = 'specialist'
    and public.is_assigned_staff_for(student_id)
  );

-- Platform admins, for support and audit. Not school admins — see the note at
-- the top of this file.
drop policy if exists specialist_sessions_select_platform on public.specialist_sessions;
create policy specialist_sessions_select_platform
  on public.specialist_sessions for select to authenticated
  using (public.is_platform_admin());

-- An assigned teacher sees a session only once it has been shared with them.
drop policy if exists specialist_sessions_select_teacher on public.specialist_sessions;
create policy specialist_sessions_select_teacher
  on public.specialist_sessions for select to authenticated
  using (
    shared_with_teacher
    and public.my_role() = 'educator'
    and public.is_assigned_staff_for(student_id)
  );

-- A guardian likewise.
drop policy if exists specialist_sessions_select_guardian on public.specialist_sessions;
create policy specialist_sessions_select_guardian
  on public.specialist_sessions for select to authenticated
  using (shared_with_parents and public.is_guardian_of(student_id));

-- Only an assigned specialist writes one, and only as themselves.
drop policy if exists specialist_sessions_insert on public.specialist_sessions;
create policy specialist_sessions_insert
  on public.specialist_sessions for insert to authenticated
  with check (
    public.my_role() = 'specialist'
    and public.is_assigned_staff_for(student_id)
    and specialist_id = auth.uid()
  );

-- And only its author may change it. Another specialist on the same caseload
-- can read it; rewriting a colleague's clinical record is a different thing.
drop policy if exists specialist_sessions_update on public.specialist_sessions;
create policy specialist_sessions_update
  on public.specialist_sessions for update to authenticated
  using (specialist_id = auth.uid())
  with check (specialist_id = auth.uid());

-- No delete policy. A session that happened, happened.

revoke all on public.specialist_sessions from anon;

-- ---------------------------------------------------------------------------
-- The clinical record itself
-- ---------------------------------------------------------------------------
-- One row per session, in its own table so that sharing a session cannot
-- reach it. Nothing here is ever visible to a teacher, a family, or a school
-- administrator, whatever the sharing switches say.
create table if not exists public.specialist_session_notes (
  session_id uuid primary key
               references public.specialist_sessions(id) on delete cascade,
  notes      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists specialist_session_notes_set_updated_at
  on public.specialist_session_notes;
create trigger specialist_session_notes_set_updated_at
  before update on public.specialist_session_notes
  for each row execute function public.set_updated_at();

alter table public.specialist_session_notes enable row level security;

-- Readable only by a specialist assigned to that child, and by platform
-- admins. Deliberately NOT school admins: a principal reading every therapy
-- note in the school is not what a family agrees to when they consent to a
-- referral.
drop policy if exists session_notes_select on public.specialist_session_notes;
create policy session_notes_select
  on public.specialist_session_notes for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.specialist_sessions s
      where s.id = session_id
        and public.my_role() = 'specialist'
        and public.is_assigned_staff_for(s.student_id)
    )
  );

-- Written and revised only by the specialist who ran the session. A colleague
-- on the same caseload may read a clinical note; rewriting one is different.
drop policy if exists session_notes_write on public.specialist_session_notes;
create policy session_notes_write
  on public.specialist_session_notes for all to authenticated
  using (
    exists (
      select 1 from public.specialist_sessions s
      where s.id = session_id and s.specialist_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.specialist_sessions s
      where s.id = session_id and s.specialist_id = auth.uid()
    )
  );

revoke all on public.specialist_session_notes from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked, from the BROWSER CONSOLE.
--
-- As a specialist assigned to the child, after logging a session:
--   await supabase.from('specialist_sessions').select('*')        -- the row
--   await supabase.from('specialist_session_notes').select('*')   -- the notes
--
-- As the assigned TEACHER, once the session is shared with them:
--   await supabase.from('specialist_sessions').select('*')        -- the row
--   await supabase.from('specialist_session_notes').select('*')   -- EMPTY
--
-- That second pair is the point of the design. The teacher can see the session
-- and the summary written for them, and cannot reach the clinical record even
-- by asking the API directly.
-- ---------------------------------------------------------------------------
