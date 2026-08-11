-- ===========================================================================
-- 026_ai_quotas.sql — limits between "on" and "off"
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHY
-- ---------------------------------------------------------------------------
-- Any verified educator could ask for strategy generation without limit. The
-- only control was a global kill switch, so the choice was every school or no
-- school. One school could exhaust the entire Anthropic budget in a morning,
-- and the first sign of it would be strategies failing everywhere at once,
-- for everybody, with no clue why.
--
-- A quota is not only about money. A runaway loop, a script, or one teacher
-- clicking in frustration are all indistinguishable from legitimate use until
-- somebody counts.
--
-- WHAT IS COUNTED, AND WHY IT IS ITS OWN TABLE
-- ---------------------------------------------------------------------------
-- `ai_strategies` already records what came back, but three rows arrive per
-- request, refusals record nothing at all, and rows can be deleted with a
-- student. Counting them would answer a different question badly. This records
-- one row per REQUEST that reached the model, which is the thing that costs
-- money and the thing a limit should bound.

begin;

alter table public.ai_controls
  add column if not exists daily_limit_per_school integer not null default 200
    check (daily_limit_per_school >= 0);

alter table public.ai_controls
  add column if not exists daily_limit_per_user integer not null default 40
    check (daily_limit_per_user >= 0);

-- Defaults chosen to be generous rather than clever: a class of thirty with
-- several incidents each is nowhere near 200, so a school hitting it is doing
-- something nobody intended. A limit that stops real work on a bad Tuesday
-- teaches people to route around it.

create table if not exists public.ai_generation_events (
  id               uuid primary key default gen_random_uuid(),

  -- Denormalised on purpose. The student may be deleted later and the usage
  -- record must survive that: it is about spend and behaviour, not the child.
  school_id        uuid references public.schools(id) on delete set null,
  requested_by     uuid references public.profiles(id) on delete set null,

  behaviour_log_id uuid,
  strategies_returned integer not null default 0,
  model            text,

  occurred_at      timestamptz not null default now()
);

create index if not exists ai_generation_events_school_idx
  on public.ai_generation_events (school_id, occurred_at desc);
create index if not exists ai_generation_events_user_idx
  on public.ai_generation_events (requested_by, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Asking whether there is room
-- ---------------------------------------------------------------------------
-- Returns the numbers rather than a yes/no, so the server can say WHICH limit
-- was reached. "You have reached today's limit" with no further detail is the
-- kind of message that generates a support call.
--
-- A rolling 24 hours, not a calendar day. Midnight in which timezone is a
-- question with no good answer for a product used across Australian states,
-- and a calendar reset invites saving up requests for 12:01am.
create or replace function public.ai_quota_status(
  p_school_id uuid,
  p_actor_id  uuid
)
returns table (
  school_used  integer,
  school_limit integer,
  user_used    integer,
  user_limit   integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer
       from public.ai_generation_events e
      where e.school_id = p_school_id
        and e.occurred_at > now() - interval '24 hours'),
    (select c.daily_limit_per_school from public.ai_controls c where c.id),
    (select count(*)::integer
       from public.ai_generation_events e
      where e.requested_by = p_actor_id
        and e.occurred_at > now() - interval '24 hours'),
    (select c.daily_limit_per_user from public.ai_controls c where c.id);
$$;

revoke all on function public.ai_quota_status(uuid, uuid) from public, anon;
-- Readable by a signed-in user so a screen can show "18 of 40 used today"
-- without a round trip through the API server. It reveals counts, not content.
grant execute on function public.ai_quota_status(uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
alter table public.ai_generation_events enable row level security;

drop policy if exists ai_generation_events_select on public.ai_generation_events;
create policy ai_generation_events_select
  on public.ai_generation_events for select to authenticated
  using (
    public.is_platform_admin()
    or (public.is_school_admin() and school_id = public.my_school_id())
  );

-- No insert policy. Rows come from the API server with the service key, after
-- a request has actually been made. A usage record a browser can write is a
-- usage record that can be under-reported by whoever is over their limit.
revoke all on public.ai_generation_events from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked, from the SQL editor:
--
--   select * from public.ai_quota_status(
--     (select id from public.schools limit 1),
--     (select id from public.profiles limit 1)
--   );
--
-- Zero used, and the two limits. Then ask a teacher to request strategies and
-- run it again.
-- ---------------------------------------------------------------------------
