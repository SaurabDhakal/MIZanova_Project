-- ---------------------------------------------------------------------------
-- 082 — Making the demo data agree with the consent screen it is shown beside
-- ---------------------------------------------------------------------------
-- THIS FIXES DATA, NOT CODE. The consent gate is correct and stays untouched:
-- server/index.js checks `has_active_consent` before anonymisation and before
-- anything is sent anywhere, and returns 403 with an explanation when it is
-- missing. No strategy can be GENERATED today without consent.
--
-- The problem is that `db/seed_demo_school.sql` inserts into ai_strategies
-- (line 155) and never inserts a consent row. A seed writes straight to the
-- table, so it goes around the route where the gate lives. The result, measured
-- on 4 September 2026:
--
--     111 strategies across 27 students with NO active AI consent
--      10 strategies across  2 students with consent
--
-- So a teacher opens almost any child's record and sees AI suggestions, while
-- that family's Privacy & Consent screen says, correctly, "Not given". Nothing
-- is broken and it looks exactly like the one thing this product must never do,
-- on the screen that carries its central promise.
--
-- ---------------------------------------------------------------------------
-- WHY THE GRANT IS BACKDATED
-- ---------------------------------------------------------------------------
-- Stamping now() would leave a consent dated September against strategies
-- generated in July, which reads as "generated first, asked afterwards" — the
-- same accusation in a different shape, and harder to spot. Each row is dated
-- one day before that child's earliest strategy, so the sequence a reader
-- reconstructs is the sequence the product actually requires.
--
-- ---------------------------------------------------------------------------
-- SAFE TO RUN TWICE
-- ---------------------------------------------------------------------------
-- There is no unique constraint on (student_id, consent_type) — deliberately,
-- since a family may withdraw consent and give it again, and both facts are
-- kept. That means a second run would silently double every row, so the insert
-- is guarded by `not exists` rather than `on conflict`.
-- ---------------------------------------------------------------------------

insert into public.consents (
  student_id,
  granted_by,
  consent_type,
  granted_at,
  policy_version,
  notes
)
select
  s.id,
  -- The child's own guardian where one is linked, so the row names a plausible
  -- person rather than nobody. Null is allowed and is the honest answer for a
  -- seeded child no family has been attached to.
  (
    select sg.profile_id
    from public.student_guardians sg
    where sg.student_id = s.id
    order by sg.created_at
    limit 1
  ),
  'ai_strategy_generation',
  earliest.first_strategy - interval '1 day',
  'v1',
  'Backfilled by db/082 for demo data seeded before this consent existed. '
    || 'Not a consent any family gave.'
from public.students s
join lateral (
  select min(a.created_at) as first_strategy
  from public.ai_strategies a
  where a.student_id = s.id
) earliest on earliest.first_strategy is not null
where not exists (
  select 1
  from public.consents c
  where c.student_id = s.id
    and c.consent_type = 'ai_strategy_generation'
    and c.revoked_at is null
);

-- ---------------------------------------------------------------------------
-- TWO REAL CONSENTS ARE LEFT EXACTLY AS THEY ARE
-- ---------------------------------------------------------------------------
-- The `not exists` guard already skips them, and that is the point rather than
-- a side effect. Both were given by an actual person:
--
--   joe a.   31 Aug 23:27, by a parent on their own Privacy screen — ten
--            minutes BEFORE the strategy it covers. The product working.
--   Arlo K.   3 Sep 13:39, by school staff, noted "Recorded by school staff
--            from a consent given outside MiZanova", against strategies the
--            seed dated in July.
--
-- Arlo's row therefore postdates the strategies beside it, and it must stay
-- that way. It is a record of something a person really did on a real date;
-- backdating it to tidy a demo would be falsifying a consent record, which is
-- the one kind of row in this database that exists to be trusted later.
--
-- ---------------------------------------------------------------------------
-- Check it did what it says. Both counts should be 0 afterwards.
-- ---------------------------------------------------------------------------
--   select count(distinct a.student_id) as students_without_consent
--   from public.ai_strategies a
--   where not exists (
--     select 1 from public.consents c
--     where c.student_id = a.student_id
--       and c.consent_type = 'ai_strategy_generation'
--       and c.revoked_at is null
--   );
--
-- Scoped to the rows THIS file writes. An unscoped version of this query
-- returns 4 on a completely successful run, because of Arlo above — a check
-- that reports failure on success is worse than no check.
--
--   select count(*) as backfilled_consents_dated_after_a_strategy
--   from public.consents c
--   join public.ai_strategies a on a.student_id = c.student_id
--   where c.consent_type = 'ai_strategy_generation'
--     and c.revoked_at is null
--     and c.notes like 'Backfilled by db/082%'
--     and c.granted_at > a.created_at;
