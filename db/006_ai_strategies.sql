-- ===========================================================================
-- MiZanova — 006_ai_strategies.sql
-- AI-suggested classroom strategies, the human review gate, and the controls
-- a Platform Admin can actually exercise.
--
-- Design reference: docs/Figma Pages Design/Privacy-First Strategy Coach.png
--
-- Run 001-005 first. SAFE TO RUN TWICE.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. ai_controls — the kill switch, as one row
-- ---------------------------------------------------------------------------
-- A locked scope decision was "simplified but real": a Platform Admin should
-- be able to actually turn the AI off, not look at a toggle that does nothing.
-- The server checks this table before every generation.
--
-- Single row, enforced by a fixed primary key.
create table if not exists public.ai_controls (
  id                    boolean primary key default true check (id),

  -- The kill switch. False = no generation happens at all.
  ai_enabled            boolean not null default true,

  -- Suggestions scoring below this go to a specialist instead of a teacher.
  -- Tunable because the right threshold is a judgement, not a constant.
  confidence_threshold  numeric(3,2) not null default 0.70
                          check (confidence_threshold between 0 and 1),

  -- Every change must say why. This is what makes the audit meaningful.
  last_change_reason    text,
  changed_by            uuid references public.profiles(id) on delete set null,
  updated_at            timestamptz not null default now()
);

insert into public.ai_controls (id) values (true) on conflict (id) do nothing;

