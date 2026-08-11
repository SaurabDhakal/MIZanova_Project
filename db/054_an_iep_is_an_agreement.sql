-- ===========================================================================
-- 054 — An IEP is an agreement, not a note
-- ===========================================================================
-- Structured Individual Education / Individual Learning Plans, built from the
-- template in docs/IEP ILP Template.docx (an Australian ECEC-style IEP/ILP).
--
-- WHY THIS IS NOT JUST MORE `goals`
-- ---------------------------------------------------------------------------
-- `goals` (db/008) is a living thing: a teacher writes one, ticks milestones,
-- and a progress bar moves. That is the right model for day-to-day classroom
-- work and the wrong one for an IEP, for three reasons the paper form makes
-- obvious once you read it properly:
--
--   1. AN IEP IS AGREED AT A MEETING AND SIGNED. The form has two signature
--      blocks and two dates — a Proposed Review Date set when it is agreed, and
--      an Actual Review Date filled in later. A record a parent agreed to must
--      not quietly change afterwards, which is the opposite of how a living
--      goal behaves.
--
--   2. GOALS COME IN PAIRS. Each area of concern carries a LONG TERM goal and a
--      SHORT TERM goal, the short one being the stepping stone to the long one.
--      A flat `goals` row cannot express that relationship, and faking it with
--      two unrelated rows loses the only thing that made them a pair.
--
--   3. THE REVIEW OUTCOME IS NOT PROGRESS. "Not Met / Partially Met / Fully Met
--      / Exceeded" is a judgement made by people in a room on a date. A goal can
--      sit at 70% and still be judged Partially Met — and the gap between those
--      two answers is often the most useful thing said at the meeting. Storing
--      the judgement in `progress_percent` would destroy exactly that.
--
-- So IEP goals live here, and `iep_goals.goal_id` optionally points at a living
-- `goals` row when a teacher wants day-to-day tracking against a plan target.
-- Optional in both directions: an IEP is complete without one.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
-- NO SIGNATURES. The form says "Parent/Carer Sign". db/008 already decided this
-- question for IEP documents and the answer has not changed: a tick in a browser
-- is not an electronic signature, because a real one needs identity assurance
-- this product does not have. What is recorded is that a named person confirmed
-- the plan at a timestamp, and every screen must say that and nothing grander.
--
-- NO AI-WRITTEN GOALS. This product routes AI through a specialist on purpose.
-- An IEP goal is a formal commitment made to a family; it is the last thing in
-- the system that should be autocompleted.
--
-- NO COMPLIANCE SCORE. Nothing here computes a percentage next to a child.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The vocabulary
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.iep_plan_status as enum (
    'draft',       -- the school is still writing it; families cannot see it
    'agreed',      -- agreed at a meeting; the content is now frozen
    'in_review',   -- the review meeting is under way
    'closed',      -- reviewed and finished
    'superseded'   -- a later plan replaced it
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- The four boxes on the paper form, in the order they are printed.
  create type public.iep_review_outcome as enum (
    'not_met', 'partially_met', 'fully_met', 'exceeded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Monday to Friday, because the form's grid is Monday to Friday. A service
  -- that opens on Saturday is a real thing and this will need widening then;
  -- inventing two columns nobody fills in is how a form starts feeling like
  -- paperwork.
  create type public.iep_weekday as enum (
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday'
  );
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------------
-- 2. The plan
-- ---------------------------------------------------------------------------
create table if not exists public.iep_plans (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,

  plan_date     date not null default current_date,

  -- "Home language/s" sits at the top of the paper form and it is not a
  -- demographic curio: it decides whether the family can read the plan at all
  -- and whether the meeting needs an interpreter booked.
  home_languages text,

  -- "What can the child do now? Strengths / Interests?" The form then says
  -- "Refer to previous IEP/ILP unless this is a first IEP/ILP or new target",
  -- which is why `previous_plan_id` exists below.
  baseline      text,

  status        public.iep_plan_status not null default 'draft',

  -- Two dates, because the form has two. Proposed is a promise made at the
  -- meeting; actual is what happened. Keeping them apart is the only way to
  -- ever answer "which reviews are overdue?", which is a question paper cannot
  -- be asked.
  proposed_review_date date,
  actual_review_date   date,

  -- The chain. Null for a child's first plan.
  previous_plan_id uuid references public.iep_plans(id) on delete set null,

  -- Set by the guard trigger below, never by a screen.
  agreed_at     timestamptz,
  closed_at     timestamptz,

  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A plan cannot be its own predecessor.
  constraint iep_plans_not_own_previous check (previous_plan_id is null or previous_plan_id <> id),
  -- A review cannot have happened before the plan was written.
  constraint iep_plans_review_after_plan
    check (actual_review_date is null or actual_review_date >= plan_date)
);

create index if not exists iep_plans_student_idx
  on public.iep_plans (student_id, plan_date desc);

-- Finding overdue reviews is the whole reason `proposed_review_date` is a
-- column rather than a sentence inside `baseline`.
create index if not exists iep_plans_review_due_idx
  on public.iep_plans (proposed_review_date)
  where status in ('agreed', 'in_review');

drop trigger if exists iep_plans_set_updated_at on public.iep_plans;
create trigger iep_plans_set_updated_at
  before update on public.iep_plans
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 3. Who was in the room
-- ---------------------------------------------------------------------------
-- "People involved in setting IEP/ILP". Half of them have accounts here and
-- half do not — an external occupational therapist, a grandparent who is the
-- primary carer, a transition teacher from the school the child is moving to.
-- Requiring an account would mean the record could not describe the meeting
-- that actually happened, so a plain name and role is allowed.
create table if not exists public.iep_plan_participants (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.iep_plans(id) on delete cascade,

  profile_id  uuid references public.profiles(id) on delete set null,
  person_name text,
  person_role text,

  created_at  timestamptz not null default now(),

  -- One or the other must identify somebody.
  constraint iep_participant_identifiable
    check (profile_id is not null or btrim(coalesce(person_name, '')) <> '')
);

create index if not exists iep_plan_participants_plan_idx
  on public.iep_plan_participants (plan_id);


-- ---------------------------------------------------------------------------
-- 4. The goals table from the form
-- ---------------------------------------------------------------------------
create table if not exists public.iep_goals (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.iep_plans(id) on delete cascade,

  -- "Area of concern — Developmental Domains, Self Help, Transition to School".
  -- Free text rather than an enum: the printed hint lists three examples, not a
  -- closed set, and an early-childhood service will have its own language for
  -- this that a dropdown would quietly overrule.
  area_of_concern  text not null check (btrim(area_of_concern) <> ''),

  -- The form demands SMART twice, in bold, in brackets. Nothing here can check
  -- that a sentence is Specific or Measurable, so this does not pretend to —
  -- the UI shows the criteria beside the field and a person decides.
  long_term_goal   text not null check (btrim(long_term_goal) <> ''),
  short_term_goal  text not null check (btrim(short_term_goal) <> ''),

  -- "Teaching Strategies and Resources Required"
  strategies       text,

  -- Optional bridge to a living goal, so a teacher can track day-to-day
  -- progress against a plan target. `on delete set null`: deleting a classroom
  -- goal must never punch a hole in an agreed plan.
  goal_id          uuid references public.goals(id) on delete set null,

  sort_order       integer not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists iep_goals_plan_idx
  on public.iep_goals (plan_id, sort_order);

drop trigger if exists iep_goals_set_updated_at on public.iep_goals;
create trigger iep_goals_set_updated_at
  before update on public.iep_goals
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 5. The review — a judgement, on a date, by a person
-- ---------------------------------------------------------------------------
-- Its own table rather than a column on `iep_goals`, because a plan can be
-- reviewed more than once (an interim review before the formal one is ordinary
-- practice) and because overwriting the previous judgement would delete the
-- only evidence of whether a child is moving.
create table if not exists public.iep_goal_reviews (
  id           uuid primary key default gen_random_uuid(),
  iep_goal_id  uuid not null references public.iep_goals(id) on delete cascade,

  outcome      public.iep_review_outcome not null,

  -- The form prints "Tick as appropriate AND comment on progress towards
  -- target". The tick without the comment is the part nobody can act on later,
  -- so the UI asks for both; it is not forced here because a review captured
  -- late with only the tick is still worth more than no review.
  comment      text,

  reviewed_on  date not null default current_date,
  reviewed_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists iep_goal_reviews_goal_idx
  on public.iep_goal_reviews (iep_goal_id, reviewed_on desc);


-- ---------------------------------------------------------------------------
-- 6. "Who Supports the Child and How Often" — page two of the form
-- ---------------------------------------------------------------------------
-- This is resourcing evidence, not pedagogy. It is what gets produced when
-- somebody asks how many hours of support a child actually receives, which is
-- an audit and funding question rather than a teaching one.
--
-- IT IS NOT FROZEN WHEN THE PLAN IS AGREED, unlike the goals. Staffing changes
-- during a plan period — people leave, are sick, are reallocated — and a
-- schedule frozen in August that says who supports a child in November would be
-- confidently wrong. The goals are the agreement; this is how it is staffed.
create table if not exists public.iep_support_sessions (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.iep_plans(id) on delete cascade,

  weekday      public.iep_weekday not null,

  staff_name   text not null check (btrim(staff_name) <> ''),
  staff_role   text,
  intervention text,

  -- numeric, not integer: support is timetabled in half and quarter hours.
  -- Bounded because a typo of 80 in an hours-per-day column would flow straight
  -- into a weekly total somebody puts in front of a funder.
  hours        numeric(4,2) not null check (hours > 0 and hours <= 24),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists iep_support_sessions_plan_idx
  on public.iep_support_sessions (plan_id, weekday);

drop trigger if exists iep_support_sessions_set_updated_at on public.iep_support_sessions;
create trigger iep_support_sessions_set_updated_at
  before update on public.iep_support_sessions
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 7. Acknowledgement — deliberately NOT a signature
-- ---------------------------------------------------------------------------
-- Same shape and same reasoning as `iep_acknowledgements` in db/008. The paper
-- form has a signature line; this records that a named person confirmed the
-- plan at a moment. Any screen that renders this must say "confirmed", never
-- "signed", and must not draw anything resembling a signature.
create table if not exists public.iep_plan_confirmations (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.iep_plans(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,

  -- Which side of the table they were on. The form asks for a parent/carer AND
  -- a service representative, and "everyone confirmed" is not the same fact as
  -- "the family confirmed".
  as_guardian  boolean not null,

  confirmed_at timestamptz not null default now(),

  unique (plan_id, profile_id)
);

create index if not exists iep_plan_confirmations_plan_idx
  on public.iep_plan_confirmations (plan_id);


-- ---------------------------------------------------------------------------
-- 8. Weekly hours, counted by the database
-- ---------------------------------------------------------------------------
-- The form ends with "Total Number of Hours per Week:" and a blank box for a
-- human to add up at the end of a long day. Arithmetic is the one part of this
-- form a computer should certainly be doing.
-- security_invoker: the view runs as its CALLER, so RLS on
-- iep_support_sessions still applies. Without it a view runs as its owner
-- and bypasses RLS entirely — see db/055, which fixed exactly that.
create or replace view public.iep_support_totals
with (security_invoker = true) as
select
  plan_id,
  sum(hours)                                          as hours_per_week,
  count(distinct weekday)                             as days_covered,
  count(*)                                            as sessions
from public.iep_support_sessions
group by plan_id;


-- ---------------------------------------------------------------------------
-- 9. Agreement freezes the plan
-- ---------------------------------------------------------------------------
-- The point of the whole file. Once a plan is agreed with a family, its content
-- is what they agreed to. Reviews are still added — that is the entire purpose
-- of the later meeting — and the status and the review dates still move. The
-- goals and the words do not.
--
-- Enforced in the database rather than in React, because a rule that only a
-- screen knows about is a rule that lasts until the next screen.
create or replace function public.iep_plans_guard_frozen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status in ('agreed', 'in_review', 'closed', 'superseded') then
    if new.plan_date      is distinct from old.plan_date
    or new.baseline       is distinct from old.baseline
    or new.home_languages is distinct from old.home_languages
    or new.student_id     is distinct from old.student_id then
      -- coalesce, because a plan can reach 'superseded' without ever having
      -- been 'agreed', and "This plan was agreed on ." helps nobody.
      raise exception
        'This plan was agreed on %. Its content cannot be changed — write a new plan instead.',
        coalesce(to_char(old.agreed_at, 'DD Mon YYYY'), 'an earlier date')
        using errcode = '42501';
    end if;
  end if;

  -- Stamp the moment rather than trusting a screen to send it.
  if new.status = 'agreed' and old.status is distinct from 'agreed' then
    new.agreed_at := coalesce(new.agreed_at, now());
  end if;
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.closed_at := coalesce(new.closed_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists iep_plans_guard_frozen_trigger on public.iep_plans;
create trigger iep_plans_guard_frozen_trigger
  before update on public.iep_plans
  for each row execute function public.iep_plans_guard_frozen();


-- The same rule, one level down. `before` rather than `after` so the write is
-- refused before it lands (db/048 learned that the hard way with a unique index).
create or replace function public.iep_goals_guard_frozen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_status public.iep_plan_status;
  target_plan uuid;
begin
  -- NEW DOES NOT EXIST ON DELETE. Referencing it raises "record new is not
  -- assigned yet", and `coalesce(new, old)` is no safer — the reference itself
  -- is the error, before coalesce ever runs. Branch on TG_OP instead.
  if tg_op = 'DELETE' then
    target_plan := old.plan_id;
  else
    target_plan := new.plan_id;
  end if;

  select status into plan_status from public.iep_plans where id = target_plan;

  -- THE PLAN HAS ALREADY GONE, so this is the cascade from deleting the plan
  -- or the whole student, not somebody editing an agreed plan. Without this,
  -- removing a student who has an agreed IEP would fail with a message about
  -- editing goals, which is true of nothing the caller did.
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if plan_status in ('agreed', 'in_review', 'closed', 'superseded') then
    raise exception
      'The goals on an agreed plan cannot be changed. Record a review instead, or write a new plan.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists iep_goals_guard_frozen_trigger on public.iep_goals;
create trigger iep_goals_guard_frozen_trigger
  before insert or update or delete on public.iep_goals
  for each row execute function public.iep_goals_guard_frozen();


-- ---------------------------------------------------------------------------
-- 10. Policies
-- ---------------------------------------------------------------------------
alter table public.iep_plans              enable row level security;
alter table public.iep_plan_participants  enable row level security;
alter table public.iep_goals              enable row level security;
alter table public.iep_goal_reviews       enable row level security;
alter table public.iep_support_sessions   enable row level security;
alter table public.iep_plan_confirmations enable row level security;

-- A DRAFT IS NOT SHOWN TO THE FAMILY. This is the one place the read rule is
-- not simply `can_view_student`: a plan being drafted contains a school's
-- half-formed wording about a child, and a parent seeing it before the meeting
-- is how a meeting starts badly. `status` is a column on the row being tested,
-- so this asks a question the row is about and needs no lookup.
drop policy if exists iep_plans_select on public.iep_plans;
create policy iep_plans_select
  on public.iep_plans for select to authenticated
  using (
    public.can_staff_view_student(student_id)
    or (status <> 'draft' and public.can_view_student(student_id))
  );

drop policy if exists iep_plans_write_staff on public.iep_plans;
create policy iep_plans_write_staff
  on public.iep_plans for all to authenticated
  using (public.can_staff_view_student(student_id))
  with check (public.can_staff_view_student(student_id));

-- The child tables inherit the plan's answer. Written as `exists` against
-- `iep_plans` the same way `goal_milestones` reads `goals` in db/008: safe
-- because nothing in the plan's own policy reads back down here, so there is no
-- recursion to fall into.
drop policy if exists iep_plan_participants_select on public.iep_plan_participants;
create policy iep_plan_participants_select
  on public.iep_plan_participants for select to authenticated
  using (exists (select 1 from public.iep_plans p where p.id = plan_id));

drop policy if exists iep_plan_participants_write_staff on public.iep_plan_participants;
create policy iep_plan_participants_write_staff
  on public.iep_plan_participants for all to authenticated
  using (exists (
    select 1 from public.iep_plans p
    where p.id = plan_id and public.can_staff_view_student(p.student_id)))
  with check (exists (
    select 1 from public.iep_plans p
    where p.id = plan_id and public.can_staff_view_student(p.student_id)));

drop policy if exists iep_goals_select on public.iep_goals;
create policy iep_goals_select
  on public.iep_goals for select to authenticated
  using (exists (select 1 from public.iep_plans p where p.id = plan_id));

drop policy if exists iep_goals_write_staff on public.iep_goals;
create policy iep_goals_write_staff
  on public.iep_goals for all to authenticated
  using (exists (
    select 1 from public.iep_plans p
    where p.id = plan_id and public.can_staff_view_student(p.student_id)))
  with check (exists (
    select 1 from public.iep_plans p
    where p.id = plan_id and public.can_staff_view_student(p.student_id)));

drop policy if exists iep_goal_reviews_select on public.iep_goal_reviews;
create policy iep_goal_reviews_select
  on public.iep_goal_reviews for select to authenticated
  using (exists (select 1 from public.iep_goals g where g.id = iep_goal_id));

drop policy if exists iep_goal_reviews_write_staff on public.iep_goal_reviews;
create policy iep_goal_reviews_write_staff
  on public.iep_goal_reviews for all to authenticated
  using (exists (
    select 1 from public.iep_goals g
    join public.iep_plans p on p.id = g.plan_id
    where g.id = iep_goal_id and public.can_staff_view_student(p.student_id)))
  with check (exists (
    select 1 from public.iep_goals g
    join public.iep_plans p on p.id = g.plan_id
    where g.id = iep_goal_id and public.can_staff_view_student(p.student_id)));

-- STAFF ONLY, AND NOT BECAUSE IT IS SECRET. A parent reading their child's plan
-- does not need the roster of which teaching assistant covers Tuesday; that is
-- other people's working hours, and it is the school's staffing to manage.
drop policy if exists iep_support_sessions_staff on public.iep_support_sessions;
create policy iep_support_sessions_staff
  on public.iep_support_sessions for all to authenticated
  using (exists (
    select 1 from public.iep_plans p
    where p.id = plan_id and public.can_staff_view_student(p.student_id)))
  with check (exists (
    select 1 from public.iep_plans p
    where p.id = plan_id and public.can_staff_view_student(p.student_id)));

drop policy if exists iep_plan_confirmations_select on public.iep_plan_confirmations;
create policy iep_plan_confirmations_select
  on public.iep_plan_confirmations for select to authenticated
  using (exists (select 1 from public.iep_plans p where p.id = plan_id));

-- YOU CONFIRM FOR YOURSELF. `profile_id = auth.uid()` is the whole rule: a
-- school admin cannot tick the box on a parent's behalf, which is the only
-- thing that makes the record mean anything at all.
drop policy if exists iep_plan_confirmations_insert_self on public.iep_plan_confirmations;
create policy iep_plan_confirmations_insert_self
  on public.iep_plan_confirmations for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.iep_plans p
      where p.id = plan_id
        and p.status <> 'draft'
        and public.can_view_student(p.student_id)
    )
  );

grant select on public.iep_support_totals to authenticated;
