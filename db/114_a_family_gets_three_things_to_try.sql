-- ---------------------------------------------------------------------------
-- 114 — A family gets three things to try
-- ---------------------------------------------------------------------------
-- FR9 and P06. A parent logs what happened at home and receives up to three
-- evidence-based support strategies, anonymised before sending, safety-checked
-- on the way back, with low-confidence output routed to a specialist and
-- high-risk terms handled rather than answered.
--
-- Today the parent side of that is silent. `home_observations` has existed
-- since db/007 and does exactly one thing: it shows the school what happened
-- last night. The family writes, and nothing comes back. db/113 fixed the
-- other direction — advice a TEACHER'S incident produced now reaches home —
-- but a parent describing a meltdown at bath time still gets no answer at all.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS NOT individual_ai_requests, AND NOT ai_strategies EITHER
-- ---------------------------------------------------------------------------
-- Both exist and neither fits, for the same reason from opposite ends.
--
-- `ai_strategies` hangs off `behaviour_log_id not null` and every policy on it
-- is written around a teacher's incident. Making that column nullable to hang
-- a second kind of thing from it would weaken three live policies protecting
-- 121 rows, to save writing two tables. db/103 faced this exactly — an
-- individual could not use `specialist_appointments` because `student_id` is
-- not null — and made a separate table rather than loosen a constraint that
-- was carrying weight. Same answer here.
--
-- `individual_ai_requests` is the closer shape and is missing the one thing
-- FR9 names. Its own header says why it has no review state: "a
-- `pending_review` row here waits on a specialist who does not exist." That is
-- true of somebody with no school. It is FALSE of a parent — their child has
-- assigned staff and often a specialist, and FR9 asks for exactly the routing
-- that becomes possible because of it. The parent case is the one where a
-- held suggestion has somebody to wait for.
--
-- So: db/094's request/suggestion split, which records what was actually sent
-- and what was withheld, plus db/006's review lifecycle, which gives a held
-- suggestion somewhere to go.
--
-- ---------------------------------------------------------------------------
-- THE DAILY CAP COSTS NOTHING TO WIRE AND EVERYTHING TO RETROFIT
-- ---------------------------------------------------------------------------
-- `ai_generation_events` counts by `requested_by` over a rolling 24 hours and
-- has no foreign key to behaviour logs, so the per-user limit from db/026 and
-- the free/paid split from db/099 both apply to a parent the moment the server
-- writes an event. `my_ai_tier()` asks about the CALLER, not their role, so a
-- parent answers 'free' today and will answer 'paid' the day a family
-- subscription exists — db/111's sentence, unchanged: the function gains a
-- branch and nothing else moves.
--
-- The AI is the only part of this product with a real marginal cost. A
-- capability that families use before it is capped is a conversation about
-- taking something away; a cap present from the first request is a number.
--
-- `school_id` on the event is deliberately NULL. A parent's private
-- observation is not the school's spend, and letting it draw on the school's
-- daily budget would let a family outside the building exhaust a classroom's
-- quota.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
-- A risk-flagged observation does NOT open a safeguarding record. db/010's
-- queue is a record about a child, opened by staff, and a parent's worry
-- becoming one automatically is a decision about a family's file that belongs
-- to Joe rather than to a default. The flag is stored, the support message
-- reaches the parent the way it does for an individual, and the observation
-- was already visible to assigned staff the moment it was written — so nothing
-- is hidden by declining to escalate it here.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. The spend record learns about the second kind of request
-- ---------------------------------------------------------------------------
-- Without this the event would carry a null `behaviour_log_id` and no way to
-- say what it was for. The column is a bare uuid like its neighbour, and for
-- the same reason: usage records outlive the things they describe.
-- ---------------------------------------------------------------------------
alter table public.ai_generation_events
  add column if not exists home_observation_id uuid;

