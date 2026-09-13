-- ---------------------------------------------------------------------------
-- 129 — Show me different ones, and "that will not work because…"
-- ---------------------------------------------------------------------------
-- Two things a teacher can do on the individual side of this product and has
-- never been able to do about a child.
--
-- ---------------------------------------------------------------------------
-- 1. THE THIRD BUTTON, MISSING SINCE db/006
-- ---------------------------------------------------------------------------
-- db/006 wrote down the design's own three buttons:
--
--     "Strategy Applied", "Flag this response", "Show Different Strategy".
--
-- Two were built. The third never was, so a teacher who reads three
-- suggestions and does not like any of them has nowhere to go: "Not useful"
-- records a verdict and leaves the screen exactly as it was. The product asks
-- for feedback and then does nothing with it in front of the person who gave
-- it.
--
-- ---------------------------------------------------------------------------
-- 2. THE FOLLOW-UP, WHICH ONLY ADULTS ASKING ABOUT THEMSELVES CAN DO
-- ---------------------------------------------------------------------------
-- db/110 built exactly this for an individual: "I cannot do that because I
-- share a room" produces a version that works in a shared room. Its header
-- says why — "a suggestion somebody could not act on is worth nothing, however
-- good it was".
--
-- That is just as true of a teacher who cannot use a quiet corner because
-- their room has not got one. They had no way to say so. This is the same
-- asymmetry as the feedback loop db/122 found: the path with no specialist,
-- no school and no oversight had the better tools.
--
-- ---------------------------------------------------------------------------
-- ONE COLUMN, NOT A TABLE
-- ---------------------------------------------------------------------------
-- db/110 made the same choice for the same reason: a follow-up is stored,
-- routed, reviewed, counted against the quota and shown exactly like any other
-- strategy. A second table would need every one of those written twice.
--
-- So a regenerated or adapted suggestion is an `ai_strategies` row that knows
-- what it came after. Null means it was the first answer, which stays the
-- ordinary case.
-- ---------------------------------------------------------------------------

begin;

alter table public.ai_strategies
  add column if not exists supersedes_id uuid
    references public.ai_strategies(id) on delete set null,
  add column if not exists asked_for text
    check (asked_for is null or length(asked_for) <= 500);

comment on column public.ai_strategies.supersedes_id is
  'The suggestion this was generated in place of — "show me different ones", or '
  'an answer to an obstacle a teacher named. Null for a first answer. '
  '`on delete set null`, never cascade: deleting an old suggestion must not '
  'delete the better one that replaced it (db/110 made the same choice).';

comment on column public.ai_strategies.asked_for is
  'What the teacher said when asking again — "no quiet corner in my room". '
  'Free text written by staff, so it is redacted before the model like any '
  'prose. Null when they simply asked for different ones.';

create index if not exists ai_strategies_supersedes_idx
  on public.ai_strategies (supersedes_id)
  where supersedes_id is not null;

/*
 * A SUGGESTION CANNOT REPLACE ITSELF. Cheap to state, and the alternative is a
 * row that makes any "what came before this" walk loop forever.
 */
alter table public.ai_strategies
  drop constraint if exists ai_strategies_not_own_predecessor;
alter table public.ai_strategies
  add constraint ai_strategies_not_own_predecessor
    check (supersedes_id is null or supersedes_id <> id);

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   update public.ai_strategies set supersedes_id = id;   -- refused
--   update public.ai_strategies set asked_for = repeat('x', 501);  -- refused
--
--   -- what a teacher was given, and what they asked for instead
--   select s.title, s.asked_for, prev.title as instead_of
--   from public.ai_strategies s
--   left join public.ai_strategies prev on prev.id = s.supersedes_id
--   where s.supersedes_id is not null;
--
-- db/verify.sql: no new tables, no new policies — the existing ai_strategies
-- policies already govern these rows, which is the point of not making a
-- second table.
-- ---------------------------------------------------------------------------
