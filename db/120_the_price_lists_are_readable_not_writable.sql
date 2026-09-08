-- ---------------------------------------------------------------------------
-- 120 — The price lists are readable, not writable
-- ---------------------------------------------------------------------------
-- The last two objects an anonymous visitor holds a grant on, and the only two
-- that should answer them at all:
--
--     course_catalogue        the published courses and what they cost
--     individual_plan_public  the subscription price
--
-- db/098 made both public deliberately, and `scripts/security-check.mjs`
-- asserts that they answer AND that they carry neither `stripe_price_id` nor a
-- course body. That part is right and this file does not touch it.
--
-- What it does touch is the other six privileges. After db/119 the anonymous
-- grant count fell from 91 to 14, and every one of the fourteen is on these
-- two views — SELECT, which is intended, plus INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES and TRIGGER, which are not.
--
-- ---------------------------------------------------------------------------
-- "THE QUERY'S SHAPE PROTECTING IT RATHER THAN A DECISION"
-- ---------------------------------------------------------------------------
-- Those writes fail today. `course_catalogue` filters on `is_published` and
-- computes a module count with a subquery, so Postgres will not treat it as
-- updatable; `individual_plan_public` pins `id = 1`. Nothing can be written
-- through either.
--
-- But that is the sentence db/072 already wrote about `platform_revenue_totals`
-- and then acted on anyway:
--
--     "This view aggregates, so writes through it would fail anyway — but that
--      is the query's shape protecting it rather than a decision, and a later
--      rewrite would make them live."
--
-- A view is a query, and a query gets rewritten. Somebody simplifying
-- `course_catalogue` to a plain projection would hand an anonymous visitor an
-- INSERT on it, and nothing in the schema would object — the grant was already
-- there. Revoking now costs nothing and removes that.
--
-- This is housekeeping, not a fault. Apply it whenever convenient; nothing is
-- exposed while it waits.
-- ---------------------------------------------------------------------------

begin;

-- SELECT stays. Everything else was never a decision.
revoke insert, update, delete, truncate, references, trigger
  on public.course_catalogue from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.individual_plan_public from anon;

-- The same six on the signed-in side, for the same reason: reading a price
-- list is not writing one, and neither view is a write target for anybody.
revoke insert, update, delete, truncate, references, trigger
  on public.course_catalogue from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.individual_plan_public from authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it. Both must still ANSWER — this file must not break the pricing page:
--
--   node scripts/security-check.mjs
--     → "85 objects — every one refused, or public on purpose"
--     → "course_catalogue readable, carries no body/video_url"
--     → "individual_plan_public readable, carries no stripe_price_id"
--
-- And the grant list should then read SELECT and nothing else:
--
--   select table_name, string_agg(distinct privilege_type, ',')
--   from information_schema.role_table_grants
--   where grantee = 'anon' and table_schema = 'public'
--   group by 1;
-- ---------------------------------------------------------------------------
