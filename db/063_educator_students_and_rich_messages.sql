-- ===========================================================================
-- 063 — Educator-created students and rich, auditable messages
-- ===========================================================================
-- Educators may create a student only when the same transaction assigns that
-- student to them. Messages may carry private attachments and may be unsent
-- by their author for fifteen minutes. "Unsend" is a soft deletion: the row
-- remains available for audit and retention, while participants see only the
-- tombstone and can no longer download its attachments.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. An educator creates and claims one student atomically
-- ---------------------------------------------------------------------------
create or replace function public.educator_create_student(
  p_first_name text,
  p_last_name text,
  p_year_level text default null,
  p_external_ref text default null,
  p_date_of_birth date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  school uuid := public.my_school_id();
  student uuid;
begin
  if me is null then
    raise exception 'You are not signed in.';
  end if;

  if public.my_role() <> 'educator' or not public.am_i_verified() then
    raise exception 'Only a verified educator can add a student.';
  end if;

  if school is null then
    raise exception 'Your educator account is not attached to a school.';
  end if;

  if not exists (
    select 1 from public.organisations o
    where o.id = school and o.status in ('active', 'trial')
  ) then
    raise exception 'Students cannot be added while this organisation is suspended or closed.';
  end if;

  if btrim(coalesce(p_first_name, '')) = ''
     or btrim(coalesce(p_last_name, '')) = '' then
    raise exception 'First name and last name are required.';
  end if;

  if length(btrim(p_first_name)) > 100
     or length(btrim(p_last_name)) > 100
     or length(btrim(coalesce(p_year_level, ''))) > 50
     or length(btrim(coalesce(p_external_ref, ''))) > 100 then
    raise exception 'One or more student details are too long.';
  end if;

  if p_date_of_birth is not null and p_date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future.';
  end if;

  insert into public.students (
    school_id, first_name, last_name, year_level, external_ref, date_of_birth
  ) values (
    school,
    btrim(p_first_name),
    btrim(p_last_name),
    nullif(btrim(coalesce(p_year_level, '')), ''),
    nullif(btrim(coalesce(p_external_ref, '')), ''),
    p_date_of_birth
  )
  returning id into student;

  insert into public.student_educators (student_id, profile_id, assignment)
  values (student, me, 'class_teacher');

  return student;
end;
$$;

revoke all on function public.educator_create_student(text, text, text, text, date)
  from public, anon;
grant execute on function public.educator_create_student(text, text, text, text, date)
  to authenticated, service_role;

-- An educator insert must go through the function above. A plain table insert
-- could create a child the educator cannot see and would leave unowned data.
drop policy if exists students_insert on public.students;
create policy students_insert
  on public.students for insert to authenticated
  with check (
    public.is_platform_admin()
    or (
      public.my_role() = 'school_admin'
      and school_id = public.my_school_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Message tombstones and attachment metadata
-- ---------------------------------------------------------------------------

-- A participant row is not permanent permission. Staff can change schools or
-- stop supporting a child while the conversation must remain in the student's
-- audit history. Requiring current student access here makes every existing
-- thread, message and attachment policy follow the active school context and
-- current assignment immediately. Guardians keep access through their current
-- student_guardians relationship.
create or replace function public.is_thread_participant(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.thread_participants tp
    join public.message_threads t on t.id = tp.thread_id
    where tp.thread_id = p_thread_id
      and tp.profile_id = auth.uid()
      and public.can_view_student(t.student_id)
  );
$$;

revoke all on function public.is_thread_participant(uuid) from public, anon;
grant execute on function public.is_thread_participant(uuid)
  to authenticated, service_role;

-- A stale participant may not even update their old read marker. It carries no
-- student content, but allowing a cross-tenant write after access ended would
-- make the permission model inconsistent and pollute the audit history.
drop policy if exists thread_participants_update_own on public.thread_participants;
create policy thread_participants_update_own
  on public.thread_participants for update to authenticated
  using (
    profile_id = auth.uid()
    and public.is_thread_participant(thread_id)
  )
  with check (
    profile_id = auth.uid()
    and public.is_thread_participant(thread_id)
  );

alter table public.messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

-- Attachment-only messages use an empty body. Direct browser inserts still
-- require text through their policy; only send_message_with_attachments may
-- create an empty-body message after validating attachment metadata.
alter table public.messages alter column body set default '';
alter table public.messages drop constraint if exists messages_body_check;

create table if not exists public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages(id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null check (btrim(file_name) <> ''),
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  kind         text not null check (kind in ('image', 'audio', 'file')),
  created_at   timestamptz not null default now()
);

create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);

alter table public.message_attachments enable row level security;

drop policy if exists message_attachments_select on public.message_attachments;
create policy message_attachments_select
  on public.message_attachments for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.deleted_at is null
        and public.is_thread_participant(m.thread_id)
    )
  );

-- Sending ordinary text directly is retained for older clients. Blank bodies
-- are reserved for the checked attachment RPC below.
drop policy if exists messages_insert on public.messages;
create policy messages_insert
  on public.messages for insert to authenticated
  with check (
    public.is_thread_participant(thread_id)
    and sender_id = auth.uid()
    and btrim(body) <> ''
  );

