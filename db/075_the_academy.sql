-- ===========================================================================
-- 075_the_academy.sql — structured program delivery
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: THE LARGEST THING IN THE BRIEF THAT DID NOT EXIST AT ALL
-- ---------------------------------------------------------------------------
-- Joe Abboud's requirement 2: "Structured program delivery (learning
-- management) — enrolment pathways, video modules, resource toolkits, and
-- progress dashboards." Requirement 4 adds "CRUD functionality for courses,
-- articles, case studies".
--
-- The document calls the thing "Special Miles Academy" and lists what it
-- carries: professional development for schools, Empowered Parenting for
-- families, executive functioning and self-advocacy for students, and
-- neurodiversity training for workplaces.
--
-- None of it existed. Searching this repository for "course", "module",
-- "lesson" or "enrol" returned the English words in comments and nothing else.
--
-- ---------------------------------------------------------------------------
-- AUDIENCE IS A ROLE, NOT A NEW VOCABULARY
-- ---------------------------------------------------------------------------
-- The brief segments by customer group — families, students, schools, NDIS
-- providers, corporate. Four of those are already `user_role` values, because
-- they are the same people. Empowered Parenting is for `parent`; study skills
-- are for `student`; professional development is for `educator` and
-- `school_admin`.
--
-- So a course names the roles it is for and RLS matches on `my_role()`.
-- Inventing an `audience` enum beside `user_role` would create two lists that
-- mean the same thing and drift the first time somebody adds to one.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT HERE
-- ---------------------------------------------------------------------------
-- NO FILE UPLOADS FOR COURSE MATERIAL. `resources` (db/030) is school-scoped —
-- `school_id not null` — because it holds a school's own material for its own
-- families. Academy content belongs to Special Miles and to no school, so it
-- cannot live there, and a platform-level bucket with its own policies is a
-- separate piece of work. A module carries text and an optional video URL, and
-- "resource toolkits" waits for that bucket rather than being faked.
--
-- NO QUIZZES, CERTIFICATES OR SCORES. The brief does not ask for them, and
-- assessment is a product decision with consequences — a failed score attached
-- to an educator is an employment record.
--
-- NO GAMIFICATION, though the requirements list mentions badges and
-- leaderboards. A leaderboard ranking teachers by modules completed, or
-- children by goals met, is the kind of thing that looks motivating in a
-- requirements list and reads as public shaming in a school. It needs a
-- decision from the client, not an implementation.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. A course
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),

  title       text not null check (btrim(title) <> ''),
  -- Shown in a list, so it has to say what the course is for to somebody
  -- deciding whether to spend an hour on it.
  summary     text not null check (btrim(summary) <> ''),

  -- Who it is for. An empty array would mean "nobody", which is a mistake
  -- rather than an intention, so it is refused.
  audiences   public.user_role[] not null
                check (array_length(audiences, 1) >= 1),

  -- DRAFT UNTIL SOMEBODY PUBLISHES IT. A half-written course visible to two
  -- thousand parents is the failure mode of a CMS, and db/020 already
  -- established draft-then-issue as this product's shape for anything with an
  -- audience.
  is_published boolean not null default false,
  published_at timestamptz,

  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint courses_published_has_timestamp
    check (is_published = (published_at is not null))
);

create index if not exists courses_published_idx
  on public.courses (is_published, created_at desc);


-- ---------------------------------------------------------------------------
-- 2. The modules inside it
-- ---------------------------------------------------------------------------
create table if not exists public.course_modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,

  title       text not null check (btrim(title) <> ''),
  -- Plain text. Not HTML: this is written by staff and rendered to families,
  -- and storing markup somebody pastes from Word is how a content field
  -- becomes an injection surface. The brief asks for input validation by name.
  body        text not null default '' check (length(body) <= 20000),

  -- Optional, and EXTERNAL. Video cannot be self-hosted here in any honest
  -- sense — see the header — so this is a link to wherever Special Miles
  -- actually publishes it.
  video_url   text check (video_url is null or video_url ~* '^https://'),

  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists course_modules_course_idx
  on public.course_modules (course_id, sort_order);


-- ---------------------------------------------------------------------------
-- 3. Enrolment, and how far somebody has got
-- ---------------------------------------------------------------------------
create table if not exists public.course_enrolments (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,

  enrolled_at   timestamptz not null default now(),
  -- Set when every module is done. A derived fact stored on purpose: "when did
  -- they finish" is asked far more often than it changes, and recomputing it
  -- across a progress dashboard is the query that gets slow first.
  completed_at  timestamptz,

  -- One enrolment per person per course. Re-enrolling would reset progress
  -- somebody earned.
  constraint course_enrolments_once unique (course_id, profile_id)
);

create index if not exists course_enrolments_profile_idx
  on public.course_enrolments (profile_id, enrolled_at desc);

create table if not exists public.module_completions (
  id            uuid primary key default gen_random_uuid(),
  enrolment_id  uuid not null references public.course_enrolments(id) on delete cascade,
  module_id     uuid not null references public.course_modules(id) on delete cascade,
  completed_at  timestamptz not null default now(),

  constraint module_completions_once unique (enrolment_id, module_id)
);


