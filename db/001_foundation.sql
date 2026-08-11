-- ===========================================================================
-- MiZanova — 001_foundation.sql
-- Roles, schools (tenants), user profiles, and the signup trigger.
--
-- SAFE TO RUN TWICE. Every statement either guards itself or replaces itself,
-- so if a run fails partway you can fix the error and re-run the whole file.
-- (The Supabase SQL editor does not wrap scripts in a transaction — a failure
-- at line 120 leaves lines 1-119 committed.)
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The five roles
-- ---------------------------------------------------------------------------
-- A Postgres ENUM rather than a plain text column: the database itself then
-- rejects a typo like 'schooladmin' at write time. Row-Level Security policies
-- compare against these exact strings, so a silent typo would otherwise create
-- a user who matches no policy and can see nothing, with no error anywhere.
--
-- There are exactly five. `super_admin` is retired — Super Admin was merged
-- into Platform Admin. Do not add a sixth without agreeing it first.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum (
      'educator',
      'parent',
      'specialist',
      'school_admin',
      'platform_admin'
    );
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. Shared helper: keep updated_at honest
-- ---------------------------------------------------------------------------
-- Applied by trigger to every table with an updated_at column. Doing this in
-- the database rather than in React means the timestamp is correct even when a
-- row is changed from the SQL editor, an admin tool, or a background job.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. schools — the tenants
-- ---------------------------------------------------------------------------
-- Every student, educator and behaviour log belongs to exactly one school.
-- This column is what stops School A ever seeing School B's data: the RLS
-- policies in 002 all compare school_id against the signed-in user's school.
create table if not exists public.schools (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  suburb       text,
  -- Australian state/territory. Constrained rather than free text so the
  -- jurisdiction rules in FR17 have something reliable to switch on.
  state        text check (state in ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA')),
  -- Schools are Australian; default matches the Sydney hosting region (NFR6).
  timezone     text not null default 'Australia/Sydney',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists schools_set_updated_at on public.schools;
create trigger schools_set_updated_at
  before update on public.schools
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 4. profiles — one row per signed-in human
-- ---------------------------------------------------------------------------
-- Supabase owns the auth.users table (passwords, email, sessions) and we cannot
-- add columns to it. So every user gets a matching row here, holding the things
-- OUR application cares about: which role they have and which school they're in.
--
-- `id` is both the primary key and a foreign key to auth.users. One identity,
-- one profile, and deleting the account deletes the profile with it.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,

  -- Null for Platform Admins (Special Miles staff belong to no single school).
  -- on delete restrict: a school with people still attached cannot be deleted
  -- out from under them by accident.
  school_id    uuid references public.schools(id) on delete restrict,

  -- Defaults to the LEAST privileged role. If the signup trigger below is ever
  -- bypassed or fails, the fallback must be the role that can do least damage,
  -- never a powerful one.
  role         public.user_role not null default 'parent',

  first_name   text not null default '',
  last_name    text not null default '',

  -- Computed by the database, not by React. A generated column cannot be
  -- written to, so no future UI code can put something inconsistent here.
  full_name    text generated always as (
                 btrim(first_name || ' ' || last_name)
               ) stored,

  email        text,

  -- FR18: educators and specialists are verified by a Platform Admin
  -- (WWCC / ID documents) before they can be trusted with student data.
  -- Nobody can set this themselves — see the trigger below.
  is_verified  boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Indexes for the lookups RLS will perform on nearly every query.
create index if not exists profiles_school_id_idx on public.profiles (school_id);
create index if not exists profiles_role_idx      on public.profiles (role);


-- ---------------------------------------------------------------------------
-- 5. The signup trigger — the single most security-critical thing here
-- ---------------------------------------------------------------------------
-- When someone signs up, Supabase inserts into auth.users. This creates their
-- matching profile row automatically.
--
-- THE IMPORTANT PART: signup metadata is written by the BROWSER, so a user can
-- send whatever they like — including role: 'platform_admin'. If we trusted it,
-- anyone could hand themselves the entire platform with a modified request.
--
-- So only three roles may ever be self-selected. school_admin and
-- platform_admin are assigned by running SQL directly, deliberately, by a human
-- with database access. There is no admin signup flow and there must not be.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer            -- runs with the privileges needed to write profiles
set search_path = public    -- pinned: stops a hijacked search_path redirecting us
as $$
declare
  claimed_role text := nullif(new.raw_user_meta_data ->> 'role', '');
  safe_role    public.user_role;
begin
  if claimed_role in ('educator', 'parent', 'specialist') then
    safe_role := claimed_role::public.user_role;
  else
    -- Covers null, nonsense, AND any attempt to claim an admin role.
    safe_role := 'parent';
  end if;

  insert into public.profiles (id, role, first_name, last_name, email)
  values (
    new.id,
    safe_role,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email
  )
  on conflict (id) do nothing;   -- makes a re-run harmless

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 6. Lock both tables down
-- ---------------------------------------------------------------------------
-- Row-Level Security on, with NO policies yet, means: nobody can read or write
-- anything through the API. That is deliberate. Your Supabase URL and
-- publishable key ship inside the JavaScript every visitor downloads, so a
-- table without RLS is a table open to the public internet.
--
-- Denied-by-default now, then 002 grants back exactly the access each role
-- needs. Until then these tables are correctly unreadable — including by you
-- from the app. The SQL editor still works, because it connects as the
-- database owner and bypasses RLS.
alter table public.schools  enable row level security;
alter table public.profiles enable row level security;


-- ---------------------------------------------------------------------------
-- Done. Verify with the queries in the chat, or:
--   select table_name from information_schema.tables
--   where table_schema = 'public';
-- ---------------------------------------------------------------------------
