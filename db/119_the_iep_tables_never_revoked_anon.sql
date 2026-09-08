-- ---------------------------------------------------------------------------
-- 119 — The IEP tables never revoked anon
-- ---------------------------------------------------------------------------
-- Found by probing all 85 tables and views in `public` as an anonymous visitor
-- holding nothing but the publishable key, rather than by reading the schema.
-- Seventy-four refused outright with 401. Two answered on purpose — the public
-- price lists, which db/098 intends and which carry no `stripe_price_id` and no
-- course body. Nine did something else, and it is the nine that matter:
--
--     iep_plans  iep_goals  iep_goal_reviews  iep_plan_confirmations
--     iep_plan_participants  iep_support_sessions  iep_support_totals
--     platform_invoices  platform_subscriptions
--
-- They did not refuse. They ran the query, matched nothing, and returned `[]`.
--
-- ---------------------------------------------------------------------------
-- WHY THAT IS NOT THE SAME AS BEING SAFE
-- ---------------------------------------------------------------------------
-- Nothing leaks today. Every policy on these tables is `to authenticated`, so
-- an anonymous request matches no rows and comes back empty. RLS is doing its
-- job.
--
-- But it is doing it ALONE. On the other seventy-four, an anonymous visitor
-- never reaches a policy at all — the grant is missing, so PostgREST refuses
-- before RLS is consulted. Two independent layers, and either one is enough.
-- On these nine there is one layer, and `iep_plans` currently holds five real
-- children's education plans behind it.
--
-- One policy written `to public` instead of `to authenticated`, or one
-- `using (true)` copied from a table where it was correct, and the door is
-- open with nothing behind it. That is not a hypothetical in this repository:
-- db/055 exists because a view shipped without `security_invoker` and leaked
-- support hours across schools, and the table test passed the whole time
-- because it was checking the wrong door.
--
-- ---------------------------------------------------------------------------
-- THE ROOT CAUSE IS A DEFAULT, AND db/072 ALREADY NAMED IT
-- ---------------------------------------------------------------------------
-- "Supabase's defaults grant the full set on anything new in `public`." So a
-- revoke is not a hardening step somebody remembered — it is the second half
-- of creating a table, and eighty of the hundred and twenty-two scripts here
-- do it. The IEP scripts, db/054 through db/057, contain no `revoke` at all,
-- and db/072 revoked on `platform_revenue_totals` while missing the two tables
-- underneath it.
--
-- Nothing about who may read what changes here. This only removes a privilege
-- that was never granted deliberately.
-- ---------------------------------------------------------------------------

begin;

-- The IEP set — db/054 to db/057.
revoke all on public.iep_plans              from anon;
revoke all on public.iep_goals              from anon;
revoke all on public.iep_goal_reviews       from anon;
revoke all on public.iep_plan_confirmations from anon;
revoke all on public.iep_plan_participants  from anon;
revoke all on public.iep_support_sessions   from anon;
revoke all on public.iep_support_totals     from anon;

-- Special Miles' own revenue — db/072 protected the view above these and not
-- the tables beneath it.
revoke all on public.platform_invoices      from anon;
revoke all on public.platform_subscriptions from anon;

-- Belt and braces on the two timelines. They already refuse, because
-- `security_invoker` makes them read their sources as the caller and the
-- sources revoke anon — but that is the SOURCES protecting them rather than a
-- decision about the view, which is the same shape of accident as above.
revoke all on public.audit_timeline   from anon;
revoke all on public.student_timeline from anon;

/*
 * WRITES THROUGH THE AGGREGATE VIEWS, for the reason db/072 gives about
 * `platform_revenue_totals`: they group, so a write would fail on its own
 * shape — and "the query's shape protecting it rather than a decision" is
 * exactly what a later rewrite quietly undoes.
 */
revoke insert, update, delete, truncate, references, trigger
  on public.iep_support_totals from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.audit_timeline from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.student_timeline from authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it. As an anonymous visitor holding only the publishable key, each of
-- these must now answer 401 rather than `[]`:
--
--   curl "$URL/rest/v1/iep_plans?select=*" -H "apikey: $PUBLISHABLE"
--   curl "$URL/rest/v1/platform_invoices?select=*" -H "apikey: $PUBLISHABLE"
--
-- And nothing signed in may change:
--
--   npm test                     -- the IEP and billing suites
--   node scripts/security-check.mjs
--
-- `scripts/security-check.mjs` now enumerates every table and view from the
-- catalogue rather than from a list somebody maintains by hand, so the next
-- table created without a revoke fails the check on the day it is created
-- rather than whenever somebody next thinks to look.
-- ---------------------------------------------------------------------------
