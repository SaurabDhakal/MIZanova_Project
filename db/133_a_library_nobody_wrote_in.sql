-- ---------------------------------------------------------------------------
-- 133 — A library nobody wrote in
-- ---------------------------------------------------------------------------
-- db/118 built the Evidence Database: a table of strategies a specialist would
-- curate, ranked by db/124's `evidence_for`, cited by db/128's
-- `ai_strategies.evidence_id`, and used by the server as the fallback when the
-- AI was switched off. This removes all of it.
--
-- ---------------------------------------------------------------------------
-- WHAT THE NUMBERS SAID BEFORE IT WAS REMOVED
-- ---------------------------------------------------------------------------
--     select count(*) from evidence_strategies;                     -- 12
--     select count(*) from evidence_strategies
--       where created_by is not null;                               --  0
--     select count(*) from ai_strategies where evidence_id is not null; -- 0
--
-- Twelve rows, every one seeded by this project, none written by a specialist
-- in the months it existed, and not one AI suggestion that ever cited one. It
-- was scaffolding that never took any weight.
--
-- ---------------------------------------------------------------------------
-- E02 IS NOW DELIBERATELY UNMET
-- ---------------------------------------------------------------------------
-- E02: "Strategies must fall back to the curated Evidence Database (DB) if AI
-- is blocked or offline." That requirement is not met any more, on purpose,
-- and the reason belongs in the file that broke it.
--
-- Saurab: "there can be hundreds of different scenarios, so what is best do it
-- maybe remove the entire thing cause when there is no internet a sloopy ai
-- recommendation is a bad feature to have."
--
-- The coverage arithmetic was always against it. A classroom produces an
-- unbounded variety of incidents and the library held twelve general
-- paragraphs, so the fallback's real output was a vague answer in the exact
-- place a teacher had been promised a specific one. A teacher told "not right
-- now" asks a colleague. A teacher handed something generic tries it on a
-- child — and this product handed it over. The refusal is the safer answer,
-- and it is the one that does not train people to stop reading the panel.
--
-- `/api/strategies` now returns 503 with a message saying the log is saved and
-- naming the specialist as the person to ask.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY KEPT
-- ---------------------------------------------------------------------------
-- `ai_generation_events.source` STAYS, and so does its
-- `check (source in ('ai','evidence'))`.
--
-- There is one row in that table with source = 'evidence'. It is the record of
-- a real occasion when this product answered a teacher from the library rather
-- than from the model. Narrowing the constraint would invalidate that row, and
-- deleting it would make the audit trail claim something that is not true.
-- What happened, happened. Nothing will write 'evidence' again.
--
-- Also kept: the `antecedent` / `what_helped` vocabularies. db/124 gave
-- `applies_to` the same closed lists, but `behaviour_logs` and
-- `student_profiles` are the reason those lists exist — see db/130 — and they
-- are untouched here. This file drops one of the five constraints db/130
-- named; the other four remain in step.
-- ---------------------------------------------------------------------------

begin;

-- The citation first: the FK would otherwise block the table drop.
alter table public.ai_strategies
  drop column if exists evidence_id;

-- The ranking function and the immutability trigger function. `cascade` on the
-- trigger function takes the trigger with it; the table drop would too, but
-- being explicit means this file reads as the whole removal.
drop function if exists public.evidence_for(text, text, integer);
drop trigger if exists evidence_strategies_immutable
  on public.evidence_strategies;
drop function if exists public.evidence_strategies_are_immutable() cascade;

-- The table, its three policies and its twelve rows.
drop table if exists public.evidence_strategies;

comment on column public.ai_generation_events.source is
  'A04. ''ai'' when the model answered. ''evidence'' is HISTORICAL ONLY — it '
  'meant the Evidence Database answered because the AI was off, and db/133 '
  'removed that library. Existing rows are kept as the record of what this '
  'product actually did; nothing writes ''evidence'' any more.';

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   select to_regclass('public.evidence_strategies');   -- null
--   select to_regprocedure('public.evidence_for(text,text,integer)'); -- null
--   select count(*) from information_schema.columns
--   where table_name = 'ai_strategies' and column_name = 'evidence_id'; -- 0
--
--   -- and the audit row survived
--   select source, count(*) from public.ai_generation_events group by source;
--   -- 'ai' plus the one historical 'evidence'
--
-- db/verify.sql: ONE fewer table and THREE fewer policies. That is this file.
-- ---------------------------------------------------------------------------
