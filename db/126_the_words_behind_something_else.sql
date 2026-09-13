-- ---------------------------------------------------------------------------
-- 126 — The words behind "something else"
-- ---------------------------------------------------------------------------
-- db/125 gave each vocabulary an 'other', and a short note to say what it was,
-- so a teacher could record "the fire alarm went off" instead of picking
-- something untrue or answering nothing.
--
-- The note reached the model. It reached no screen.
--
-- So the timeline rendered the CODE — and the label for that code is
-- "Something else…". A teacher who dictated a sentence read back:
--
--     After something else
--
-- which is worse than having left the field blank, because it looks like an
-- answer and carries none of the information they gave. The escape hatch was
-- write-only in exactly the way db/123 was written to complain about.
--
-- ---------------------------------------------------------------------------
-- A SEPARATE FILE RATHER THAN AN EDIT TO db/123
-- ---------------------------------------------------------------------------
-- db/123 could not have included these columns: db/125 created them afterwards.
-- Editing an applied migration to add something it never knew about rewrites
-- history to look prescient, and db/109 already settled the house answer — a
-- later file fixes an earlier one.
--
-- The view body below is db/123's, copied whole with three columns appended.
-- CREATE OR REPLACE VIEW permits adding at the end and nothing else, so every
-- other branch of the union grows three nulls: only a behaviour log has an
-- antecedent, and a milestone being ticked has no words behind anything.
-- ---------------------------------------------------------------------------

begin;

create or replace view public.student_timeline
with (security_invoker = true) as

-- What a teacher saw in the classroom.
select
  b.student_id                     as student_id,
  'behaviour'::text                as kind,
  b.id                             as source_id,
  b.occurred_at                    as occurred_at,
  null::text                       as title,
  b.notes                          as detail,
  b.behaviour_type                 as behaviour_type,
  b.intensity                      as intensity,
  b.duration_seconds               as duration_seconds,
  b.is_risk_flagged                as is_flagged,
  b.shared_with_parents            as shared_with_parents,
  b.logged_by                      as actor_id,
  b.antecedent                     as antecedent,
  b.what_helped                    as what_helped,
  b.setting_events                 as setting_events,
  b.antecedent_note                as antecedent_note,
  b.what_helped_note               as what_helped_note,
  b.setting_events_note            as setting_events_note
from public.behaviour_logs b

union all

-- What the family saw at home. `observed_on` is a date, so it lands at midnight
-- — deliberately: a parent records that a day went badly, not that 14:32 did.
select
  h.student_id,
  'home',
  h.id,
  h.observed_on::timestamptz,
  h.title,
  h.body,
  null::public.behaviour_type,
  null::public.behaviour_intensity,
  null::integer,
  null::boolean,
  null::boolean,
  h.logged_by,
  null::text,
  null::text,
  null::text[],
  null::text,
  null::text,
  null::text
from public.home_observations h

union all

-- A specialist session. ONLY `shared_summary` — the clinical notes live in
-- `specialist_session_notes` (db/028) and must never be reachable from a
-- timeline a teacher or parent can read.
select
  s.student_id,
  'session',
  s.id,
  s.session_date::timestamptz,
  null,
  s.shared_summary,
  null::public.behaviour_type,
  null::public.behaviour_intensity,
  s.duration_minutes * 60,
  null::boolean,
  s.shared_with_parents,
  s.specialist_id,
  null::text,
  null::text,
  null::text[],
  null::text,
  null::text,
  null::text
from public.specialist_sessions s

union all

-- Progress, which is otherwise invisible: a milestone being ticked is the one
-- moment a goal actually moves, and until now it happened silently inside a
-- progress bar.
select
  g.student_id,
  'milestone',
  m.id,
  m.done_at,
  m.title,
  null,
  null::public.behaviour_type,
  null::public.behaviour_intensity,
  null::integer,
  null::boolean,
  null::boolean,
  m.done_by,
  null::text,
  null::text,
  null::text[],
  null::text,
  null::text,
  null::text
from public.goal_milestones m
join public.goals g on g.id = m.goal_id
where m.is_done and m.done_at is not null

union all

-- An education plan being agreed is an event in a child's year, and a family
-- only ever sees plans that reached that point (db/054).
select
  p.student_id,
  'plan',
  p.id,
  p.agreed_at,
  null,
  p.baseline,
  null::public.behaviour_type,
  null::public.behaviour_intensity,
  null::integer,
  null::boolean,
  null::boolean,
  p.created_by,
  null::text,
  null::text,
  null::text[],
  null::text,
  null::text,
  null::text
from public.iep_plans p
where p.agreed_at is not null;

grant select on public.student_timeline to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   select kind, antecedent, antecedent_note
--   from public.student_timeline
--   where antecedent = 'other';
--   -- the words, not the label for the code
--
--   select distinct kind, antecedent_note from public.student_timeline;
--   -- null on every branch that is not a behaviour log
--
-- db/verify.sql: unchanged. The view is replaced, not added, and it still
-- inherits every policy through security_invoker.
-- ---------------------------------------------------------------------------
