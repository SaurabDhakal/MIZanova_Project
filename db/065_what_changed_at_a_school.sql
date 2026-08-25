-- ===========================================================================
-- 065_what_changed_at_a_school.sql — auditing corrections, not creations
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY, AND WHY THIS SHAPE
-- ---------------------------------------------------------------------------
-- There are three trails already and none of them answers "what changed at
-- this school last week". `student_access_events` records who READ a child's
-- file. `admin_audit_events` records administrative DECISIONS. `student_timeline`
-- answers for one child. A school is the gap.
--
-- The obvious build is to audit everything: an entry for every behaviour log
-- written, every goal created, across thirteen tables. That is the version to
-- avoid, and not only because of volume.
--
-- A created record IS the record. The behaviour log says what happened, who
-- wrote it and when — auditing its creation duplicates the row and tells
-- nobody anything new. What has no other witness is a record being CHANGED
-- after the fact: notes rewritten, an intensity downgraded, a goal quietly
-- discontinued. That is the thing an auditor, a parent, or a court asks about,
-- and until now nothing recorded it at all.
--
-- So this audits corrections and deletions. Volume is then proportional to how
-- often somebody revises history, which is rare — instead of proportional to
-- how busy the school is, which is the growth curve that made db/025 necessary
-- for the access log.
--
-- ---------------------------------------------------------------------------
-- SCOPE: TWO TABLES, DELIBERATELY
-- ---------------------------------------------------------------------------
-- Behaviour logs and goals. They are the two a school would actually be asked
-- about, and starting here means finding out whether anybody reads this before
-- paying for the other eleven tables. The pattern extends unchanged.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The audit trail learns which school an entry belongs to
-- ---------------------------------------------------------------------------
-- Every existing row is an administrative act by Special Miles, which belongs
-- to no school — so null is the correct value for all of them, and no backfill
-- is needed or wanted.
alter table public.admin_audit_events
  add column if not exists school_id uuid references public.organisations(id) on delete set null;

create index if not exists admin_audit_events_school_idx
  on public.admin_audit_events (school_id, occurred_at desc);


-- ---------------------------------------------------------------------------
-- 2. A behaviour log changed after it was written
-- ---------------------------------------------------------------------------
-- db/010 already stops a flagged log being edited once an administrator has
-- acknowledged it. Everything before that moment is editable and, until now,
-- editable silently.
create or replace function public.audit_behaviour_log_edited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed text[] := '{}';
  v_school uuid;
  v_child  text;
