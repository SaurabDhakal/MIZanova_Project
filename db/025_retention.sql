-- ===========================================================================
-- 025_retention.sql — stop keeping things forever
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHY
-- ---------------------------------------------------------------------------
-- Australian Privacy Principle 11.2 requires personal information to be
-- destroyed or de-identified once it is no longer needed. Nothing in MiZanova
-- expires. db/023 made that concrete rather than theoretical: the access log
-- grows by a row per staff member per child per five minutes, forever, and an
-- access log kept indefinitely is itself personal information about staff held
-- longer than it is needed.
--
-- WHAT THIS DOES AND DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
-- It purges OPERATIONAL data — records the product keeps about how it was
-- used. It does not touch a single thing about a child.
--
-- Deleting a behaviour log, a goal, an IEP document or a consent is a decision
-- for a school and its legal obligations, not a default somebody inherits from
-- a database script. In New South Wales, student welfare records are commonly
-- retained for years after a child leaves. Guessing a number here and quietly
-- destroying records to match it would be far worse than keeping too much:
-- one is a policy gap, the other is unrecoverable.
--
-- So: functions with explicit periods, run deliberately, over data whose loss
-- costs nothing but a longer memory of who looked at what.
--
-- NOTHING SCHEDULES THESE. pg_cron is not available on the free tier, so they
-- are called by `npm run purge` (scripts/purge.mjs) — by hand today, by a
-- scheduler when this is deployed somewhere real. A function that exists and
-- is never called is honest about being a manual step; a schedule that
-- silently fails is not.

begin;

-- ---------------------------------------------------------------------------
-- 1. Record access — twelve months
-- ---------------------------------------------------------------------------
-- Long enough to answer "who opened my child's file this year?", which is the
-- question it exists for and the horizon a complaint usually covers. Short
-- enough that it is not a permanent surveillance record of every teacher.
create or replace function public.purge_access_events(p_keep_days integer default 365)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if p_keep_days < 30 then
    -- A guard against a typo emptying the table. Thirty days is already
    -- shorter than any defensible policy.
    raise exception 'Refusing to keep less than 30 days of access events.';
  end if;

  delete from public.student_access_events
  where occurred_at < now() - make_interval(days => p_keep_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Spent recovery codes — ninety days
-- ---------------------------------------------------------------------------
-- A used code is already worthless: `redeem_recovery_code` will not accept it
-- again. It is kept briefly only so "this account was recovered on the 4th"
-- can be answered, and there is no reason to hold the hash beyond that.
--
-- UNUSED codes are never touched. They are the live ones.
create or replace function public.purge_spent_recovery_codes(
  p_keep_days integer default 90
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.mfa_recovery_codes
  where used_at is not null
    and used_at < now() - make_interval(days => p_keep_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Sent offline logs? No.
-- ---------------------------------------------------------------------------
-- Worth stating so nobody adds it later thinking it was missed. The offline
-- queue lives in the browser's localStorage and is cleared when a log uploads;
-- there is nothing server-side to purge.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
-- service_role only. Not because a platform admin should not be trusted, but
-- because deletion at scale should be a deliberate operational act with a
-- record of who ran it, not a button somebody can press while browsing.
revoke all on function public.purge_access_events(integer) from public, anon, authenticated;
revoke all on function public.purge_spent_recovery_codes(integer)
  from public, anon, authenticated;

grant execute on function public.purge_access_events(integer) to service_role;
grant execute on function public.purge_spent_recovery_codes(integer) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- WHAT STILL HAS NO RETENTION PERIOD, and needs a human decision:
--
--   behaviour_logs, ai_strategies, goals, goal_milestones, iep_documents,
--   home_observations, messages, consents, admin_audit_events, invoices
--
-- Every one is either a record about a child or evidence about how the school
-- behaved. Each needs a period agreed with Special Miles and checked against
-- the relevant state's records legislation before anything deletes it.
--
-- consents and admin_audit_events are the two most likely to be KEPT
-- indefinitely on purpose: proving what was agreed, and proving who did what,
-- are the reasons they exist.
-- ---------------------------------------------------------------------------
