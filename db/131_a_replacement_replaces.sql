-- ---------------------------------------------------------------------------
-- 131 — A replacement replaces
-- ---------------------------------------------------------------------------
-- db/129 gave a teacher "Show me different ones" and the follow-up that says
-- why the first set will not work. Both generate three new suggestions. Neither
-- did anything about the three already on the screen, so asking twice produced
-- six and asking three times produced nine — every rejected suggestion still
-- sitting there under the ones that replaced them.
--
-- `supersedes_id` was not enough on its own. It records which single row a new
-- set came after, which is the right thing for walking the chain, and it says
-- nothing about the other two in that set — so a filter built on it hid one
-- suggestion in three.
--
-- ---------------------------------------------------------------------------
-- A COLUMN, NOT A DELETE
-- ---------------------------------------------------------------------------
-- The old rows stay. A teacher may have pressed "I tried this" on one of them,
-- `student_strategy_outcomes` reads them so the model never re-suggests a
-- rejected idea, and `ai_strategies` is the record of what this product told
-- somebody about a child. Deleting is the one thing that must not happen.
--
-- So they are marked, and every screen asks for the current set.
--
-- ---------------------------------------------------------------------------
-- WHY NOT A NEW `status`
-- ---------------------------------------------------------------------------
-- `strategy_status` already means "where is this in the review gate" —
-- published, pending_review, approved, rejected — and the RLS policies in
-- db/006 are written against it. Adding 'superseded' would make one column
-- answer two unrelated questions, and a suggestion can be BOTH superseded and
-- still with a specialist. Two facts, two columns.
-- ---------------------------------------------------------------------------

begin;

alter table public.ai_strategies
  add column if not exists superseded_at timestamptz;

comment on column public.ai_strategies.superseded_at is
  'Set when a teacher asked again and a newer set replaced this one. The row '
  'stays — it carries feedback, it feeds student_strategy_outcomes, and it is '
  'the record of what was said. Screens show where this is null.';

-- The lookup every screen now makes: the current set for one log.
create index if not exists ai_strategies_current_idx
  on public.ai_strategies (behaviour_log_id)
  where superseded_at is null;

-- ---------------------------------------------------------------------------
-- Tidy what the bug already produced
-- ---------------------------------------------------------------------------
-- Logs that were regenerated before this file existed have several live sets.
-- Keep the newest per log and mark the rest, using the insert timestamp the
-- rows already carry — a generation writes its three rows in one statement, so
-- they share a created_at and group cleanly.
update public.ai_strategies s
set superseded_at = now()
where s.superseded_at is null
  and exists (
    select 1
    from public.ai_strategies newer
    where newer.behaviour_log_id = s.behaviour_log_id
      and newer.created_at > s.created_at
  );

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   select behaviour_log_id, count(*)
--   from public.ai_strategies
--   where superseded_at is null
--   group by behaviour_log_id
--   having count(*) > 3;        -- no rows
--
--   -- and nothing was destroyed
--   select count(*) from public.ai_strategies;   -- unchanged
--
-- db/verify.sql: no new tables, no new policies.
-- ---------------------------------------------------------------------------
