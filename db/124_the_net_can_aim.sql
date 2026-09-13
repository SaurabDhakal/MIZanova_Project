-- ---------------------------------------------------------------------------
-- 124 — The safety net can aim
-- ---------------------------------------------------------------------------
-- `evidenceFallback` is what answers a teacher when the AI is off. db/118 built
-- it because FR21's kill switch — the one Special Miles pulls DURING A CRISIS —
-- otherwise left every classroom with no strategies at all, at the moment they
-- were most likely to need one.
--
-- It selects on one column:
--
--     .eq('behaviour_type', log.behaviour_type)
--     .limit(3)
--
-- Four behaviour types, three rows, no ordering. Every child who threw
-- something gets the same three paragraphs, forever, regardless of whether it
-- followed a transition or a correction or nothing anybody saw.
--
-- db/122 added the antecedent precisely because the behaviour category is not
-- enough to advise on. The AI path now uses it. The path that runs when the AI
-- is unavailable — the one for the worst day — still does not.
--
-- ---------------------------------------------------------------------------
-- THE FALLBACK IS THE PATH THAT MATTERS MOST, NOT LEAST
-- ---------------------------------------------------------------------------
-- It runs during an outage, during a crisis, and (once the library is cached)
-- offline in the regional and remote schools the market research says are the
-- product's strongest case. Those are the moments a teacher has no specialist
-- down the corridor either. Leaving it as the crudest lookup in the codebase
-- gets the priority exactly backwards.
--
-- ---------------------------------------------------------------------------
-- ANTECEDENT CODES, NOT FREE TAGS
-- ---------------------------------------------------------------------------
-- `applies_to` holds values from the SAME vocabulary as
-- `behaviour_logs.antecedent`, and nothing else. That is what makes matching
-- possible at all: a free-text tag column would have to be searched by
-- guesswork, and would drift from the thing it is meant to match within a term.
--
-- Deliberately NOT a setting tag ('ecec', 'primary'). Nothing in this schema
-- records which kind of setting a student is in yet — docs/17 proposes it —
-- and a column that can be written but never matched is a promise the query
-- cannot keep.
--
-- An EMPTY array means "generally applicable", which is the honest default and
-- what every existing row becomes. Those still answer; they just rank below a
-- strategy written for the antecedent in front of the teacher.
-- ---------------------------------------------------------------------------

begin;

alter table public.evidence_strategies
  add column if not exists applies_to text[] not null default '{}'
    check (applies_to <@ array[
      'transition', 'demand', 'denied', 'waiting', 'peer',
      'sensory', 'change', 'correction', 'discomfort'
    ]::text[]);

comment on column public.evidence_strategies.applies_to is
  'Antecedents this strategy is written for, from the db/122 vocabulary. Empty '
  'means generally applicable, which is the default and ranks below a targeted '
  'match. ''unknown'' is deliberately not accepted: a strategy cannot be for '
  'the absence of information.';

-- Matching is `applies_to && array[antecedent]`, which is an overlap test, and
-- GIN is the index for that operator.
create index if not exists evidence_strategies_applies_to_idx
  on public.evidence_strategies using gin (applies_to)
  where is_current and retired_at is null;


-- ---------------------------------------------------------------------------
-- The immutability trigger has to cover it
-- ---------------------------------------------------------------------------
-- db/118's rule is that a strategy is never edited: revising one INSERTS a new
-- version in the same lineage, so the words a classroom was handed stay
-- readable forever. The trigger enforcing that lists the columns it protects,
-- and a new column is not in the list — so `applies_to` would be the one part
-- of a strategy that could be silently rewritten under a teacher.
--
-- Which antecedent a strategy is FOR is part of what it says. It goes in.
create or replace function public.evidence_strategies_are_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.rationale is distinct from old.rationale
     or new.provenance is distinct from old.provenance
     or new.behaviour_type is distinct from old.behaviour_type
     or new.applies_to is distinct from old.applies_to
     or new.lineage_id is distinct from old.lineage_id
     or new.version is distinct from old.version
  then
    raise exception
      'An evidence strategy is not edited. Add a new version in the same lineage.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- Choosing three, in a defined order
-- ---------------------------------------------------------------------------
-- The old query had no ORDER BY at all, so which three of a growing library a
-- teacher saw was whatever Postgres returned — different between two calls,
-- with no way to explain the difference to anybody.
--
-- Ordering, in words:
--   1. written for this antecedent
--   2. generally applicable
--   3. written for a different antecedent   (still better than nothing)
--   then newest first, so a revised lineage's current version leads.
--
-- A FUNCTION RATHER THAN A LONGER POSTGREST CHAIN, because the ranking is a
-- CASE expression and PostgREST cannot express one. Putting it here also means
-- the order is inspectable by anybody reading the schema, instead of being
-- three chained modifiers in a JavaScript file.
create or replace function public.evidence_for(
  p_behaviour  public.behaviour_type,
  p_antecedent text default null,
  p_limit      integer default 3
)
returns table (
  id         uuid,
  title      text,
  body       text,
  rationale  text[],
  provenance text,
  targeted   boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id, e.title, e.body, e.rationale, e.provenance,
    -- Returned so the screen can say "written for transitions" rather than
    -- implying every suggestion was chosen for this child's situation.
    (p_antecedent is not null and e.applies_to && array[p_antecedent]) as targeted
  from public.evidence_strategies e
  where e.behaviour_type = p_behaviour
    and e.is_current
    and e.retired_at is null
  order by
    case
      when p_antecedent is not null and e.applies_to && array[p_antecedent] then 0
      when cardinality(e.applies_to) = 0                                    then 1
      else 2
    end,
    e.created_at desc
  limit p_limit;
$$;

comment on function public.evidence_for(public.behaviour_type, text, integer) is
  'FR12/E02. The fallback library, ranked: written for this antecedent first, '
  'then generally applicable, then everything else. Replaces an unordered '
  'limit(3) that returned a different three on each call.';

revoke all on function public.evidence_for(public.behaviour_type, text, integer)
  from anon;
grant execute on function public.evidence_for(public.behaviour_type, text, integer)
  to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it. As a verified specialist:
--
--   insert into public.evidence_strategies
--     (lineage_id, behaviour_type, title, body, provenance, applies_to, created_by)
--   values (gen_random_uuid(), 'disruptive', 'Warn before transitions',
--           'Give a two-minute warning…', 'Practice guidance, NSW DoE',
--           '{transition}', auth.uid());
--
--   update public.evidence_strategies set applies_to = '{demand}';
--   -- refused: an evidence strategy is not edited
--
--   select title, targeted from public.evidence_for('disruptive', 'transition');
--   -- the transition row leads, with targeted = true
--
--   select title, targeted from public.evidence_for('disruptive', null);
--   -- same rows, targeted = false throughout
--
-- db/verify.sql: `functions` gains evidence_for. No new tables, no new
-- policies — the column is covered by the policies db/118 already wrote.
-- ---------------------------------------------------------------------------
