-- ---------------------------------------------------------------------------
-- 101 — Something to work on
-- ---------------------------------------------------------------------------
-- An individual account is, today, a reading list. Courses, articles, and a
-- box that answers a question once and forgets it. Nothing in it holds a
-- thread from one week to the next, and nothing gives somebody a reason to
-- come back on a Tuesday.
--
-- Joe's brief sells programs, not documents — "Building Strong Study Habits
-- and Self-Belief", "capacity-building rather than one-off intervention". A
-- habit is the thing being built, and a habit needs somewhere to live.
--
-- `goals` already exists and cannot be used: `goals.student_id` is NOT NULL,
-- and an individual has no student record by definition. Same shape of problem
-- as db/094, and the same answer — a person-scoped table beside the
-- student-scoped one rather than making a school column nullable and hoping
-- every policy that reads it still means what it did.
--
-- ---------------------------------------------------------------------------
-- WHY THERE IS A "WHY" COLUMN
-- ---------------------------------------------------------------------------
-- `goals` has title, description, category, progress_percent. This has title,
-- and why it matters to them.
--
-- That is not decoration. A goal set for a child by a school is a plan
-- somebody else is accountable for, so it needs a category and a percentage to
-- report against. A goal somebody sets for themselves at eleven at night is
-- abandoned when they forget why they set it, and the single most useful thing
-- a screen can do six weeks later is show them their own reason in their own
-- words. There is no percentage here because nobody is reporting on them.
--
-- ---------------------------------------------------------------------------
-- CHECK-INS, NOT A STREAK
-- ---------------------------------------------------------------------------
-- A check-in records that they came back and how it went. Deliberately three
-- options and a note, and deliberately NOT a streak counter: a broken streak
-- punishes the person who most needs to come back, and this product is used by
-- people for whom a bad fortnight is a symptom rather than a failure of will.
--
-- ---------------------------------------------------------------------------
-- THE BROWSER WRITES THESE, UNLIKE db/094
-- ---------------------------------------------------------------------------
-- `individual_ai_requests` has no insert policy because a browser that could
-- write one could put words in the model's mouth. Nothing here comes from a
-- model. These are the person's own words about their own life, so they get
-- ordinary insert, update and delete policies on their own rows, and no server
-- route is needed at all.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.individual_goals (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,

  title        text not null check (btrim(title) <> '' and length(title) <= 200),
  -- Their reason, in their words. Optional: somebody who does not want to
  -- write one should not be blocked from setting a goal.
  why          text check (length(why) <= 2000),

  status       text not null default 'active'
                 check (status in ('active', 'done', 'parked')),
  target_date  date,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  done_at      timestamptz,

  -- 'done' and a completion time travel together or neither is trustworthy.
  constraint individual_goals_done_has_timestamp
    check ((status = 'done') = (done_at is not null))
);

create index if not exists individual_goals_mine_idx
  on public.individual_goals (profile_id, status, created_at desc);


create table if not exists public.individual_goal_checkins (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null
                 references public.individual_goals(id) on delete cascade,

  -- Three, not five. A scale with a middle and two ends is answerable in the
  -- half-second somebody actually has; more options make it a decision.
  how_it_went  text not null check (how_it_went in ('good', 'mixed', 'hard')),
  note         text check (length(note) <= 2000),

  created_at   timestamptz not null default now()
);

create index if not exists individual_goal_checkins_goal_idx
  on public.individual_goal_checkins (goal_id, created_at desc);


-- ---------------------------------------------------------------------------
-- Yours, and only yours — the same rule db/094 set for private writing
-- ---------------------------------------------------------------------------
-- No platform admin branch. A platform admin can read a child's goals because
-- Special Miles is accountable for what a school records about a child. Nobody
-- is accountable for what an adult decided to work on, so nobody else gets to
-- read it.
-- ---------------------------------------------------------------------------
alter table public.individual_goals         enable row level security;
alter table public.individual_goal_checkins enable row level security;

drop policy if exists individual_goals_own on public.individual_goals;
create policy individual_goals_own
  on public.individual_goals for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists individual_goal_checkins_own on public.individual_goal_checkins;
create policy individual_goal_checkins_own
  on public.individual_goal_checkins for all to authenticated
  using (
    exists (
      select 1 from public.individual_goals g
      where g.id = individual_goal_checkins.goal_id
        and g.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.individual_goals g
      where g.id = individual_goal_checkins.goal_id
        and g.profile_id = auth.uid()
    )
  );

revoke all on public.individual_goals         from anon;
revoke all on public.individual_goal_checkins from anon;
grant select, insert, update, delete on public.individual_goals         to authenticated;
grant select, insert, update, delete on public.individual_goal_checkins to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it. As one individual, insert a goal and a check-in against it; as
-- another, both must be invisible and un-writable:
--
--   select count(*) from public.individual_goals;              -- only yours
--   insert into public.individual_goal_checkins (goal_id, how_it_went)
--   values ('<somebody else''s goal>', 'good');                -- refused
-- ---------------------------------------------------------------------------