comment on column public.ai_generation_events.home_observation_id is
  'Set when the generation was for a parent''s home observation (db/114) '
  'rather than a teacher''s behaviour log. Exactly one of the two is set.';


-- ---------------------------------------------------------------------------
-- 2. What was asked, and what was held back
-- ---------------------------------------------------------------------------
create table if not exists public.home_ai_requests (
  id             uuid primary key default gen_random_uuid(),

  observation_id uuid not null
                   references public.home_observations(id) on delete cascade,
  -- Denormalised from the observation so policies can ask "may this person see
  -- this child?" without a join inside every policy evaluation — the same
  -- reason db/006 carries it on ai_strategies.
  student_id     uuid not null references public.students(id) on delete cascade,
  -- The parent who asked. Kept if their account goes, so the school's picture
  -- of what was tried does not develop holes — db/007's reasoning for
  -- `logged_by`, applied to the same family's writing.
  asked_by       uuid references public.profiles(id) on delete set null,

  -- The ANONYMISED text, exactly as it was sent. Stored for the reason
  -- ai_strategies.anonymised_input is: a privacy claim you cannot inspect is
  -- worth nothing.
  asked            text    not null,
  redaction_count  integer not null default 0 check (redaction_count >= 0),

  -- The model judged this describes something a family should not be left
  -- alone with. Kept so the support message still appears when they come back.
  risk_flagged     boolean not null default false,

  -- How many suggestions did not come back with this answer, and why in plain
  -- words. A count with no explanation reads as the product losing something —
  -- and here it has not lost them: unlike db/094, they are waiting for the
  -- specialist rather than gone, and the screen has to be able to say so.
  withheld_count   integer not null default 0 check (withheld_count >= 0),
  withheld_reason  text,

  model            text,
  prompt_version   text not null default 'v1',
  created_at       timestamptz not null default now()
);

create index if not exists home_ai_requests_observation_idx
  on public.home_ai_requests (observation_id);
create index if not exists home_ai_requests_student_idx
  on public.home_ai_requests (student_id, created_at desc);


