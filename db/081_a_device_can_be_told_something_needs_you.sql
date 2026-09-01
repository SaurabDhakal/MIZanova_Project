-- ---------------------------------------------------------------------------
-- 081 — Where a browser says "you may notify this device"
-- ---------------------------------------------------------------------------
-- The client's brief asks for push notifications. This is the storage half:
-- one row per browser that has agreed to receive them.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT IN THIS TABLE
-- ---------------------------------------------------------------------------
-- No student id, no message body, nothing about what a notification will say.
-- A push subscription is an address, not content.
--
-- That matters more here than in most products. vite.config.ts refuses to cache
-- any Supabase response because "these laptops are shared between classrooms,
-- and a cache survives signing out". A notification sitting in the tray of a
-- shared laptop is the same exposure with a wider audience — it is visible
-- without unlocking anything, to whoever walks past.
--
-- So the rule the sending side must keep, and which this schema makes easy to
-- keep, is that a notification says HOW MANY things need somebody and never
-- WHICH child. "3 things need you at Willow Creek" is the whole payload. If a
-- future change wants to put a name in one, it will have to add a column and
-- argue for it in writing, which is the point.
--
-- ---------------------------------------------------------------------------
-- ONE ROW PER BROWSER, NOT PER PERSON
-- ---------------------------------------------------------------------------
-- A teacher has a classroom desktop and a phone; a specialist moves between
-- schools with a laptop. Each browser produces its own endpoint from its own
-- push service, and each must be stored separately or enabling notifications
-- on the second device silently switches them off on the first.
--
-- `endpoint` is unique because it IS the identity of a browser's subscription.
-- Re-subscribing the same browser returns the same endpoint, so an upsert on
-- it refreshes the keys rather than accumulating dead rows.

begin;

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,

  -- The push service's URL for this browser. Long, opaque, and the unique key.
  endpoint     text not null unique,

  -- The two halves of the browser's encryption key. Without both, a payload
  -- cannot be encrypted for it, so a row missing either is unusable.
  p256dh       text not null check (btrim(p256dh) <> ''),
  auth         text not null check (btrim(auth) <> ''),

  -- Shown to the person on their own settings screen so "revoke the one on the
  -- staffroom computer" is a thing they can actually do. Never used to decide
  -- anything.
  user_agent   text,

  created_at   timestamptz not null default now(),
  -- Moved when a push to this endpoint succeeds. A subscription that has not
  -- been used in months is usually a browser profile that no longer exists.
  last_used_at timestamptz
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

-- ---------------------------------------------------------------------------
-- Your own devices, and nobody else's
-- ---------------------------------------------------------------------------
-- Not even a platform admin reads these. An endpoint is a capability: anyone
-- holding it and the VAPID private key can send that browser a notification,
-- so the fewer people who can list them, the better. The server sends with the
-- service key, which bypasses RLS by design.

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions for select to authenticated
  using (profile_id = auth.uid());

-- INSERT goes through the server, which holds the service key, because the
-- browser should not be trusted to say whose device this is. The policy exists
-- anyway so the table is never open by omission.
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions for insert to authenticated
  with check (profile_id = auth.uid());

-- Turning notifications off has to work from the device you are holding, which
-- may not be the device that subscribed.
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete to authenticated
  using (profile_id = auth.uid());

-- No update policy. A subscription's keys are not edited; a browser that
-- re-subscribes produces a fresh row against the same endpoint, and the server
-- upserts it.

revoke all on public.push_subscriptions from anon;
grant select, insert, delete on public.push_subscriptions to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked.
-- ---------------------------------------------------------------------------
--   select count(*) from public.push_subscriptions;            -- 0
--   select policyname from pg_policies
--    where tablename = 'push_subscriptions';                   -- three rows
--
-- And that the table is genuinely shut to other people: sign in as one account,
-- insert a row for yourself, then read it back as another. The second read
-- must return nothing rather than an error.