-- ---------------------------------------------------------------------------
-- 4. updated_at by trigger
-- ---------------------------------------------------------------------------
drop trigger if exists courses_touch on public.courses;
create trigger courses_touch
  before update on public.courses
  for each row execute function public.touch_updated_at();

drop trigger if exists course_modules_touch on public.course_modules;
create trigger course_modules_touch
  before update on public.course_modules
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- 5. Finishing the last module finishes the course
-- ---------------------------------------------------------------------------
-- In the database rather than in React, so a progress dashboard cannot
-- disagree with the tick a learner just saw. The same argument db/001 makes
-- about updated_at.
-- ---------------------------------------------------------------------------
create or replace function public.course_enrolment_check_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
  v_total  integer;
  v_done   integer;
begin
  select e.course_id into v_course
  from public.course_enrolments e where e.id = new.enrolment_id;

  select count(*) into v_total
  from public.course_modules m where m.course_id = v_course;

  select count(*) into v_done
  from public.module_completions c
  join public.course_modules m on m.id = c.module_id
  where c.enrolment_id = new.enrolment_id
    and m.course_id = v_course;

  -- `v_total > 0` matters: a course with no modules would otherwise complete
  -- itself the moment somebody enrolled, since 0 = 0.
  if v_total > 0 and v_done >= v_total then
    update public.course_enrolments
       set completed_at = coalesce(completed_at, now())
     where id = new.enrolment_id;
  end if;

  return null;
end $$;

drop trigger if exists module_completions_finish on public.module_completions;
create trigger module_completions_finish
  after insert on public.module_completions
  for each row execute function public.course_enrolment_check_complete();


-- ---------------------------------------------------------------------------
-- 6. Who may see and change what
-- ---------------------------------------------------------------------------
alter table public.courses            enable row level security;
alter table public.course_modules     enable row level security;
alter table public.course_enrolments  enable row level security;
alter table public.module_completions enable row level security;

drop policy if exists courses_select on public.courses;
drop policy if exists courses_write on public.courses;
drop policy if exists course_modules_select on public.course_modules;
drop policy if exists course_modules_write on public.course_modules;
drop policy if exists course_enrolments_select on public.course_enrolments;
drop policy if exists course_enrolments_insert on public.course_enrolments;
drop policy if exists module_completions_select on public.module_completions;
drop policy if exists module_completions_insert on public.module_completions;

-- PUBLISHED, AND FOR YOUR ROLE. A platform admin also sees drafts, because
-- somebody has to be able to write one.
create policy courses_select on public.courses
  for select to authenticated
  using (
    public.is_platform_admin()
    or (is_published and public.my_role() = any (audiences))
  );

-- Only Special Miles authors the Academy. A school writing its own courses is a
-- different product, and one where "who vetted this" stops having an answer.
create policy courses_write on public.courses
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- A module is readable exactly when its course is.
create policy course_modules_select on public.course_modules
  for select to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_modules.course_id
        and (
          public.is_platform_admin()
          or (c.is_published and public.my_role() = any (c.audiences))
        )
    )
  );

create policy course_modules_write on public.course_modules
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Your own enrolments. A platform admin sees all, which is what makes a
-- progress dashboard possible.
create policy course_enrolments_select on public.course_enrolments
  for select to authenticated
  using (profile_id = auth.uid() or public.is_platform_admin());

-- YOU ENROL YOURSELF, and only in something you are allowed to see. Without the
-- second half, anybody could enrol in a draft course by id and then read its
-- modules through their enrolment.
create policy course_enrolments_insert on public.course_enrolments
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.courses c
      where c.id = course_enrolments.course_id
        and c.is_published
        and public.my_role() = any (c.audiences)
    )
  );

create policy module_completions_select on public.module_completions
  for select to authenticated
  using (
    exists (
      select 1 from public.course_enrolments e
      where e.id = module_completions.enrolment_id
        and (e.profile_id = auth.uid() or public.is_platform_admin())
    )
  );

-- Ticking somebody else's module off would be writing progress against their
-- name, so the enrolment must be the caller's own.
create policy module_completions_insert on public.module_completions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.course_enrolments e
      where e.id = module_completions.enrolment_id
        and e.profile_id = auth.uid()
    )
  );

revoke all on public.courses            from anon;
revoke all on public.course_modules     from anon;
revoke all on public.course_enrolments  from anon;
revoke all on public.module_completions from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select tablename, rowsecurity from pg_tables
--   where tablename in ('courses','course_modules','course_enrolments','module_completions');
--   -- all true
--
-- The two that matter. A DRAFT course must be invisible to its own audience:
--
--   insert into public.courses (title, summary, audiences)
--   values ('Draft', 'Not published', '{parent}');
--   -- as a parent: select count(*) from public.courses;  -- 0
--
-- And a course for one audience must be invisible to another:
--
--   -- a course with audiences '{parent}' must not appear to an educator.
--
-- STILL TO BUILD: "resource toolkits" from the brief needs a platform-level
-- file bucket, which db/030's school-scoped `resources` cannot be. Named here
-- so the omission is not read as an oversight.
-- ---------------------------------------------------------------------------