drop trigger if exists ai_controls_set_updated_at on public.ai_controls;
create trigger ai_controls_set_updated_at
  before update on public.ai_controls
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 2. Strategy status
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'strategy_status') then
    create type public.strategy_status as enum (
      'published',       -- confident enough to show a teacher immediately
      'pending_review',  -- held back; a specialist must look first
      'approved',        -- a specialist released it
      'rejected'         -- a specialist judged it unsuitable
    );
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3. ai_strategies
-- ---------------------------------------------------------------------------
create table if not exists public.ai_strategies (
  id            uuid primary key default gen_random_uuid(),

  behaviour_log_id uuid not null
                     references public.behaviour_logs(id) on delete cascade,
  -- Denormalised from the log so policies can ask "may this person see this
  -- student?" without a join inside every policy evaluation.
  student_id    uuid not null references public.students(id) on delete cascade,

  title         text not null,
  body          text not null,
  -- The "Why this works" bullets from the design.
  rationale     text[] not null default '{}',

  confidence    numeric(3,2) not null check (confidence between 0 and 1),
  status        public.strategy_status not null default 'pending_review',

  -- Why it was held back, in words a specialist can act on.
  routing_reason text,

  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,

  -- =====================================================================
  -- THE AUDIT TRAIL THAT MAKES THE PRIVACY CLAIM CHECKABLE
  -- =====================================================================
  -- The design tells teachers "this AI does not access student PII". That is
  -- a promise, and a promise you cannot inspect is worth nothing. This column
  -- stores the EXACT anonymised text that was sent.
  --
  -- If anyone ever asks what left the country, the answer is a query, not a
  -- reassurance. It also means a leak is discoverable after the fact rather
  -- than invisible.
  anonymised_input text not null,
  -- How many identifiers the anonymiser removed before sending.
  redaction_count  integer not null default 0,

  model         text,
  prompt_version text not null default 'v1',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists ai_strategies_set_updated_at on public.ai_strategies;
create trigger ai_strategies_set_updated_at
  before update on public.ai_strategies
  for each row execute function public.set_updated_at();

create index if not exists ai_strategies_log_idx
  on public.ai_strategies (behaviour_log_id);
create index if not exists ai_strategies_student_idx
  on public.ai_strategies (student_id);
-- The specialist review queue: partial, so it stays small and fast.
create index if not exists ai_strategies_pending_idx
  on public.ai_strategies (created_at)
  where status = 'pending_review';


-- ---------------------------------------------------------------------------
-- 4. strategy_feedback — the three buttons under a suggestion
-- ---------------------------------------------------------------------------
-- "Strategy Applied", "Flag this response", "Show Different Strategy".
--
-- This is not analytics. Flags are the escalation path the design promises,
-- and applied/dismissed counts are the honest replacement for the invented
-- "94.2% prediction accuracy" on the Figma super-admin screen: real teachers
-- reporting whether real advice helped.
create table if not exists public.strategy_feedback (
  id          uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.ai_strategies(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,

  action      text not null
                check (action in ('applied', 'flagged', 'dismissed', 'helpful', 'not_helpful')),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists strategy_feedback_strategy_idx
  on public.strategy_feedback (strategy_id);


-- ---------------------------------------------------------------------------
-- 5. Policies
-- ---------------------------------------------------------------------------
alter table public.ai_controls      enable row level security;
alter table public.ai_strategies    enable row level security;
alter table public.strategy_feedback enable row level security;

-- Everyone signed in may READ the controls: the app needs to know whether to
-- show "AI suggestions are currently switched off".
drop policy if exists ai_controls_select on public.ai_controls;
create policy ai_controls_select
  on public.ai_controls for select to authenticated
  using (true);

-- Only Special Miles staff may change them.
drop policy if exists ai_controls_update on public.ai_controls;
create policy ai_controls_update
  on public.ai_controls for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Teachers see suggestions for their students, but ONLY ones that cleared the
-- gate. A pending_review suggestion is invisible to them by construction —
-- that is the entire point of routing, and it is enforced here rather than by
-- a filter in a query someone might forget to write.
drop policy if exists ai_strategies_select_staff on public.ai_strategies;
create policy ai_strategies_select_staff
  on public.ai_strategies for select to authenticated
  using (
    public.can_staff_view_student(student_id)
    and status in ('published', 'approved')
  );

-- Specialists, school admins and platform admins see everything, including
-- what is waiting for review and what was rejected.
drop policy if exists ai_strategies_select_reviewer on public.ai_strategies;
create policy ai_strategies_select_reviewer
  on public.ai_strategies for select to authenticated
  using (
    public.is_platform_admin()
    or (
      public.my_role() in ('specialist', 'school_admin')
      and public.can_staff_view_student(student_id)
    )
  );

-- Only a specialist or platform admin may release or reject a held suggestion.
drop policy if exists ai_strategies_review on public.ai_strategies;
create policy ai_strategies_review
  on public.ai_strategies for update to authenticated
  using (
    public.is_platform_admin()
    or (
      public.my_role() = 'specialist'
      and public.can_staff_view_student(student_id)
    )
  )
  with check (
    public.is_platform_admin()
    or (
      public.my_role() = 'specialist'
      and public.can_staff_view_student(student_id)
    )
  );

-- No INSERT policy on ai_strategies. Suggestions are written only by our
-- server, which uses the service key and bypasses RLS. A browser cannot invent
-- a strategy and present it as the model's.

-- Feedback: staff may record their own, on strategies they can see.
drop policy if exists strategy_feedback_select on public.strategy_feedback;
create policy strategy_feedback_select
  on public.strategy_feedback for select to authenticated
  using (
    exists (
      select 1 from public.ai_strategies s
      where s.id = strategy_id
        and public.can_staff_view_student(s.student_id)
    )
  );

drop policy if exists strategy_feedback_insert on public.strategy_feedback;
create policy strategy_feedback_insert
  on public.strategy_feedback for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.ai_strategies s
      where s.id = strategy_id
        and public.can_staff_view_student(s.student_id)
    )
  );

revoke all on public.ai_controls       from anon;
revoke all on public.ai_strategies     from anon;
revoke all on public.strategy_feedback from anon;


-- ---------------------------------------------------------------------------
-- Done. db/verify.sql: tables should now include ai_controls, ai_strategies
-- and strategy_feedback; policies should be 28.
-- ---------------------------------------------------------------------------
