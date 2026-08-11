-- ===========================================================================
-- 055 — A view is a second door into the same room
-- ===========================================================================
-- SECURITY FIX. Apply this before anything else.
--
-- `iep_support_totals` was created in db/054 without `security_invoker = true`.
-- A Postgres view defaults to running with the privileges of its OWNER, not of
-- the person querying it, so Row-Level Security on the tables underneath is
-- bypassed entirely. It was then granted to `authenticated`.
--
-- Net effect: any signed-in account on the platform — a parent at another
-- school, an unengaged specialist, anybody — could read the weekly support
-- hours attached to any child's education plan at any school.
--
-- HOW IT GOT PAST THE TESTS, which is the part worth remembering. db/054
-- shipped with a test asserting that a guardian cannot read
-- `iep_support_sessions`. That test passed, and still passes, because the
-- TABLE policy was correct all along. The view aggregates the same rows
-- through a different door and nothing was knocking on it. A green suite
-- measuring the wrong thing is the same fault this product keeps finding in
-- itself, and this time it was in the security layer.
--
-- The six views written before this one all had `security_invoker = true`
-- (db/010, db/014, db/032). This was not a missing convention; it was me
-- departing from an established one.
--
-- The regression test now queries the VIEW as a guardian with no connection to
-- the child, and was confirmed FAILING against the live database before this
-- script existed:
--
--     expected [ { hours_per_week: 3, plan_id: … } ] to deeply equal []
--
-- ---------------------------------------------------------------------------
-- WHY `security_invoker` IS THE FIX RATHER THAN REVOKING THE GRANT
-- ---------------------------------------------------------------------------
-- The view is meant to be read by staff — it answers "how many hours a week
-- does this child actually get", which is exactly what an inclusion-funding
-- conversation needs. Revoking the grant would break the feature. Making the
-- view run as its caller means it returns precisely the rows that caller could
-- have selected from `iep_support_sessions` by hand: staff at that school get
-- their own totals, everybody else gets nothing.
-- ===========================================================================

create or replace view public.iep_support_totals
with (security_invoker = true) as
select
  plan_id,
  sum(hours)              as hours_per_week,
  count(distinct weekday) as days_covered,
  count(*)                as sessions
from public.iep_support_sessions
group by plan_id;

grant select on public.iep_support_totals to authenticated;
