-- ---------------------------------------------------------------------------
-- 130 — What actually comes first
-- ---------------------------------------------------------------------------
-- A review of the antecedent list against what genuinely precedes an incident
-- in a classroom, rather than against what was easy to name when db/122 was
-- written in an afternoon.
--
-- Functional behaviour assessment recognises four broad reasons a behaviour
-- happens: to escape something, to get attention, to get an item or activity,
-- and for sensory reasons. The list db/122 shipped covers escape (demand),
-- tangible (denied) and sensory well. IT HAS NO ENTRY FOR ATTENTION AT ALL —
-- a quarter of the standard model, and the one every teacher recognises
-- instantly.
--
-- ---------------------------------------------------------------------------
-- 1. ADULT ATTENTION MOVED AWAY
-- ---------------------------------------------------------------------------
-- The teacher turns to another child, answers the door, takes a reading group.
-- This is one of the most common precursors there is and it was unnameable, so
-- it was being recorded as 'other', 'unknown', or not at all.
--
-- It matters because the remedy is specific and unlike every other one on the
-- list: brief, scheduled attention BEFORE it is sought, rather than attention
-- as the thing that ends an incident — which teaches the incident.
--
-- ---------------------------------------------------------------------------
-- 2. THE WORK WAS TOO HARD
-- ---------------------------------------------------------------------------
-- 'demand' conflated two different events with two different answers: "I asked
-- them to line up" and "I gave them work beyond them". The first is answered by
-- asking for less or giving a choice; the second by changing the work or
-- sitting down and helping. A teacher choosing 'demand' for both makes the
-- pattern layer average them into advice that fits neither.
--
-- ---------------------------------------------------------------------------
-- 3. EVERY ANTECEDENT SHOULD HAVE A PLAUSIBLE RESPONSE
-- ---------------------------------------------------------------------------
-- The two additions above had no matching entry in `what_helped`, so a teacher
-- could record the cause and not the cure. Added: giving attention, and helping
-- with the work — which is NOT 'demand_reduced' (asking for less) but staying
-- and doing it with them.
--
-- ---------------------------------------------------------------------------
-- 4. THE SHARED VOCABULARY MEANS FIVE CONSTRAINTS MOVE TOGETHER
-- ---------------------------------------------------------------------------
-- db/127 reused these lists for `student_profiles.triggers` and `.helps`, and
-- db/124 for `evidence_strategies.applies_to`, so a school's belief, its logged
-- evidence, and the fallback library all speak one language. That is the whole
-- point of it — and it means adding a value touches five check constraints. If
-- a future change updates fewer than five, the vocabularies have silently
-- forked and the comparison in the Patterns panel stops being sound.
--
-- 'unknown' and 'other' remain excluded from `applies_to` and `triggers`, for
-- db/124's reason: a strategy cannot be written for the absence of information,
-- and a standing profile has no incident to be uncertain about.
-- ---------------------------------------------------------------------------

begin;

-- 1 of 5 — the log's antecedent
alter table public.behaviour_logs
  drop constraint if exists behaviour_logs_antecedent_check;
alter table public.behaviour_logs
  add constraint behaviour_logs_antecedent_check
    check (antecedent is null or antecedent in (
      'demand', 'transition', 'denied', 'peer', 'correction',
      'too_hard',            -- db/130
      'attention_elsewhere', -- db/130
      'waiting', 'sensory', 'change', 'discomfort',
      'other', 'unknown'
    ));

-- 2 of 5 — the log's response
alter table public.behaviour_logs
  drop constraint if exists behaviour_logs_what_helped_check;
alter table public.behaviour_logs
  add constraint behaviour_logs_what_helped_check
    check (what_helped is null or what_helped in (
      'quiet_space', 'familiar_adult', 'movement', 'choice_offered',
      'demand_reduced',
      'helped_with_task',  -- db/130: stayed and did it with them
      'attention_given',   -- db/130: a minute of undivided attention
      'waited_quietly', 'sensory_item', 'redirected',
      'other', 'nothing_tried', 'still_escalated'
    ));

-- 3 of 5 — what an evidence strategy is written for
alter table public.evidence_strategies
  drop constraint if exists evidence_strategies_applies_to_check;
alter table public.evidence_strategies
  add constraint evidence_strategies_applies_to_check
    check (applies_to <@ array[
      'demand', 'transition', 'denied', 'peer', 'correction',
      'too_hard', 'attention_elsewhere',
      'waiting', 'sensory', 'change', 'discomfort'
    ]::text[]);

-- 4 of 5 — what staff believe sets this child off
alter table public.student_profiles
  drop constraint if exists student_profiles_triggers_check;
alter table public.student_profiles
  add constraint student_profiles_triggers_check
    check (triggers <@ array[
      'demand', 'transition', 'denied', 'peer', 'correction',
      'too_hard', 'attention_elsewhere',
      'waiting', 'sensory', 'change', 'discomfort'
    ]::text[]);

-- 5 of 5 — what staff believe helps this child
alter table public.student_profiles
  drop constraint if exists student_profiles_helps_check;
alter table public.student_profiles
  add constraint student_profiles_helps_check
    check (helps <@ array[
      'quiet_space', 'familiar_adult', 'movement', 'choice_offered',
      'demand_reduced', 'helped_with_task', 'attention_given',
      'waited_quietly', 'sensory_item', 'redirected'
    ]::text[]);

comment on column public.behaviour_logs.antecedent is
  'The A of ABC — db/122, revised db/130. Ordered in the UI by how often each '
  'actually precedes an incident, not alphabetically. ''unknown'' means '
  'somebody looked and could not say; null means nobody was asked.';

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   update public.behaviour_logs set antecedent = 'attention_elsewhere' ...;  -- ok
--   update public.behaviour_logs set what_helped = 'helped_with_task' ...;    -- ok
--   update public.student_profiles set triggers = '{too_hard}' ...;           -- ok
--   update public.student_profiles set triggers = '{unknown}' ...;            -- refused
--   update public.evidence_strategies set applies_to = '{too_hard}' ...;      -- refused
--     (correctly: db/118 forbids editing a strategy; insert a new version)
--
-- db/verify.sql: unchanged. No new tables, no new policies, five constraints
-- replaced.
-- ---------------------------------------------------------------------------
