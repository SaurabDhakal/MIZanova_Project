-- ===========================================================================
-- 023_access_log.sql — record who OPENED a child's record
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHY
-- ---------------------------------------------------------------------------
-- `admin_audit_events` records who CHANGED something — verified a teacher,
-- reset two-factor, cleared a flag. Nothing records who LOOKED.
--
-- "Which staff members have opened my son's file?" is the first question asked
-- after a complaint, a suspicion, or a data incident, and today it is
-- unanswerable. It is also the one gap that cannot be closed retroactively:
-- the answer only exists from the moment recording starts.
--
-- WHAT THIS CAN AND CANNOT PROMISE
-- ---------------------------------------------------------------------------
-- Postgres has no trigger on SELECT. There is no way to make a read log itself
-- at the database level, so the log is written by the one function every
-- student-record view passes through — `fetchStudent` in src/lib/api.ts.
--
-- That means it is honest about a limit: a future code path that reads
-- `students` directly would not be recorded. The mitigation is that there is
-- exactly one such function today and it is the choke point for the screen
-- that matters. Anyone adding a second one should add the call, and this
-- comment exists so they know why.
--
-- What the log DOES guarantee, because the database enforces it and not the
-- application: the actor is whoever is signed in, the time is the server's,
-- and no row can ever be altered or removed.

begin;

create table if not exists public.student_access_events (
  id          uuid primary key default gen_random_uuid(),

  -- Taken from auth.uid() inside the function, never from an argument. A
  -- caller cannot claim to be somebody else.
  actor_id    uuid not null references public.profiles(id) on delete set null,
  student_id  uuid not null references public.students(id) on delete cascade,

  -- Where in the product, so "opened the profile" can be told apart from
  -- "appeared in a list".
  context     text not null default 'student_record',

  occurred_at timestamptz not null default now()
);

create index if not exists student_access_events_student_idx
  on public.student_access_events (student_id, occurred_at desc);

create index if not exists student_access_events_actor_idx
  on public.student_access_events (actor_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------
-- Deduplicated inside the database, not in the browser. Opening a student page
-- fires several queries and React refetches on focus, so logging every read
-- would bury the useful signal — "who opened this child's file, roughly when"
-- — under hundreds of duplicates. Five minutes is coarse enough to keep the
-- volume sane and fine enough to answer the question.
--
-- Doing it here rather than in the client matters: a throttle in the browser
-- is a throttle an attacker can remove.
create or replace function public.log_student_access(
  p_student_id uuid,
  p_context    text default 'student_record'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return;  -- Nobody is signed in; RLS will have refused the read anyway.
  end if;

  if exists (
    select 1
    from public.student_access_events e
    where e.actor_id = v_actor
      and e.student_id = p_student_id
      and e.context = p_context
      and e.occurred_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.student_access_events (actor_id, student_id, context)
  values (v_actor, p_student_id, p_context);
end;
$$;

revoke all on function public.log_student_access(uuid, text) from public, anon;
grant execute on function public.log_student_access(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
alter table public.student_access_events enable row level security;

-- A school administrator can see who in their school opened which record. A
-- platform admin can see everything. Nobody else, including the staff member
-- whose reads are recorded — an audit trail its subject can inspect for gaps
-- is a map of where to hide.
drop policy if exists student_access_events_select on public.student_access_events;
create policy student_access_events_select
  on public.student_access_events for select to authenticated
  using (
    public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
  );

-- No insert, update or delete policy at all. Rows arrive only through the
-- function above. An access log that its subjects can write to proves nothing,
-- and one they can edit is worse than having none.
revoke all on public.student_access_events from anon;

commit;

-- ---------------------------------------------------------------------------
-- KNOWN CONSEQUENCE — this table grows and nothing prunes it.
--
-- One row per staff member per child per five minutes. That is small for a
-- school and not small forever, and §2.3 of the architecture review already
-- says this system has no retention policy for anything. This table makes that
-- gap concrete rather than theoretical: an access log kept indefinitely is
-- itself personal information about staff, held longer than it is needed.
--
-- Decide a retention period before this goes anywhere real.
-- ---------------------------------------------------------------------------
