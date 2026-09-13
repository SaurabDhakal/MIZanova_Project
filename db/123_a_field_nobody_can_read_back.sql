-- ---------------------------------------------------------------------------
-- 123 — A field nobody can read back
-- ---------------------------------------------------------------------------
-- db/122 added the antecedent, what helped, and the setting events, and wired
-- all three into the model. It gave nobody a way to SEE them.
--
-- A teacher taps "Changing activity", saves, and the answer disappears. It
-- reaches Anthropic and it does not reach the colleague covering the class
-- tomorrow, the specialist reviewing the caseload, or the teacher themselves
-- ten minutes later. There is no screen in this product on which that tap is
-- visible.
--
-- That is the exact fault db/122's own header criticises `strategy_feedback`
-- for — "written in exactly one place and READ NOWHERE" — reproduced, in the
-- same migration that complained about it. Data collected from a busy person
-- and shown only to a machine is a worse deal than not collecting it: they
-- spent the four seconds, and they get nothing for it.
--
-- ---------------------------------------------------------------------------
-- WHY THE VIEW, RATHER THAN A SECOND QUERY IN THE SCREEN
-- ---------------------------------------------------------------------------
-- `student_timeline` (db/056) is the one place this product answers "what has
-- happened to this child", and every role reads it through the same policies.
-- A separate fetch of `behaviour_logs` on the timeline screen would be a second
-- door onto the same rows — which is precisely what db/055 was written to
-- close.
--
-- CREATE OR REPLACE VIEW permits adding columns at the END and nothing else, so
-- the three arrive last and every other branch of the union declares them null.
-- Only a behaviour log has an antecedent: a milestone being ticked does not.
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
  b.setting_events                 as setting_events
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
  null::text[]
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
  null::text[]
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
  null::text[]
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
  null::text[]
from public.iep_plans p
where p.agreed_at is not null;

grant select on public.student_timeline to authenticated;


-- ---------------------------------------------------------------------------
-- Nothing worked, repeatedly
-- ---------------------------------------------------------------------------
-- `what_helped` carries 'still_escalated' so the vocabulary can record failure.
-- db/122 then excluded it from the "what has helped" ranking — correctly, it
-- did not help — and put it nowhere else, so the single most serious thing a
-- teacher can report was collected and discarded.
--
-- A child for whom nothing an adult tried worked, three times in a fortnight,
-- is not a child who needs a better classroom strategy. That is the point at
-- which the honest answer is a specialist, and it is a question no screen in
-- this product can currently ask.
--
-- Added to the pattern function rather than a new one, because it is the same
-- history being counted and a second function would drift from the first.
create or replace function public.student_behaviour_patterns(
  p_student_id uuid,
  p_days       integer default 42
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with window_logs as (
    select *
    from public.behaviour_logs
    where student_id = p_student_id
      and occurred_at >= now() - make_interval(days => p_days)
  ),
  counted as (
    select count(*)::int as total from window_logs
  ),
  top_antecedent as (
    select antecedent as value, count(*)::int as n
    from window_logs
    where antecedent is not null and antecedent <> 'unknown'
    group by antecedent
    order by n desc, value
    limit 1
  ),
  helped_ranked as (
    select jsonb_agg(
             jsonb_build_object('value', value, 'times', n)
             order by n desc, value
           ) as items
    from (
      select what_helped as value, count(*)::int as n
      from window_logs
      where what_helped is not null
        and what_helped not in ('nothing_tried', 'still_escalated')
      group by what_helped
      order by n desc, value
      limit 3
    ) ranked
  ),
  peak_hour as (
    select extract(hour from occurred_at)::int as hour, count(*)::int as n
    from window_logs
    group by 1
    order by n desc, hour
    limit 1
  ),
  timed as (
    select duration_seconds, occurred_at,
           ntile(2) over (order by occurred_at) as half
    from window_logs
    where duration_seconds is not null
  ),
  trend as (
    select
      avg(duration_seconds) filter (where half = 1) as earlier,
      avg(duration_seconds) filter (where half = 2) as later,
      count(*)::int                                 as timed_count
    from timed
  ),
  settings as (
    select jsonb_agg(jsonb_build_object('value', value, 'times', n)
                     order by n desc, value) as items
    from (
      select unnest(setting_events) as value, count(*)::int as n
      from window_logs
      group by 1
      order by n desc, value
      limit 3
    ) s
  ),
  -- Counted, not judged. The number is reported and the caller decides what it
  -- means; a threshold buried in SQL is a clinical opinion nobody can see.
  nothing_worked as (
    select count(*)::int as n
    from window_logs
    where what_helped = 'still_escalated'
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'window_days',   p_days,
    'total',         (select total from counted),

    'top_antecedent',
      (select jsonb_build_object('value', value, 'times', n)
       from top_antecedent),

    'what_has_helped', (select items from helped_ranked),

    'peak_hour',
      (select jsonb_build_object('hour', hour, 'times', n) from peak_hour),

    'common_setting_events', (select items from settings),

    -- Null rather than 0 when it has never happened, so jsonb_strip_nulls
    -- removes the key entirely and no screen has to render "nothing worked: 0".
    'nothing_worked',
      (select case when n > 0 then n else null end from nothing_worked),

    'recovery_trend',
      (select case
         when timed_count < 6 or earlier is null or later is null then null
         when later > earlier * 1.2 then 'lengthening'
         when later < earlier * 0.8 then 'shortening'
         else 'steady'
       end
       from trend),

    'recovery_trend_from',
      (select case when timed_count >= 6 then timed_count else null end
       from trend)
  ));
$$;

revoke all on function public.student_behaviour_patterns(uuid, integer) from anon;
grant execute on function public.student_behaviour_patterns(uuid, integer)
  to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   select kind, antecedent, what_helped, setting_events
--   from public.student_timeline
--   where student_id = '<uuid>' and kind = 'behaviour';
--
--   -- and a non-behaviour row carries nulls rather than a wrong answer
--   select distinct kind, antecedent from public.student_timeline;
--
-- db/verify.sql: no new tables and no new policies. The view is replaced, not
-- added, and it still inherits every policy through security_invoker.
-- ---------------------------------------------------------------------------
