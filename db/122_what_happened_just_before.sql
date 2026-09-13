-- ---------------------------------------------------------------------------
-- 122 — What happened just before
-- ---------------------------------------------------------------------------
-- Joe asked why the AI's suggestions are generic. They are generic because of
-- this, in server/index.js:
--
--     const payload = buildAnonymousPayload({
--       behaviourType: log.behaviour_type,
--       intensity:     log.intensity,
--       notes:         log.notes,
--       durationSeconds: log.duration_seconds,
--       yearLevel:     student.year_level,
--     })
--
-- Five values. A behaviour category, a severity word, a rough duration, a year
-- level, and whatever the teacher had time to type. Hand a clinician that much
-- about a child and you would get back exactly the advice we are getting.
--
-- ---------------------------------------------------------------------------
-- WE RECORD B. THE METHOD IS ABC.
-- ---------------------------------------------------------------------------
-- Functional behaviour assessment — the actual professional method for this
-- exact problem — is Antecedent, Behaviour, Consequence. `behaviour_logs`
-- records the B in four ways and the A and the C not at all.
--
-- The precision lives in the A. Compare:
--
--   "Threw a chair. High intensity. 4 minutes. Year 2."
--
--   "Threw a chair, after being asked to stop an activity he was absorbed in,
--    with no warning; ended when a familiar adult moved him somewhere quieter;
--    he had slept badly."
--
-- The same incident. The first supports almost no specific advice, so a model
-- answers it with the general truths of classroom practice — which is what
-- "generic" means. The second names an antecedent that can be prevented, a
-- response that already worked for this child, and a reason today was worse
-- than yesterday.
--
-- ---------------------------------------------------------------------------
-- THREE TAPS, BECAUSE THE BUDGET IS THREE SECONDS
-- ---------------------------------------------------------------------------
-- The market research (docs/Team 6, 2025.12.17) sells this product on
-- "3-second logging" and finds that teachers reject anything that adds admin.
-- ECEC — its named primary market — has staff supervising children one-handed.
-- So the A and the C arrive as closed vocabularies on buttons, not as prose.
--
-- Every one of these columns is NULLABLE and stays that way. A teacher mid
-- incident taps a behaviour and an intensity and saves, exactly as before.
-- Anyone with a spare moment afterwards adds the rest. A required field here
-- would be filled with the first option in the list under pressure, which is
-- worse than an honest null.
--
-- ---------------------------------------------------------------------------
-- CLOSED VOCABULARIES ARE ALSO THE PRIVACY ANSWER
-- ---------------------------------------------------------------------------
-- These values are safe to send to the model in a way free text never is: a
-- check constraint cannot contain a child's name, a sibling's name, or a
-- clinic's address. server/anonymise.js redacts prose and then asserts against
-- what survived; there is nothing to redact in 'transition'.
--
-- That is why this migration adds vocabulary rather than a notes field, and it
-- is the same argument docs/17 makes for the wider student profile.
--
-- TEXT WITH A CHECK, NOT AN ENUM. `notes_source` and `student_guardians.
-- relationship` already set this precedent. These lists will be revised once
-- teachers use them, and revising a check constraint is a migration anybody
-- can read; `alter type ... add value` cannot run inside a transaction and
-- cannot remove a mistake.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. The antecedent — what was happening immediately before
-- ---------------------------------------------------------------------------
alter table public.behaviour_logs
  add column if not exists antecedent text
    check (antecedent is null or antecedent in (
      'transition',   -- moving into or out of an activity
      'demand',       -- asked to do something
      'denied',       -- told no, or could not have something
      'waiting',      -- queueing, unstructured time, nothing to do
      'peer',         -- conflict or difficulty with another child
      'sensory',      -- noise, crowding, light, smell
      'change',       -- the routine changed unexpectedly
      'correction',   -- being corrected, told off, or reminded of a rule
      'discomfort',   -- hungry, tired, unwell, needing the toilet
      'unknown'       -- nobody saw it start
    ));

comment on column public.behaviour_logs.antecedent is
  'The A of ABC: what was happening immediately before. Nullable — a teacher '
  'mid-incident is not required to answer. ''unknown'' is a real answer and '
  'means somebody looked; null means nobody was asked.';