-- ---------------------------------------------------------------------------
-- 3. What came back
-- ---------------------------------------------------------------------------
-- Unlike db/094, a suggestion below the bar is not discarded. It is written
-- with status 'pending_review' and waits for the specialist the child already
-- has. That is the whole difference between a family and somebody with no
-- school, and it is FR9's own requirement.
-- ---------------------------------------------------------------------------
create table if not exists public.home_ai_strategies (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null
                   references public.home_ai_requests(id) on delete cascade,

  title          text not null,
  body           text not null,
  rationale      text[] not null default '{}',
  confidence     numeric(3,2) not null check (confidence between 0 and 1),

  -- db/006's enum, reused rather than a second one that will disagree with it.
  status         public.strategy_status not null default 'pending_review',
  -- Why it was held, in words a specialist can act on.
  routing_reason text,

  reviewed_by    uuid references public.profiles(id) on delete set null,
  reviewed_at    timestamptz,
  review_note    text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists home_ai_strategies_request_idx
  on public.home_ai_strategies (request_id);

drop trigger if exists home_ai_strategies_set_updated_at on public.home_ai_strategies;
create trigger home_ai_strategies_set_updated_at
  before update on public.home_ai_strategies
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 4. Who reads what
-- ---------------------------------------------------------------------------
alter table public.home_ai_requests   enable row level security;
alter table public.home_ai_strategies enable row level security;

-- The family that asked. `is_guardian_of` rather than `asked_by = auth.uid()`:
-- a child usually has two guardians, both already read each other's
-- observations, and splitting the answer from the question it belongs to would
-- be a strange place to start keeping them apart.
drop policy if exists home_ai_requests_select_guardian on public.home_ai_requests;
create policy home_ai_requests_select_guardian
  on public.home_ai_requests for select to authenticated
  using (public.is_guardian_of(student_id));

-- Staff who can already read the observation this belongs to. db/007 shares a
-- parent's observation with assigned staff the moment it is written, so what
-- the family was advised to try is not a new disclosure — and a teacher who
-- cannot see it is a teacher working against it.
drop policy if exists home_ai_requests_select_staff on public.home_ai_requests;
create policy home_ai_requests_select_staff
  on public.home_ai_requests for select to authenticated
  using (
    public.is_platform_admin()
    or public.can_staff_view_student(student_id)
  );

-- A family reads what was settled. Held and rejected are invisible to them for
-- db/006's reason: a suggestion is held precisely because it may be wrong, and
-- a parent reading it at 9pm cannot weigh it against anything.
drop policy if exists home_ai_strategies_select_guardian on public.home_ai_strategies;
create policy home_ai_strategies_select_guardian
  on public.home_ai_strategies for select to authenticated
  using (
    status in ('published', 'approved')
    and exists (
      select 1 from public.home_ai_requests r
      where r.id = home_ai_strategies.request_id
        and public.is_guardian_of(r.student_id)
    )
  );

-- Assigned staff see the settled ones too, so home and school are working from
-- the same advice — which is the entire point of the feature.
drop policy if exists home_ai_strategies_select_staff on public.home_ai_strategies;
create policy home_ai_strategies_select_staff
  on public.home_ai_strategies for select to authenticated
  using (
    status in ('published', 'approved')
    and exists (
      select 1 from public.home_ai_requests r
      where r.id = home_ai_strategies.request_id
        and public.can_staff_view_student(r.student_id)
    )
  );

-- Reviewers see everything, including what is waiting and what was refused.
-- Without this the review queue would be empty by construction.
drop policy if exists home_ai_strategies_select_reviewer on public.home_ai_strategies;
create policy home_ai_strategies_select_reviewer
  on public.home_ai_strategies for select to authenticated
  using (
    public.is_platform_admin()
    or (
      public.my_role() in ('specialist', 'school_admin')
      and exists (
        select 1 from public.home_ai_requests r
        where r.id = home_ai_strategies.request_id
          and public.can_staff_view_student(r.student_id)
      )
    )
  );

-- Only a specialist or platform admin releases or refuses one. Mirrors
-- ai_strategies_review exactly: a parent cannot publish their own held
-- suggestion, and neither can a teacher.
drop policy if exists home_ai_strategies_review on public.home_ai_strategies;
create policy home_ai_strategies_review
  on public.home_ai_strategies for update to authenticated
  using (
    public.is_platform_admin()
    or (
      public.my_role() = 'specialist'
      and exists (
        select 1 from public.home_ai_requests r
        where r.id = home_ai_strategies.request_id
          and public.can_staff_view_student(r.student_id)
      )
    )
  );

-- NO INSERT POLICY ON EITHER TABLE. The server writes both with the service
-- role after the model has answered, exactly as db/006 and db/094 do — a
-- browser that could insert here could put words in the model's mouth and then
-- read them back as advice the school had settled.
revoke all on public.home_ai_requests   from anon;
revoke all on public.home_ai_strategies from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
-- As the parent who asked, after a generation on one of their observations:
--
--   select count(*) from public.home_ai_strategies;   -- the settled ones only
--   select count(*) from public.home_ai_strategies
--    where status = 'pending_review';                 -- must be 0
--
-- As a specialist carrying that child:
--
--   select status, count(*) from public.home_ai_strategies group by status;
--   -- pending_review rows ARE visible here; that is the review queue.
--
-- As a guardian of a DIFFERENT child, every count above must be 0.
--
-- And the cap, which is the part with a cost attached:
--
--   select user_used, user_limit
--     from public.ai_quota_status(null, '<the parent id>');
--   -- user_used rises by one per generation, over a rolling 24 hours.
--
-- db/verify.sql: tables gains home_ai_requests and home_ai_strategies;
-- policies increases by six.
-- ---------------------------------------------------------------------------
