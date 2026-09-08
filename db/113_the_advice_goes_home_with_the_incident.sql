-- ---------------------------------------------------------------------------
-- 113 — The advice goes home with the incident
-- ---------------------------------------------------------------------------
-- The brief's own sentence for this product is that it "syncs practical tips
-- with parents or caregivers to support consistency across home and school".
-- On 8 September 2026 that was measurably not happening:
--
--     121 AI strategies exist
--     136 behaviour logs have been shared with parents
--      86 of those shared logs carry strategies no guardian can read
--
-- Eighty-six times a teacher decided a family should know about an incident,
-- the database handed over the incident, and kept the advice.
--
-- It is not a missing screen. `ai_strategies` has exactly two select policies,
-- `_select_staff` and `_select_reviewer`, and neither mentions a guardian. A
-- parent screen asking for a strategy would get an empty array and no error,
-- which is the failure mode this project has learned to distrust most.
--
-- ---------------------------------------------------------------------------
-- WHAT A FAMILY GETS, AND THE TWO GATES THAT DECIDE IT
-- ---------------------------------------------------------------------------
-- The advice follows the incident. It does not travel on its own.
--
-- 1. THE LOG MUST BE SHARED. `shared_with_parents` is a deliberate act by a
--    teacher — db/005's guardian policy is `shared_with_parents and
--    is_guardian_of(student_id)` and this mirrors it exactly, through an
--    `exists` on the log rather than by trusting the denormalised
--    `student_id` on the strategy row.
--
--    Skipping that check would be a real leak, and a subtle one. Strategies
--    carry `student_id` of their own, so a policy written only against that
--    column would hand a family every suggestion attached to every incident
--    about their child — including the ones a teacher chose NOT to share.
--    "Try a visual timer before transitions" tells you there was a transition
--    that went badly. The advice discloses the incident.
--
-- 2. THE STATUS MUST BE SETTLED. `published` or `approved`, the same pair
--    `_select_staff` uses. A `pending_review` suggestion is held precisely
--    because it may be wrong, and db/006 says the routing "is enforced here
--    rather than by a filter in a query someone might forget to write". A
--    family is the last audience that should meet an unreviewed one:
--    a teacher can weigh a suggestion against a classroom they know, and
--    a parent reading it at 9pm cannot.
--
--    `rejected` is excluded by the same clause. A specialist judged it
--    unsuitable, and that judgement should reach the family as silence rather
--    than as advice with a caveat attached.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
-- It does not let a guardian write, review, release or reject anything. Read
-- only, and only through the two gates above. The review queue stays entirely
-- a specialist's.
--
-- It does not filter on `is_risk_flagged`. That would be a second, quieter
-- sharing decision made by a policy instead of a person: a flagged log reaches
-- a family only if a teacher shared it, and if they did, withholding the
-- strategy leaves the family with the worst half — the incident, and no idea
-- what to do about it.
--
-- It records no Record Access row. That table answers "who outside this child's
-- household has opened their file"; a parent reading an update addressed to
-- them is not that question, and no other parent screen logs one.
-- ---------------------------------------------------------------------------

begin;

drop policy if exists ai_strategies_select_guardian on public.ai_strategies;
create policy ai_strategies_select_guardian
  on public.ai_strategies for select to authenticated
  using (
    status in ('published', 'approved')
    and public.is_guardian_of(student_id)
    and exists (
      select 1
      from public.behaviour_logs b
      where b.id = ai_strategies.behaviour_log_id
        and b.shared_with_parents
    )
  );

comment on policy ai_strategies_select_guardian on public.ai_strategies is
  'A guardian reads a settled strategy only where the teacher shared the log '
  'it belongs to. The advice discloses the incident, so it cannot travel '
  'further than the incident did.';

commit;

-- ---------------------------------------------------------------------------
-- Check it. Signed in as a guardian of a child who has shared logs:
--
--   select count(*) from public.ai_strategies;     -- before: 0, after: > 0
--
-- Then the three boundaries, each of which must still return 0 rows:
--
--   -- 1. A strategy on a log the teacher did NOT share.
--   select count(*) from public.ai_strategies s
--   join public.behaviour_logs b on b.id = s.behaviour_log_id
--   where not b.shared_with_parents;
--
--   -- 2. A strategy still waiting for a specialist.
--   select count(*) from public.ai_strategies where status = 'pending_review';
--
--   -- 3. A strategy about somebody else's child.
--   select count(*) from public.ai_strategies s
--   where not public.is_guardian_of(s.student_id);
--
-- db/verify.sql: policies increases by one.
-- ---------------------------------------------------------------------------
