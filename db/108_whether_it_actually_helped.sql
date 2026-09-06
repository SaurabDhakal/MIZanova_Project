-- ---------------------------------------------------------------------------
-- 108 — Whether it actually helped
-- ---------------------------------------------------------------------------
-- The loop this product now has is: describe something hard, get three things
-- to try, turn one into a goal. What it has never had is the last step —
-- saying whether the thing worked.
--
-- That gap costs three different people something.
--
-- THE PERSON gets no record. Six weeks on they cannot remember which of the
-- eleven things suggested to them was the one that actually stuck, so they try
-- the wrong ones again.
--
-- THE MODEL gets no correction. db/107 lets it see goals, check-ins and past
-- questions, and it will happily suggest again the exact thing somebody tried
-- in March and abandoned in April — because nothing anywhere records that it
-- did not work. Of everything that could be fed back, "I tried this and it did
-- not help" is far and away the most useful, and it was the one thing missing.
--
-- SPECIAL MILES gets no quality signal. `strategy_feedback` exists for the
-- school flow, so a teacher can tell a specialist a suggestion was wrong.
-- Nobody built the individual's version, and an individual has no specialist
-- to tell.
--
-- ---------------------------------------------------------------------------
-- TWO ANSWERS, NOT FIVE, AND NO STARS
-- ---------------------------------------------------------------------------
-- "Did this help" is answerable in the half-second somebody has. A five-point
-- scale is a decision, and a rating out of five invites somebody to be fair to
-- a computer — which produces threes, and a three means nothing.
--
-- The same reasoning db/101 used for three check-in options rather than five.
--
-- ---------------------------------------------------------------------------
-- THE COLUMN GRANT, WHICH db/107 LEARNED ABOUT THE HARD WAY
-- ---------------------------------------------------------------------------
-- `individual_ai_suggestions` deliberately has no update policy: the server
-- writes these with the service role, and a browser that could edit one could
-- put words in the model's mouth and read them back as the AI's.
--
-- That must stay true of the TEXT. So this does not open the table — it grants
-- update on two columns and adds a policy scoped to the person's own rows. The
-- title and body remain unwritable by anybody but the server, which is the
-- property worth protecting.
-- ---------------------------------------------------------------------------

begin;

alter table public.individual_ai_suggestions
  add column if not exists outcome text
    check (outcome in ('helped', 'didnt_help')),
  add column if not exists outcome_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'individual_ai_suggestions_outcome_has_time'
  ) then
    alter table public.individual_ai_suggestions
      add constraint individual_ai_suggestions_outcome_has_time
      check ((outcome is null) = (outcome_at is null));
  end if;
end $$;

comment on column public.individual_ai_suggestions.outcome is
  'Whether the person said this helped. Null until they say. Two answers on '
  'purpose — see db/108.';

drop policy if exists individual_ai_suggestions_outcome
  on public.individual_ai_suggestions;
create policy individual_ai_suggestions_outcome
  on public.individual_ai_suggestions for update to authenticated
  using (
    exists (
      select 1 from public.individual_ai_requests r
      where r.id = individual_ai_suggestions.request_id
        and r.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.individual_ai_requests r
      where r.id = individual_ai_suggestions.request_id
        and r.profile_id = auth.uid()
    )
  );

-- The policy says WHICH ROWS; this says WHICH COLUMNS. Both are needed, and
-- db/107 shipped without the second and produced a control that looked real
-- and failed on press.
grant update (outcome, outcome_at)
  on public.individual_ai_suggestions to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it. As the person who asked:
--   update public.individual_ai_suggestions
--      set outcome = 'helped', outcome_at = now();          -- their rows only
--   update public.individual_ai_suggestions set title = 'x'; -- refused
--
-- The second is the one that matters: an outcome is theirs to give, and the
-- model's words are not theirs to edit.
-- ---------------------------------------------------------------------------