-- ---------------------------------------------------------------------------
-- 2. What helped — the consequence half, captured while somebody knows it
-- ---------------------------------------------------------------------------
-- This is outcome data, and it is recorded at the only moment anybody actually
-- knows the answer: in the room, seconds afterwards. Nobody fills in a survey
-- about Tuesday on Friday.
--
-- It is worth as much as the antecedent, because "movement worked twice and
-- being talked to calmly did not" is a fact about THIS child that outranks any
-- general practice guidance a model can offer.
--
-- 'still_escalated' is deliberately available. A vocabulary where every option
-- is a success teaches the database that everything works.
alter table public.behaviour_logs
  add column if not exists what_helped text
    check (what_helped is null or what_helped in (
      'quiet_space',      -- moved somewhere with less going on
      'familiar_adult',   -- a specific person they trust
      'movement',         -- a walk, a job to do, physical activity
      'choice_offered',   -- given two acceptable options
      'demand_reduced',   -- the ask was made smaller or dropped
      'waited_quietly',   -- an adult stayed near and said nothing
      'sensory_item',     -- headphones, a chew, a weighted item, fidget
      'redirected',       -- moved onto something they like
      'nothing_tried',    -- it resolved on its own
      'still_escalated'   -- nothing tried worked
    ));

comment on column public.behaviour_logs.what_helped is
  'The C of ABC, and the only outcome signal captured while somebody still '
  'knows the answer. ''still_escalated'' exists so the vocabulary can record '
  'failure.';


-- ---------------------------------------------------------------------------
-- 3. Setting events — why today was worse than yesterday
-- ---------------------------------------------------------------------------
-- The backdrop, not the trigger. A child who slept badly has a lower threshold
-- for everything, and the same request that was fine on Tuesday produces a
-- meltdown on Wednesday.
--
-- This is the most common reason a strategy "stops working", and without it
-- the record makes a child look like they are deteriorating when they are
-- tired. It is also the field most likely to stop a school escalating a child
-- who simply did not sleep.
--
-- An array because several are true at once, and `<@` because checking every
-- element of an array against a list is what that operator is for.
alter table public.behaviour_logs
  add column if not exists setting_events text[] not null default '{}'
    check (setting_events <@ array[
      'poor_sleep',
      'unwell',
      'medication_change',
      'substitute_adult',    -- a relief teacher, a different room leader
      'routine_disrupted',   -- assembly, excursion, fire drill
      'family_event',        -- something happening at home
      'first_day_back',      -- after a weekend, illness or holiday
      'indoor_play'          -- weather kept everybody inside
    ]::text[]);

comment on column public.behaviour_logs.setting_events is
  'The backdrop that lowered the threshold today. Not a trigger — these do not '
  'cause an incident, they make one likelier. Empty array means not answered.';


-- ---------------------------------------------------------------------------
-- 4. Indexes that pay for the pattern function below
-- ---------------------------------------------------------------------------
-- Partial, because a log with no antecedent contributes nothing to a pattern
-- and there will be plenty of those.
create index if not exists behaviour_logs_antecedent_idx
  on public.behaviour_logs (student_id, antecedent)
  where antecedent is not null;

create index if not exists behaviour_logs_what_helped_idx
  on public.behaviour_logs (student_id, what_helped)
  where what_helped is not null;


-- ---------------------------------------------------------------------------
-- 5. The pattern layer
-- ---------------------------------------------------------------------------
-- WHY THIS IS SQL AND NOT A PROMPT.
--
-- The model currently sees one incident and is asked to advise on a child. The
-- difference between those two things is history, and history is a GROUP BY —
-- it needs no tokens, no reasoning, no network call and no judgement.
--
-- Sending six weeks of raw logs to a model instead would cost a fortune, blow
-- the context, and ask it to do arithmetic, which is the one thing it is worst
-- at. So the counting happens here and the model is handed conclusions.
--
-- IT IS A PRODUCT FEATURE BEFORE IT IS A PROMPT INPUT. A teacher or specialist
-- reading "seven of the last nine followed a demand with no warning" can act on
-- that without any AI in the room, and the UK positioning in the market report
-- ("the evidence required for Ofsted") is exactly this artefact.
--
-- HONESTY ABOUT SMALL SAMPLES. Every figure below carries the count it was
-- computed from, and the trend is withheld entirely under six incidents.
-- "Recovery is getting longer" drawn from two logs is not a finding, and a
-- confident sentence built on two rows is how a product tells a school
-- something false about a child.
--
-- SECURITY INVOKER, deliberately: called from the browser it obeys the RLS the
-- caller is subject to, and called by the server it runs as the service role
-- like everything else there.
-- ---------------------------------------------------------------------------
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
  -- The hour of day that carries the most incidents, and how many. A cluster
  -- is only worth reporting when it is actually a cluster, so the caller gets
  -- the count and decides.
  peak_hour as (
    select extract(hour from occurred_at)::int as hour, count(*)::int as n
    from window_logs
    group by 1
    order by n desc, hour
    limit 1
  ),
  -- Trend in recovery time: mean duration of the older half against the newer
  -- half. Only logs that were actually timed can contribute.
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

    /*
     * Withheld under six timed incidents, and withheld when the two halves are
     * within 20% of each other. A 3% change is noise, and reporting it as a
     * direction is the same fault as a fabricated accuracy figure.
     */
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

