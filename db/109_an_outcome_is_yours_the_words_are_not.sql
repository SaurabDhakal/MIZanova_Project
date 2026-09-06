-- ---------------------------------------------------------------------------
-- 109 — An outcome is yours to give; the model's words are not yours to edit
-- ---------------------------------------------------------------------------
-- db/108 added an update policy so somebody could say whether a suggestion
-- helped. Checked immediately afterwards, as the person who asked:
--
--     set an outcome:                   13 rows
--     edit the model's words:  ALLOWED, 13 rows
--
-- The second line is a hole, and db/108 opened it.
--
-- ---------------------------------------------------------------------------
-- WHY THE COLUMN GRANT DID NOT DO WHAT IT LOOKED LIKE IT DID
-- ---------------------------------------------------------------------------
-- db/094 wrote, correctly, that these tables have no insert or update policy
-- because "a browser that could insert here could put words in the model's
-- mouth and then read them back as though the AI had said them". It granted
-- SELECT and nothing else.
--
-- Granting select does not revoke anything. Supabase's default privileges
-- already give `authenticated` INSERT, UPDATE and DELETE on a new table in
-- public, so what actually protected these rows was RLS having no policy for
-- those commands — which works, right up until somebody adds one.
--
-- db/108 added one. `grant update (outcome, outcome_at)` looks like it narrows
-- the table-wide UPDATE and does not: a broader grant already existed, so the
-- column grant was a no-op and the new policy became the only gate. It admits
-- the right ROWS and says nothing about columns, so the title and the body
-- went with them.
--
-- ---------------------------------------------------------------------------
-- THE FIX, AND WHY IT IS SPELLED OUT RATHER THAN MINIMAL
-- ---------------------------------------------------------------------------
-- Revoke first, then grant exactly what is intended. Insert and delete are
-- revoked as well, so the grants finally say what db/094's comment always
-- claimed — a suggestion is written by the server and nobody else, and the
-- only thing a person may change about one is whether it helped them.
--
-- Deleting still works where it should: removing a request takes its
-- suggestions with it through `on delete cascade`, which is a foreign key and
-- does not consult table grants.
-- ---------------------------------------------------------------------------

begin;

revoke insert, update, delete on public.individual_ai_suggestions
  from authenticated;

grant select on public.individual_ai_suggestions to authenticated;
grant update (outcome, outcome_at)
  on public.individual_ai_suggestions to authenticated;

-- The same audit on the parent table. It is granted select and delete on
-- purpose — db/094 gives somebody the right to delete their own private
-- writing — so insert and update are what should not be there.
revoke insert, update on public.individual_ai_requests from authenticated;
grant select, delete on public.individual_ai_requests to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it. As the person who asked, both of these:
--
--   update public.individual_ai_suggestions
--      set outcome = 'helped', outcome_at = now();   -- their rows
--   update public.individual_ai_suggestions set title = 'x';  -- must be REFUSED
--
-- Before this file the second updated thirteen rows.
-- ---------------------------------------------------------------------------
