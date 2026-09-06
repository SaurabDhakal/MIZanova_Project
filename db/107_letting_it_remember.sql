-- ---------------------------------------------------------------------------
-- 107 — Letting it remember
-- ---------------------------------------------------------------------------
-- Every question to the AI starts cold. It does not know somebody asked about
-- mornings three weeks ago, that they are already working on picking one thing
-- rather than a list, or that "hard going" has appeared four times in their
-- check-ins. So it answers the question in front of it and suggests, for the
-- third time, something they have already tried.
--
-- That is the difference between a good answer generator and something that
-- knows them, and it is the difference somebody would pay for.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A SWITCH AND NOT A FEATURE
-- ---------------------------------------------------------------------------
-- Because the product has already promised the opposite, in these words:
--
--   Goals.tsx      "One thing at a time, in your own words. Nobody else can
--                   see any of this."
--   Suggestions    "...nobody else can open it, not a school and not Special
--                   Miles."
--
-- An AI is somebody else. Sending goals and check-in notes to Anthropic
-- because it would give better answers would break a promise this product
-- makes on the very screen where the text was typed — and would break it
-- silently, which is the part that matters.
--
-- db/094 already argued this shape once: the risk flag notifies nobody,
-- because the page they signed up from says nothing is reported. The same
-- reasoning gives the same answer here. So: off unless somebody turns it on,
-- and the screen says exactly what would travel before they do.
--
-- ---------------------------------------------------------------------------
-- WHAT IS NOT ASKED FOR
-- ---------------------------------------------------------------------------
-- Their previous QUESTIONS need no new consent. Those were written to be sent
-- to the AI, were sent to it, and are stored already redacted — including them
-- again is not a new disclosure. It is the goals and the check-in notes that
-- were written under a promise, and they are what this switch is about.
--
-- Everything travels through the same redaction either way. Consent is about
-- who reads it, never about whether their name goes with it.
-- ---------------------------------------------------------------------------

begin;

alter table public.profiles
  add column if not exists ai_may_use_my_history boolean not null default false;

comment on column public.profiles.ai_may_use_my_history is
  'Whether the AI may be told what this person is working on when they ask it '
  'something. Off unless they turn it on — see db/107.';

-- ---------------------------------------------------------------------------
-- AND THE GRANT, WHICH THIS FILE FIRST FORGOT
-- ---------------------------------------------------------------------------
-- `profiles` does not give `authenticated` a blanket UPDATE. It grants three
-- columns — avatar_path, first_name, last_name — and nothing else, so a person
-- can change their own name and picture and cannot touch their role, their
-- school or their verification.
--
-- That is a good design and it means a new column is NOT writable by the
-- person it belongs to until it is named here. Without this line the switch
-- below renders, is pressed, and fails with "permission denied for table
-- profiles" — a setting that looks real and does nothing.
-- ---------------------------------------------------------------------------
grant update (ai_may_use_my_history) on public.profiles to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- No policy change needed. `profiles_update_own` is `id = auth.uid()` with a
-- guard on avatar_path only, so somebody can already flip their own switch and
-- nobody else's.
--
-- Check it. As one individual:
--   update public.profiles set ai_may_use_my_history = true;   -- 1 row
-- and the same statement as anybody else must touch 0 of their rows.
-- ---------------------------------------------------------------------------