-- ---------------------------------------------------------------------------
-- 3. Private message storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  15728640,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Paths are <thread id>/<message id>/<randomised filename>. Upload happens
-- before the message metadata transaction, so insert permission is based on
-- current participation in the thread represented by segment one.
create or replace function public.can_upload_message_attachment(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  folders text[] := storage.foldername(p_name);
  thread uuid;
begin
  if coalesce(array_length(folders, 1), 0) <> 2
     or folders[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or folders[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  thread := folders[1]::uuid;
  return public.my_role() = 'educator'
     and public.am_i_verified()
     and public.is_thread_participant(thread);
end;
$$;

create or replace function public.can_read_message_attachment(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.message_attachments a
    join public.messages m on m.id = a.message_id
    where a.storage_path = p_name
      and m.deleted_at is null
      and public.is_thread_participant(m.thread_id)
  );
$$;

revoke all on function public.can_upload_message_attachment(text) from public, anon;
revoke all on function public.can_read_message_attachment(text) from public, anon;
grant execute on function public.can_upload_message_attachment(text) to authenticated, service_role;
grant execute on function public.can_read_message_attachment(text) to authenticated, service_role;

drop policy if exists message_attachment_object_insert on storage.objects;
create policy message_attachment_object_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.can_upload_message_attachment(name)
  );

drop policy if exists message_attachment_object_select on storage.objects;
create policy message_attachment_object_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.can_read_message_attachment(name)
  );

-- A sender may clean up files when the metadata transaction fails. Once a
-- message exists, deletion is deliberately unavailable: unsend hides it while
-- retention and audit data remain intact.
drop policy if exists message_attachment_object_delete_orphan on storage.objects;
create policy message_attachment_object_delete_orphan
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.can_upload_message_attachment(name)
    and not exists (
      select 1 from public.message_attachments a where a.storage_path = name
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Checked send and unsend operations
-- ---------------------------------------------------------------------------
create or replace function public.send_message_with_attachments(
  p_thread_id uuid,
  p_message_id uuid,
  p_body text,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  item jsonb;
  expected_prefix text := p_thread_id::text || '/' || p_message_id::text || '/';
begin
  if me is null then
    raise exception 'You are not signed in.';
  end if;

  if public.my_role() <> 'educator' or not public.am_i_verified() then
    raise exception 'Only a verified educator can send message attachments.';
  end if;

  if not public.is_thread_participant(p_thread_id) then
    raise exception 'You are not part of this conversation.';
  end if;

  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 5 then
    raise exception 'A message can have at most five attachments.';
  end if;

  if btrim(coalesce(p_body, '')) = ''
     and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then
    raise exception 'Write a message or add an attachment.';
  end if;

  insert into public.messages (id, thread_id, sender_id, body)
  values (p_message_id, p_thread_id, me, btrim(coalesce(p_body, '')));

  for item in select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    if coalesce(item->>'storage_path', '') not like expected_prefix || '%'
       or coalesce(item->>'file_name', '') = ''
       or coalesce(item->>'mime_type', '') = ''
       or coalesce(item->>'kind', '') not in ('image', 'audio', 'file')
       or coalesce((item->>'size_bytes')::bigint, 0) not between 1 and 15728640 then
      raise exception 'Invalid message attachment.';
    end if;

    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'message-attachments'
        and o.name = item->>'storage_path'
    ) then
      raise exception 'The attachment upload is missing.';
    end if;

    insert into public.message_attachments (
      message_id, storage_path, file_name, mime_type, size_bytes, kind
    ) values (
      p_message_id,
      item->>'storage_path',
      btrim(item->>'file_name'),
      item->>'mime_type',
      (item->>'size_bytes')::bigint,
      item->>'kind'
    );
  end loop;

  return p_message_id;
end;
$$;

create or replace function public.unsend_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  target public.messages%rowtype;
begin
  if public.my_role() <> 'educator' or not public.am_i_verified() then
    raise exception 'Only a verified educator can unsend a message.';
  end if;

  select * into target from public.messages where id = p_message_id;

  if not found or target.sender_id is distinct from me
     or not public.is_thread_participant(target.thread_id) then
    raise exception 'You can unsend only your own message.';
  end if;

  if target.deleted_at is not null then
    return;
  end if;

  if target.created_at < now() - interval '15 minutes' then
    raise exception 'Messages can be unsent for 15 minutes after sending.';
  end if;

  update public.messages
  set body = '', deleted_at = now(), deleted_by = me
  where id = p_message_id;
end;
$$;

revoke all on function public.send_message_with_attachments(uuid, uuid, text, jsonb)
  from public, anon;
revoke all on function public.unsend_message(uuid) from public, anon;
grant execute on function public.send_message_with_attachments(uuid, uuid, text, jsonb)
  to authenticated, service_role;
grant execute on function public.unsend_message(uuid)
  to authenticated, service_role;

revoke all on public.message_attachments from anon;
grant select on public.message_attachments to authenticated;

commit;
