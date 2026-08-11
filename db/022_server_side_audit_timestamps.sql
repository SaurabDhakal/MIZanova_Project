-- ===========================================================================
-- 022_server_side_audit_timestamps.sql — audit times come from the server
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHY
-- ---------------------------------------------------------------------------
-- Two timestamps that exist to prove something happened were being written by
-- the browser:
--
--   behaviour_logs.safeguarding_acknowledged_at
--     when a responsible adult read a flagged incident
--   ai_strategies.reviewed_at
--     when a specialist released or rejected a suggestion
--
-- Neither errors on a skewed clock the way `consents.revoked_at` did (db/021),
-- so nothing was visibly broken. The problem is what they are FOR. Both are
-- evidence — the first especially, since "how long did the school take to act
-- on a safeguarding flag?" is a question asked after something has gone wrong,
-- and `school_kpi_overview` already reports a median on it.
--
-- A value supplied by the client is not evidence. It is off by whatever that
-- laptop's clock is off by, and anyone who wants to can set it to whatever
-- they like by editing one line in the browser console.
--
-- These triggers overwrite the submitted value with `now()` at the moment the
-- column stops being null. The application keeps sending a timestamp — it is
-- simply no longer the one that gets stored.

begin;

-- ---------------------------------------------------------------------------
-- 1. Safeguarding acknowledgement
-- ---------------------------------------------------------------------------
create or replace function public.stamp_safeguarding_acknowledgement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only on the transition. An administrator editing their note a week later
  -- must not silently reset when the acknowledgement happened.
  if new.safeguarding_acknowledged_at is not null
     and old.safeguarding_acknowledged_at is null then
    new.safeguarding_acknowledged_at := now();
  end if;

  -- Equally, once set it cannot be moved or cleared by an update. Clearing it
  -- would also reopen the FR14 edit lock, which is tested in
  -- tests/rls/safeguarding-lock.test.ts.
  if old.safeguarding_acknowledged_at is not null then
    new.safeguarding_acknowledged_at := old.safeguarding_acknowledged_at;
  end if;

  return new;
end;
$$;

drop trigger if exists behaviour_logs_stamp_acknowledgement on public.behaviour_logs;
create trigger behaviour_logs_stamp_acknowledgement
  before update on public.behaviour_logs
  for each row execute function public.stamp_safeguarding_acknowledgement();

-- ---------------------------------------------------------------------------
-- 2. Specialist review of an AI suggestion
-- ---------------------------------------------------------------------------
create or replace function public.stamp_strategy_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Set on each genuine review, because a suggestion can be reviewed more than
  -- once: flagged by a teacher after release sends it back to pending, and the
  -- second decision needs its own time.
  if new.reviewed_at is distinct from old.reviewed_at
     and new.reviewed_at is not null then
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists ai_strategies_stamp_review on public.ai_strategies;
create trigger ai_strategies_stamp_review
  before update on public.ai_strategies
  for each row execute function public.stamp_strategy_review();

commit;

-- ---------------------------------------------------------------------------
-- Check it worked. In the SQL editor, against any acknowledged log:
--
--   update public.behaviour_logs
--      set safeguarding_acknowledged_at = '1990-01-01'
--    where id = '…';
--
--   select safeguarding_acknowledged_at from public.behaviour_logs where id = '…';
--
-- The date must be unchanged, not 1990. Even here, as superuser.
-- ---------------------------------------------------------------------------
