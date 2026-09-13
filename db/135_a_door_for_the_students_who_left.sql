-- ---------------------------------------------------------------------------
-- 135 — A door for the students who left
-- ---------------------------------------------------------------------------
-- Saurab: "so how will school admin delete student?"
--
-- They cannot, and they should not be able to. There is no DELETE policy on
-- `students` and db/004 says why in its own comment:
--
--     -- No DELETE policy. Students are deactivated (is_active = false), never
--     -- deleted, so behaviour history and the audit trail survive.
--
-- A child's record carries behaviour logs, goals, IEP plans, consents, session
-- notes and invoices. Deleting it would destroy the record of what a school
-- did for a child, which is the one thing record-keeping obligations exist to
-- keep. db/020 makes the same argument about a cancelled invoice: what
-- happened, happened.
--
-- ---------------------------------------------------------------------------
-- SO THE ANSWER WAS ALREADY DESIGNED. IT WAS NEVER BUILT.
-- ---------------------------------------------------------------------------
-- `students.is_active` has existed since db/002, with this comment:
--
--     -- Students leave. We deactivate rather than delete so their behaviour
--     -- history and audit trail survive, which the record-keeping obligations
--     -- require.
--
-- Every roster query already filters on it. `fetchStudents`, `searchStudents`,
-- `fetchClassroomStats` and `fetchStudentAccounts` all say `is_active = true`.
-- The index `students_is_active_idx` was created for it.
--
-- Nothing in the product has ever written `false` to it. Not one screen, not
-- one function, not the server. The policy was written, the column was made,
-- the queries were filtered — and no door was ever cut. A child who left in
-- 2024 is still on the roll, in every dropdown, and counted in every KPI.
--
-- This is the same shape as db/114, which wrote every policy for home AI
-- review and gave specialists no screen to review on.
--
-- ---------------------------------------------------------------------------
-- WHY TWO NEW COLUMNS AND NOT JUST THE BOOLEAN
-- ---------------------------------------------------------------------------
-- A boolean answers "are they here?" and nothing else. The questions a school
-- actually gets asked are "when did they leave?" and "where did they go?" —
-- from a new school requesting records, from a parent, from an auditor.
--
-- `updated_at` cannot answer the first: it moves whenever anybody corrects a
-- spelling. So `left_at` records the moment, and `left_reason` holds the one
-- line somebody will be glad of in two years ("Moved to Queensland", "Finished
-- Year 6"). Both are nullable, because a student who is here has neither.
--
-- ---------------------------------------------------------------------------
-- WHY A FUNCTION RATHER THAN A PLAIN UPDATE
-- ---------------------------------------------------------------------------
-- `students_update` already lets a school admin write any column on their own
-- school's students, so the UI could set `is_active = false` directly. It
-- should not. Three things have to happen together or the record lies: the
-- flag, the date, and the audit row. db/015 made the same choice for staff
-- verification — "both inside one function so a verification cannot happen
-- without being recorded".
--
-- Returning is deliberately allowed. Students come back, families move back,
-- and a mistake made at four o'clock on a Friday must be undoable. Coming back
-- clears `left_at` and `left_reason` rather than keeping a stale date, and
-- leaves its own audit row, so the history is in the log where it belongs.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. When, and why
-- ---------------------------------------------------------------------------
alter table public.students
  add column if not exists left_at     timestamptz,
  add column if not exists left_reason text;

comment on column public.students.left_at is
  'When this student was marked as having left. Null while they are here. '
  'Distinct from updated_at, which moves on any correction.';

comment on column public.students.left_reason is
  'The school''s own one-line note about why — "Moved to Queensland", '
  '"Finished Year 6". Optional, and never shown to families.';

-- A roster asks for the students who are HERE on every page load, so the
-- partial index is the one that earns its keep. The existing
-- students_is_active_idx covers the whole column; this one is the hot path.
create index if not exists students_active_by_school_idx
  on public.students (school_id)
  where is_active;

-- ---------------------------------------------------------------------------
-- 2. Leaving, and coming back
-- ---------------------------------------------------------------------------
create or replace function public.set_student_left(
  p_student_id uuid,
  p_left       boolean,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
  v_name   text;
  v_was    boolean;
begin
  select school_id, first_name || ' ' || last_name, is_active
    into v_school, v_name, v_was
  from public.students
  where id = p_student_id;

  if v_school is null then
    raise exception 'No such student.' using errcode = '42501';
  end if;

  -- A school admin, for their own school only. Platform admin for support.
  -- Educators are excluded on purpose: they are assigned to a child, which is
  -- not the same authority as deciding the child has left the school.
  if not (
    public.is_platform_admin()
    or (public.is_school_admin() and v_school = public.my_school_id())
  ) then
    raise exception
      'Only a school administrator can record that a student has left.'
      using errcode = '42501';
  end if;

  -- Already in the asked-for state. Nothing to write, nothing to record —
  -- re-pressing must not pad the audit log with events that describe no change.
  if v_was = (not p_left) then
    return;
  end if;

  update public.students
  set is_active   = not p_left,
      left_at     = case when p_left then now() else null end,
      left_reason = case when p_left then nullif(btrim(p_reason), '') else null end
  where id = p_student_id;

  insert into public.admin_audit_events (
    actor_id, action, subject_id, subject_label, detail
  )
  values (
    auth.uid(),
    case when p_left then 'student.left' else 'student.returned' end,
    p_student_id,
    v_name,
    case when p_left
         -- The reason is QUOTED rather than run into the sentence. A note
         -- ending without a full stop would otherwise collide with the next
         -- one: "Reason: moved interstate Their record, history…".
         then coalesce(
                'Marked as having left the school. Reason given: "'
                  || nullif(btrim(p_reason), '') || '".',
                'Marked as having left the school. No reason was recorded.')
              || ' Their record, history and invoices are kept.'
         else 'Returned to the roll. They appear on rosters and in search again.'
    end
  );
end;
$$;

revoke all on function public.set_student_left(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_student_left(uuid, boolean, text)
  to authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   -- the columns exist and are empty for everybody currently enrolled
--   select count(*) from public.students where left_at is not null;   -- 0
--
--   -- a school admin can mark one, and it is recorded
--   select public.set_student_left('<id>', true, 'Moved interstate');
--   select is_active, left_at, left_reason from public.students where id='<id>';
--   select action, subject_label, detail from public.admin_audit_events
--     order by occurred_at desc limit 1;     -- student.left
--
--   -- pressing it twice writes one event, not two
--   select public.set_student_left('<id>', true, 'Moved interstate');
--   select count(*) from public.admin_audit_events where action='student.left'
--     and subject_id='<id>';                -- still 1
--
--   -- and they can come back, which clears the date
--   select public.set_student_left('<id>', false);
--   select is_active, left_at from public.students where id='<id>'; -- true, null
--
-- db/verify.sql: TWO new columns, ONE new function, ONE new index. No new
-- table and no new policy — students_update from db/004 already scopes this to
-- the admin's own school, and the function refuses anybody else regardless.
-- ---------------------------------------------------------------------------