comment on function public.student_behaviour_patterns(uuid, integer) is
  'History reduced to conclusions, for the strategy prompt and for the screens. '
  'Counting belongs in the database: it costs no tokens and a model cannot do '
  'arithmetic reliably. Every figure carries its sample size, and the trend is '
  'withheld below six timed incidents.';

revoke all on function public.student_behaviour_patterns(uuid, integer) from anon;
grant execute on function public.student_behaviour_patterns(uuid, integer)
  to authenticated;


-- ---------------------------------------------------------------------------
-- 6. What we already told this child's teachers, and how it went
-- ---------------------------------------------------------------------------
-- `strategy_feedback` (db/006) has recorded 'applied', 'helpful' and
-- 'not_helpful' since the beginning. It is written in exactly one place —
-- src/lib/api.ts — and READ NOWHERE. Every teacher who has ever told us a
-- suggestion did not work has been answered with silence, and the next
-- generation for that child cheerfully suggests it again.
--
-- db/108 already made this argument on the individual side and built the fix:
-- "Of everything that could be fed back, 'I tried this and it did not help' is
-- far and away the most useful, and it was the one thing missing." So an adult
-- asking about their own mornings gets a system that learns from its mistakes,
-- and a child does not.
--
-- This function is the child's version. It reads rows that already exist.
create or replace function public.student_strategy_outcomes(
  p_student_id uuid,
  p_limit      integer default 8
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('title', title, 'outcome', outcome)
      order by last_at desc
    ),
    '[]'::jsonb
  )
  from (
    select
      s.title,
      /*
       * 'dismissed' IS THE NEGATIVE SIGNAL, and reading only 'not_helpful'
       * would have made this function permanently empty.
       *
       * db/006's check constraint allows five actions. The product writes two:
       * StrategyPanel.tsx offers "Applied" and "Not useful", and those are
       * `applied` and `dismissed`. Nothing anywhere has ever written 'helpful'
       * or 'not_helpful' — they are values the constraint permits and no
       * screen produces.
       *
       * The first version of this function filtered on the constraint rather
       * than on what the application actually writes, so it returned nothing
       * for every child, forever, while looking correct. They are kept in the
       * mapping below in case a screen ever starts writing them.
       *
       * ONE VERDICT PER STRATEGY, and the negative wins a tie. Two teachers
       * may disagree. Suppressing something one of them found useless costs a
       * little; re-suggesting something already reported useless is the exact
       * failure this function exists to prevent, and it is the one a teacher
       * notices.
       */
      case
        when bool_or(f.action in ('not_helpful', 'dismissed')) then 'did_not_help'
        when bool_or(f.action = 'helpful')                     then 'helped'
        else 'applied'
      end                as outcome,
      max(f.created_at)  as last_at
    from public.strategy_feedback f
    join public.ai_strategies s on s.id = f.strategy_id
    where s.student_id = p_student_id
      -- 'flagged' is deliberately absent: it means a teacher escalated the
      -- suggestion to a specialist, which is a safeguarding act rather than a
      -- verdict on whether it worked.
      and f.action in ('applied', 'dismissed', 'helpful', 'not_helpful')
    group by s.title
    order by max(f.created_at) desc
    limit p_limit
  ) recent;
$$;

comment on function public.student_strategy_outcomes(uuid, integer) is
  'What was suggested for this child before and how it went. db/006 has '
  'collected this since the beginning and nothing has ever read it. Grouped by '
  'title rather than id so a re-worded repeat of a rejected idea is still '
  'recognised as one.';

revoke all on function public.student_strategy_outcomes(uuid, integer) from anon;
grant execute on function public.student_strategy_outcomes(uuid, integer)
  to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   -- the columns accept the vocabulary and refuse anything else
--   update public.behaviour_logs set antecedent = 'transition' where ...;  -- ok
--   update public.behaviour_logs set antecedent = 'because';               -- refused
--   update public.behaviour_logs set setting_events = '{poor_sleep}';      -- ok
--   update public.behaviour_logs set setting_events = '{hungry}';          -- refused
--
--   -- and the two functions answer for a child you may see
--   select public.student_behaviour_patterns('<student-uuid>');
--   select public.student_strategy_outcomes('<student-uuid>');
--
-- A student with no logs returns {"window_days": 42, "total": 0} and [] — an
-- empty answer, not an error, because the caller must handle a new child.
--
-- db/verify.sql: `functions` gains student_behaviour_patterns and
-- student_strategy_outcomes. No new tables, no new policies — these columns
-- are covered by the behaviour_logs policies that already exist, which is the
-- reason they went on that table rather than into one of their own.
-- ---------------------------------------------------------------------------