begin
  -- Only the fields that change what the record SAYS. `updated_at` moving, or
  -- a safeguarding acknowledgement being stamped, is not somebody rewriting an
  -- account of what happened to a child.
  if new.notes is distinct from old.notes then
    -- ::text on every bare literal. `text[] || 'notes'` is ambiguous and
    -- Postgres resolves it by trying to read the literal AS an array —
    -- "malformed array literal". The format() branches below are safe
    -- because format() is already typed; these are not.
    changed := changed || 'notes'::text;
  end if;
  if new.behaviour_type is distinct from old.behaviour_type then
    changed := changed || format('type %s to %s', old.behaviour_type::text, new.behaviour_type::text);
  end if;
  if new.intensity is distinct from old.intensity then
    changed := changed || format('intensity %s to %s', old.intensity::text, new.intensity::text);
  end if;
  if new.is_risk_flagged is distinct from old.is_risk_flagged then
    changed := changed || (case when new.is_risk_flagged
                             then 'flagged for safeguarding'
                             else 'safeguarding flag removed' end)::text;
  end if;
  if new.occurred_at is distinct from old.occurred_at then
    changed := changed || 'when it happened'::text;
  end if;

  if array_length(changed, 1) is null then
    return null;
  end if;

  select s.school_id, s.display_name into v_school, v_child
  from public.students s where s.id = new.student_id;

  insert into public.admin_audit_events
    (actor_id, school_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    v_school,
    'behaviour_log.edited',
    new.id,
    coalesce(v_child, 'A student'),
    -- The old text in full. A diff would be smaller and useless: the question
    -- is always "what did it say before", and an answer that requires
    -- reconstructing it is not an answer.
    format('Changed %s.%s',
      array_to_string(changed, ', '),
      case when new.notes is distinct from old.notes
           then ' Previous notes: ' || coalesce(nullif(btrim(old.notes), ''), '(empty)')
           else '' end
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_behaviour_log_edited on public.behaviour_logs;
create trigger audit_behaviour_log_edited
  after update on public.behaviour_logs
  for each row execute function public.audit_behaviour_log_edited();


-- ---------------------------------------------------------------------------
-- 3. A behaviour log removed
-- ---------------------------------------------------------------------------
-- `old` is all there is by the time this runs, so the entry has to carry
-- enough to know what was destroyed.
create or replace function public.audit_behaviour_log_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
  v_child  text;
begin
  select s.school_id, s.display_name into v_school, v_child
  from public.students s where s.id = old.student_id;

  insert into public.admin_audit_events
    (actor_id, school_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    v_school,
    'behaviour_log.deleted',
    old.id,
    coalesce(v_child, 'A student'),
    format('%s, %s intensity, recorded %s. Notes: %s',
      old.behaviour_type::text,
      old.intensity::text,
      to_char(old.occurred_at, 'DD Mon YYYY HH24:MI'),
      coalesce(nullif(btrim(old.notes), ''), '(empty)')
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_behaviour_log_deleted on public.behaviour_logs;
create trigger audit_behaviour_log_deleted
  after delete on public.behaviour_logs
  for each row execute function public.audit_behaviour_log_deleted();


-- ---------------------------------------------------------------------------
-- 4. A goal changed, and in particular a goal quietly abandoned
-- ---------------------------------------------------------------------------
-- 'discontinued' is the one worth catching. A goal that stops being worked on
-- without anybody saying so is the disagreement a family has months later.
create or replace function public.audit_goal_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed text[] := '{}';
  v_school uuid;
  v_child  text;
begin
  if new.status is distinct from old.status then
    changed := changed || format('status %s to %s',
      replace(old.status::text, '_', ' '), replace(new.status::text, '_', ' '));
  end if;
  if new.title is distinct from old.title then
    changed := changed || format('title, was "%s"', old.title);
  end if;
  if new.description is distinct from old.description then
    changed := changed || 'description'::text;
  end if;
  if new.target_date is distinct from old.target_date then
    changed := changed || format('target date %s to %s',
      coalesce(old.target_date::text, 'none'), coalesce(new.target_date::text, 'none'));
  end if;

  -- Progress alone is left out on purpose. It moves constantly and by design;
  -- auditing it would bury the four changes above in noise.
  if array_length(changed, 1) is null then
    return null;
  end if;

  select s.school_id, s.display_name into v_school, v_child
  from public.students s where s.id = new.student_id;

  insert into public.admin_audit_events
    (actor_id, school_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    v_school,
    case when new.status is distinct from old.status
         then 'goal.status_changed' else 'goal.edited' end,
    new.id,
    coalesce(v_child, 'A student') || ' — ' || new.title,
    'Changed ' || array_to_string(changed, ', ') || '.'
  );
  return null;
end;
$$;

drop trigger if exists audit_goal_changed on public.goals;
create trigger audit_goal_changed
  after update on public.goals
  for each row execute function public.audit_goal_changed();


create or replace function public.audit_goal_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
  v_child  text;
begin
  select s.school_id, s.display_name into v_school, v_child
  from public.students s where s.id = old.student_id;

  insert into public.admin_audit_events
    (actor_id, school_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    v_school,
    'goal.deleted',
    old.id,
    coalesce(v_child, 'A student') || ' — ' || old.title,
    format('Was %s at %s%%. %s',
      replace(old.status::text, '_', ' '),
      old.progress_percent,
      coalesce(nullif(btrim(old.description), ''), '')
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_goal_deleted on public.goals;
create trigger audit_goal_deleted
  after delete on public.goals
  for each row execute function public.audit_goal_deleted();

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select tgname, tgrelid::regclass from pg_trigger
--   where tgname like 'audit_%' and not tgisinternal order by tgname;
--
-- Then edit a behaviour log's notes and reload the Audit Log. One entry, naming
-- the school, the child, what changed and what the notes said before. Change
-- the progress on a goal and nothing appears, which is also correct.
--
-- ---------------------------------------------------------------------------
-- RETENTION — READ BEFORE THIS SEES A REAL SCHOOL
-- ---------------------------------------------------------------------------
-- These entries hold copies of behaviour-log notes, which is the most sensitive
-- text in the product, in a second place with its own lifetime. db/025 expires
-- the access log for exactly this reason under APP 11.2, and nothing expires
-- admin_audit_events yet.
--
-- Auditing corrections rather than creations keeps the volume proportional to
-- how often history is revised, which is rare — so this is a smaller problem
-- than the access log, not an absent one. A retention rule belongs here before
-- a real school is onboarded, and the decision needed is how long a correction
-- to a child's record must remain answerable for.
-- ---------------------------------------------------------------------------
