-- ---------------------------------------------------------------------------
-- 110 — Asking about one of them
-- ---------------------------------------------------------------------------
-- Somebody reads a suggestion and the obvious next thought is a question about
-- it. "I cannot do that because I share a room." "What if I have already
-- tried the timer version?" "Which part of that do I do first?"
--
-- Today the only way to ask is to start again in the box at the top and
-- describe the whole situation from scratch, hoping the model lands on the
-- same idea so they can push on it. Most people will not, so the answer they
-- got is the answer they are stuck with — and a suggestion somebody could not
-- act on is worth nothing, however good it was.
--
-- ---------------------------------------------------------------------------
-- A FOLLOW-UP IS A QUESTION, NOT A NEW KIND OF THING
-- ---------------------------------------------------------------------------
-- It could have been its own table, and that would have been a mistake. A
-- follow-up is stored, redacted, counted against the quota, answered by the
-- same model, shown in the same history and deleted by the same button. Every
-- one of those already works for `individual_ai_requests` and none of it would
-- work for a second table without being written twice.
--
-- So it is a request with one extra column saying what it is about. Null means
-- somebody started fresh, which is still the ordinary case.
--
-- ---------------------------------------------------------------------------
-- ON DELETE SET NULL, DELIBERATELY
-- ---------------------------------------------------------------------------
-- db/094 gives somebody the right to delete a question, and that takes its
-- suggestions with it by cascade. If this key cascaded too, deleting an old
-- question would silently delete the follow-up conversation that came out of
-- it — including answers they may have kept precisely because they were the
-- useful ones.
--
-- Set null instead: the follow-up survives, and stops claiming to be about
-- something that is no longer there.
-- ---------------------------------------------------------------------------

begin;

alter table public.individual_ai_requests
  add column if not exists about_suggestion_id uuid
    references public.individual_ai_suggestions(id) on delete set null;

create index if not exists individual_ai_requests_about_idx
  on public.individual_ai_requests (about_suggestion_id)
  where about_suggestion_id is not null;

comment on column public.individual_ai_requests.about_suggestion_id is
  'The suggestion this question is following up on, or null if they started '
  'fresh. Survives the deletion of what it points at — see db/110.';

commit;

-- ---------------------------------------------------------------------------
-- No policy or grant changes. The column sits on a table whose select policy
-- is already `profile_id = auth.uid()`, and rows are still written only by the
-- server with the service role — db/109 made sure of that.
--
-- Check it. Delete a request that a follow-up points at: the follow-up must
-- still be there, with about_suggestion_id null.
-- ---------------------------------------------------------------------------
