-- ===========================================================================
-- MiZanova — 009_messaging.sql
-- Secure text messaging between a family and their child's care team (FR26).
--
-- Design reference: docs/Figma Pages Design/Parent Messages.png
--
-- TEXT ONLY in v1 — a locked scope decision. The design shows image
-- attachments and an online indicator; neither is built. Attachments need
-- storage with its own access rules, and presence needs realtime. Shipping
-- either half-done in a channel families use to raise concerns would be worse
-- than not shipping it.
--
-- Run 001-008 first. SAFE TO RUN TWICE.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
-- Every conversation is ABOUT a student. There is no general staff-to-parent
-- chat: the child is the reason these two people are talking, and tying the
-- thread to them means access can be revoked when the relationship ends.
create table if not exists public.message_threads (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  subject       text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- Denormalised so the conversation list can sort without touching messages.
  last_message_at timestamptz not null default now()
);

create index if not exists message_threads_student_idx
  on public.message_threads (student_id, last_message_at desc);

create table if not exists public.thread_participants (
  thread_id    uuid not null references public.message_threads(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  -- Drives the unread badge. Updated when someone opens the thread.
  last_read_at timestamptz,
  joined_at    timestamptz not null default now(),
  primary key (thread_id, profile_id)
);

create index if not exists thread_participants_profile_idx
  on public.thread_participants (profile_id);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.message_threads(id) on delete cascade,
  sender_id   uuid references public.profiles(id) on delete set null,
  body        text not null check (btrim(body) <> ''),
  created_at  timestamptz not null default now()
);

create index if not exists messages_thread_idx
  on public.messages (thread_id, created_at);


-- ---------------------------------------------------------------------------
-- 2. Am I in this thread?
-- ---------------------------------------------------------------------------
-- Security definer for the same reason as the helpers in 003: a policy on
-- thread_participants that itself selects from thread_participants re-enters
-- the policy and Postgres reports infinite recursion.
create or replace function public.is_thread_participant(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.thread_participants tp
    where tp.thread_id = p_thread_id
      and tp.profile_id = auth.uid()
  );
$$;

revoke all on function public.is_thread_participant(uuid) from public, anon;
grant execute on function public.is_thread_participant(uuid)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. Starting a conversation
-- ---------------------------------------------------------------------------
-- Done through a function rather than an insert policy, because creating a
-- thread means adding a SECOND person to it, and a row-level policy cannot
-- express "you may add this particular other person". Doing it here lets both
-- sides be checked once, in one place.
--
-- Returns an existing thread if these two already have one about this student,
-- so a parent tapping a teacher's name twice does not fragment the history.
create or replace function public.start_message_thread(
  p_student_id uuid,
  p_other_profile_id uuid,
  p_subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  existing uuid;
  new_id   uuid;
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  if me = p_other_profile_id then
    raise exception 'You cannot start a conversation with yourself.';
  end if;

  -- Both people must be connected to this child. Being staff somewhere, or a
  -- parent of some other child, is not enough.
  if not public.can_view_student(p_student_id) then
    raise exception 'You do not have access to this student.';
  end if;

  if not exists (
    select 1 from public.student_guardians
    where student_id = p_student_id and profile_id = p_other_profile_id
    union all
    select 1 from public.student_educators
    where student_id = p_student_id and profile_id = p_other_profile_id
  ) then
    raise exception 'That person is not connected to this student.';
  end if;

  select t.id into existing
  from public.message_threads t
  where t.student_id = p_student_id
    and exists (select 1 from public.thread_participants p
                where p.thread_id = t.id and p.profile_id = me)
    and exists (select 1 from public.thread_participants p
                where p.thread_id = t.id and p.profile_id = p_other_profile_id)
    and (select count(*) from public.thread_participants p
         where p.thread_id = t.id) = 2
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into public.message_threads (student_id, subject, created_by)
  values (p_student_id, nullif(btrim(coalesce(p_subject, '')), ''), me)
  returning id into new_id;

  insert into public.thread_participants (thread_id, profile_id)
  values (new_id, me), (new_id, p_other_profile_id);

  return new_id;
end;
$$;

revoke all on function public.start_message_thread(uuid, uuid, text) from public, anon;
grant execute on function public.start_message_thread(uuid, uuid, text)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. Keep the thread list sorted
-- ---------------------------------------------------------------------------
create or replace function public.touch_thread_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message_threads
  set last_message_at = new.created_at
  where id = new.thread_id;
  return null;
end;
$$;

drop trigger if exists messages_touch_thread on public.messages;
create trigger messages_touch_thread
  after insert on public.messages
  for each row execute function public.touch_thread_on_message();


-- ---------------------------------------------------------------------------
-- 5. Policies
-- ---------------------------------------------------------------------------
alter table public.message_threads     enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages            enable row level security;

drop policy if exists message_threads_select on public.message_threads;
create policy message_threads_select
  on public.message_threads for select to authenticated
  using (public.is_thread_participant(id));

drop policy if exists thread_participants_select on public.thread_participants;
create policy thread_participants_select
  on public.thread_participants for select to authenticated
  using (public.is_thread_participant(thread_id));

-- You may update only your own row, and in practice only last_read_at.
drop policy if exists thread_participants_update_own on public.thread_participants;
create policy thread_participants_update_own
  on public.thread_participants for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists messages_select on public.messages;
create policy messages_select
  on public.messages for select to authenticated
  using (public.is_thread_participant(thread_id));

-- Send only into threads you are in, and only as yourself.
drop policy if exists messages_insert on public.messages;
create policy messages_insert
  on public.messages for insert to authenticated
  with check (
    public.is_thread_participant(thread_id)
    and sender_id = auth.uid()
  );

-- No update and no delete on messages. A message a family relied on cannot be
-- quietly edited or removed afterwards; corrections are new messages. This
-- matters most in exactly the conversations where it would be most tempting.


-- ---------------------------------------------------------------------------
-- 6. Seeing who you can talk to
-- ---------------------------------------------------------------------------
-- Until now a parent could read only their own profile row, so they could not
-- see their child's teachers by name — and staff could not see guardians at
-- all. Messaging needs both, narrowly.
--
-- Note how tight these are. Not "parents may see staff": a guardian may see
-- staff ASSIGNED TO THEIR OWN CHILD. Not "staff may see parents", which was
-- deliberately excluded in 004: staff may see the guardians OF STUDENTS THEY
-- ARE ASSIGNED TO. Each is the smallest disclosure that makes the feature work.
drop policy if exists profiles_select_my_childs_staff on public.profiles;
create policy profiles_select_my_childs_staff
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.student_educators se
      join public.student_guardians sg on sg.student_id = se.student_id
      where se.profile_id = profiles.id
        and sg.profile_id = auth.uid()
    )
  );

drop policy if exists profiles_select_my_students_guardians on public.profiles;
create policy profiles_select_my_students_guardians
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.student_guardians sg
      join public.student_educators se on se.student_id = sg.student_id
      where sg.profile_id = profiles.id
        and se.profile_id = auth.uid()
    )
  );

revoke all on public.message_threads     from anon;
revoke all on public.thread_participants from anon;
revoke all on public.messages            from anon;


-- ---------------------------------------------------------------------------
-- Done. db/verify.sql: three new tables; policies becomes 47 (7 added here).
-- ---------------------------------------------------------------------------
