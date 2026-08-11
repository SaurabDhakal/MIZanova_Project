-- ===========================================================================
-- 056 — One child, one story
-- ===========================================================================
-- A single date-ordered stream of everything that happened to a student:
-- behaviour logged, something shared from home, a specialist session, a goal
-- milestone ticked, an education plan agreed.
--
-- WHY. The child's record currently splits the same child's story across five
-- lists ordered BY TYPE, when the question anybody actually asks is ordered BY 
-- TIME. "What has been going on with Ethan?" meant reading five sections and
-- interleaving them by hand. Measured before this: a child with 35 behaviour
-- logs rendered 37.8 screens, of which behaviour history alone was 33.2 — and a
-- child with NO data at all still rendered 2.4 screens of five separate empty
-- states.
--
-- ---------------------------------------------------------------------------
-- security_invoker = true, AND IT IS DOING THE ENTIRE ACCESS-CONTROL JOB
-- ---------------------------------------------------------------------------
-- Written first, not last. db/055 exists because the previous view in this
-- product shipped without it and let any signed-in account read any school's
-- support hours.
--
-- Here it is not merely a fix, it is the design. Because the view runs as its
-- CALLER, every row is filtered by the policy on the table it came from, and
-- each role gets a different timeline out of one definition:
--
--   a parent      sees behaviour logs only where shared_with_parents, their own
--                 home observations, and sessions shared with parents
--   a teacher     sees every behaviour log for a student they are assigned to,
--                 and sessions a specialist chose to share with teachers
--   a specialist  sees their own sessions in full
--   a school admin sees no sessions at all (db/028)
--
-- None of that is written here. It is all inherited. Any attempt to re-state
-- those rules in this file would be a second copy of the truth, and the second
-- copy is the one that goes stale.
--
-- ---------------------------------------------------------------------------
-- COLUMNS THAT DO NOT APPLY ARE NULL, NOT FALSE
-- ---------------------------------------------------------------------------
-- `is_flagged` on a home observation is not `false` — a home observation cannot
-- be flagged for safeguarding, so the honest answer is "does not apply".
-- Writing false would let a screen render "not flagged" against a row where the
-- concept does not exist, which is the same class of mistake as the invented
-- expiry date in db/051.
-- ===========================================================================

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
  b.logged_by                      as actor_id
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
  h.logged_by
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
  s.specialist_id
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
  m.done_by
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
  p.created_by
from public.iep_plans p
where p.agreed_at is not null;

grant select on public.student_timeline to authenticated;
