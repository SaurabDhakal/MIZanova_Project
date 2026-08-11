-- ===========================================================================
-- 027_system_events.sql — record failures somewhere a person will see them
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHY
-- ---------------------------------------------------------------------------
-- Several things can go wrong quietly. The anonymiser can fail closed and
-- block every AI request. A payment can be taken by Stripe and fail to be
-- recorded here. A webhook can be rejected because a secret is wrong, which
-- looks exactly like an attacker probing. Every one of those currently writes
-- to console.error in a terminal nobody is watching.
--
-- WHAT THIS IS, AND WHAT IT IS NOT
-- ---------------------------------------------------------------------------
-- It is a record of failures the SERVER noticed, readable by Special Miles.
-- That covers the cases where something is running and going wrong, which is
-- most of them.
--
-- It is NOT uptime monitoring. If the API server is down it records nothing,
-- because nothing is running to record it — and no alert is sent, because
-- there is nowhere to send one. Knowing the server has stopped requires
-- something outside the server to check, which is an external service and a
-- decision for whoever deploys this. `GET /api/health` exists for exactly that
-- and nothing polls it yet.
--
-- Saying so plainly matters more than the table does. A dashboard that reports
-- "no problems" while the server is unreachable is worse than no dashboard.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'system_event_severity') then
    create type public.system_event_severity as enum (
      'info',      -- worth counting, nobody needs to act
      'warning',   -- someone should look today
      'critical'   -- something is broken or money is missing
    );
  end if;
end $$;

create table if not exists public.system_events (
  id          uuid primary key default gen_random_uuid(),
  severity    public.system_event_severity not null default 'warning',

  -- Where it came from and what happened, e.g. 'billing' / 'payment_unrecorded'.
  source      text not null,
  event       text not null,

  -- Free text for a human. NEVER a child's name, an anonymised payload, or a
  -- secret: this table is read by Special Miles staff across every school, and
  -- a debugging aid is not a reason to move personal information into it.
  detail      text,

  occurred_at timestamptz not null default now()
);

create index if not exists system_events_recent_idx
  on public.system_events (occurred_at desc);

create index if not exists system_events_unresolved_idx
  on public.system_events (severity, occurred_at desc)
  where severity in ('warning', 'critical');

alter table public.system_events enable row level security;

-- Special Miles only. A school does not need to know that another school's
-- webhook secret is misconfigured, and most entries are meaningless without
-- the code in front of you.
drop policy if exists system_events_select on public.system_events;
create policy system_events_select
  on public.system_events for select to authenticated
  using (public.is_platform_admin());

-- No insert policy. Written by the API server with the service key. A failure
-- log a browser can write to is a failure log that can be filled with noise
-- until the real entry scrolls away.
revoke all on public.system_events from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked:
--
--   select * from public.system_events order by occurred_at desc limit 5;
--
-- Empty is the correct answer on a healthy system. To prove the path works,
-- send a forged webhook — `npm run webhook-check` does it four times — and
-- look again: rejected signatures are recorded as warnings.
-- ---------------------------------------------------------------------------
