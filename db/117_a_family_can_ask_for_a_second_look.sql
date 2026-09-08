-- ---------------------------------------------------------------------------
-- 117 — A family can ask for a second look
-- ---------------------------------------------------------------------------
-- FR24, the half of it that is unambiguously a parent's: "request specialist
-- progress reviews". The requirement also says parents should create SMART
-- goals and assign milestones, and that half is deliberately not here — see
-- the note at the bottom.
--
-- Today a family reads a goal, watches it sit at 0% for a term, and has one
-- route: write a message and hope it reaches somebody who can act. Messages
-- are a conversation, not a queue. Nothing on a specialist's screen says "this
-- family has asked you to look at this goal", so the asking depends entirely
-- on whoever happens to read the thread.
--
-- ---------------------------------------------------------------------------
-- ONE OPEN REQUEST PER GOAL, ENFORCED BY AN INDEX
-- ---------------------------------------------------------------------------
-- A parent worried about a goal will press the button again. Without this
-- there would be nine identical rows in a specialist's queue from one anxious
-- evening, and the specialist would learn to skim the queue — which is exactly
-- how a real request gets missed.
--
-- Partial, on `status = 'open'`: once answered, the family may ask again, and
-- the history of both stays.
--
-- ---------------------------------------------------------------------------
-- THE ANSWER IS WRITTEN FOR THE FAMILY, AND THAT IS WHY IT IS A COLUMN
-- ---------------------------------------------------------------------------
-- `specialist_session_notes` exists for what a specialist writes for
-- themselves and db/028 is explicit that families never see it. This is the
-- opposite: a reply addressed to the person who asked. Keeping them in
-- separate places is the whole reason a clinician can write honestly in one of
-- them.
-- ---------------------------------------------------------------------------

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'goal_review_status') then
    create type public.goal_review_status as enum ('open', 'answered', 'declined');
  end if;
end
$$;

create table if not exists public.goal_review_requests (
  id           uuid primary key default gen_random_uuid(),

  goal_id      uuid not null references public.goals(id) on delete cascade,
  -- Denormalised from the goal so a policy can ask "may this person see this
  -- child?" without a join, the same reason db/006 carries it.
  student_id   uuid not null references public.students(id) on delete cascade,

  -- The guardian who asked. Kept if the account goes, so a specialist's queue
  -- does not lose the question it is holding.
  requested_by uuid references public.profiles(id) on delete set null,
  -- Why they are asking, in their words. Optional: "please look at this" is a
  -- complete request and demanding a paragraph would filter out the families
  -- least able to write one.
  note         text check (note is null or length(note) <= 2000),

  status       public.goal_review_status not null default 'open',

  answered_by  uuid references public.profiles(id) on delete set null,
  answered_at  timestamptz,
  -- Written TO the family. Not clinical notes — see the header.
  response     text check (response is null or length(response) <= 4000),

  created_at   timestamptz not null default now(),

  constraint goal_review_answered_has_a_time
    check ((status = 'open') = (answered_at is null))
);

create index if not exists goal_review_requests_student_idx
  on public.goal_review_requests (student_id, created_at desc);

-- See the header. One open question per goal.
create unique index if not exists goal_review_requests_one_open
  on public.goal_review_requests (goal_id)
  where status = 'open';


alter table public.goal_review_requests enable row level security;

-- A family asks about their own child's goal, and may only ever create it
-- open. `status = 'open'` in the check stops a parent writing themselves an
-- answered request with a response they composed.
drop policy if exists goal_review_requests_ask on public.goal_review_requests;
create policy goal_review_requests_ask
  on public.goal_review_requests for insert to authenticated
  with check (
    status = 'open'
    and requested_by = auth.uid()
    and public.is_guardian_of(student_id)
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.student_id = goal_review_requests.student_id
    )
  );

-- Both guardians read it. One parent asking and the other not knowing it had
-- been asked is how a family ends up asking twice.
drop policy if exists goal_review_requests_select_guardian on public.goal_review_requests;
create policy goal_review_requests_select_guardian
  on public.goal_review_requests for select to authenticated
  using (public.is_guardian_of(student_id));

-- Staff who can already see the child. A class teacher seeing that a family
-- has asked for a review is the point: it is the same question they would
-- otherwise be asked in the playground.
drop policy if exists goal_review_requests_select_staff on public.goal_review_requests;
create policy goal_review_requests_select_staff
  on public.goal_review_requests for select to authenticated
  using (
    public.is_platform_admin()
    or public.can_staff_view_student(student_id)
  );

-- Only a specialist assigned to the child answers. Not a teacher: the
-- requirement says "specialist progress review", and an answer from somebody
-- without that standing would be worth less than no answer while looking like
-- one.
drop policy if exists goal_review_requests_answer on public.goal_review_requests;
create policy goal_review_requests_answer
  on public.goal_review_requests for update to authenticated
  using (
    public.my_role() = 'specialist'
    and public.am_i_verified()
    and public.is_assigned_staff_for(student_id)
  )
  with check (
    status in ('answered', 'declined')
    and answered_by = auth.uid()
  );

-- No delete policy. A question that was asked and withdrawn is a different
-- fact from one that was never asked, and the second is what a deleted row
-- looks like — db/059 says the same about a cancelled appointment.
revoke all on public.goal_review_requests from anon;

commit;

-- ---------------------------------------------------------------------------
-- WHAT FR24 ASKS FOR THAT IS NOT HERE, AND WHY
-- ---------------------------------------------------------------------------
-- "Parents ... should be able to create SMART goals, assign milestones".
--
-- A goal in this product is the school's plan for a child, agreed at a meeting
-- and frozen into an IEP by db/057. A parent adding one to that plan, that no
-- teacher agreed to and no specialist wrote, would make the plan a place where
-- two parties post rather than a document anybody signed. It would also give a
-- family a progress bar they control, on the screen they use to judge how
-- their child is doing.
--
-- The family's own goals already exist in a form that fits: db/101 gives an
-- individual goals in their own words with check-ins and no percentage. If
-- Special Miles wants that for parents too, that is the shape to copy — beside
-- the school's plan, not inside it. It is Joe's call and it is written down
-- here rather than decided quietly.
--
-- ---------------------------------------------------------------------------
-- Check it. As a guardian:
--
--   insert into public.goal_review_requests (goal_id, student_id, requested_by, note)
--   values ('<their child''s goal>', '<their child>', auth.uid(), 'Stuck since term 3');
--   -- once. A second while the first is open must fail on the unique index.
--
--   ...the same with status 'answered'          -- refused
--   ...for another family's child               -- refused
--   update ... set status = 'answered'          -- refused: they cannot answer
--
-- As the assigned specialist: the row is visible, and setting status to
-- 'answered' with answered_by = auth.uid() succeeds.
--
-- db/verify.sql: tables gains goal_review_requests; policies increases by four.
-- ---------------------------------------------------------------------------
