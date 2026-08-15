-- ===========================================================================
-- 058 — profile photos, and an email that stays true
--
-- Two changes that both come from the same screen: the account settings page.
--
-- ---------------------------------------------------------------------------
-- 1. PHOTOS. `Avatar` has drawn a coloured monogram since it was written,
--    because there was no photo to draw — no column, no bucket, nothing had
--    ever asked anybody to upload one. Its own comment says a real photo is a
--    database job rather than a component one, and names the question that had
--    to be answered first: whether photographs of people working with children
--    should be visible across a school at all.
--
--    ANSWERED, by Saurab, deliberately: any signed-in person may see any
--    avatar, and parents included. The reason to have photographs at all is a
--    family recognising the teacher and the specialist working with their
--    child, and the care team screens already name those people. A face adds
--    little to a name and a role that are already on screen.
--
--    That decision is what makes the select policy one line. Do not narrow it
--    later without deciding what the photos were for.
--
-- ---------------------------------------------------------------------------
-- 2. EMAIL. `profiles.email` is written once, by the signup trigger in db/001,
--    and never again — there is a trigger on auth.users INSERT and none on
--    UPDATE. So the moment somebody changes their address through Supabase
--    auth, every screen in the product goes on showing the old one, correctly
--    reading a column nobody updates. No error, no symptom, and the directory
--    a school admin trusts is quietly wrong.
--
--    That is the shape of fault this project keeps producing, so the fix is a
--    trigger rather than a line in the settings form: it holds however the
--    address changes, including from the Supabase dashboard.
--
-- SAFE TO RUN TWICE. Every statement is `if not exists`, `or replace`, or a
-- `drop … if exists` before its `create`.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Where the photo lives
-- ---------------------------------------------------------------------------
-- A PATH, NOT AN IMAGE. Postgres will happily hold bytes and should not: the
-- row is read on every people list and every message thread, and a base64
-- column would be dragged along with all of them.
alter table public.profiles
  add column if not exists avatar_path text;

comment on column public.profiles.avatar_path is
  'Object path in the avatars bucket, always "<profile id>/<filename>". Null means no photo, and Avatar falls back to the monogram.';


-- ---------------------------------------------------------------------------
-- 2. The bucket
-- ---------------------------------------------------------------------------
-- PRIVATE, like the other two. A public bucket serves every object to anyone
-- holding the URL, with no policy consulted and no way to take it back once a
-- link is shared. The app asks for a signed URL instead.
--
-- 2 MB and images only. A phone photograph is several megabytes and none of
-- that resolution survives being drawn at 40 pixels; the limit is the database
-- refusing what the interface would only throw away.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];


-- ---------------------------------------------------------------------------
-- 3. Policies on storage.objects
-- ---------------------------------------------------------------------------
-- THE PATH IS THE PERMISSION, as in db/030. Every object is
-- "<profile id>/<filename>", so the first folder segment says whose it is and
-- the policy compares it to auth.uid(). No join, no helper function, nothing
-- to keep in step with another table.
--
-- If these fail with "must be owner of table objects", create them from
-- Storage → Policies in the dashboard instead. The project owner can normally
-- run them here.

-- Anyone signed in may look. See the note at the top: this is the decision,
-- not an oversight.
drop policy if exists avatars_object_select on storage.objects;
create policy avatars_object_select
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

-- Only into your own folder.
drop policy if exists avatars_object_insert on storage.objects;
create policy avatars_object_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  );

-- Replacing a photo is an update when the filename is reused.
drop policy if exists avatars_object_update on storage.objects;
create policy avatars_object_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  )
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  );

-- DELETE IS ALLOWED, unlike behaviour logs or safeguarding incidents. Those
-- are records of things that happened and must survive somebody wishing they
-- had not. A photograph of yourself is not a record; "you cannot remove it" is
-- the wrong answer.
drop policy if exists avatars_object_delete on storage.objects;
create policy avatars_object_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = auth.uid()
  );


-- ---------------------------------------------------------------------------
-- 4. Letting the browser write the path — and only its own
-- ---------------------------------------------------------------------------
-- db/004 revoked UPDATE on profiles and granted back first_name and last_name
-- alone, so that nobody could run
--     update profiles set role = 'platform_admin' where id = auth.uid();
-- That reasoning is untouched. This adds exactly one more column.
grant update (avatar_path) on public.profiles to authenticated;

-- A COLUMN GRANT SAYS WHICH COLUMN, NOT WHICH VALUE, and that gap matters
-- here. With the grant alone, anyone could write
--     update profiles set avatar_path = '<someone else>/photo.jpg'
-- and wear another person's face in every directory and message thread. The
-- storage policy above protects the FILE and has nothing to say about a string
-- in another table.
--
-- So the row policy checks the value. Same `using` as db/004; the `with check`
-- gains one condition.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (
      avatar_path is null
      or avatar_path like auth.uid()::text || '/%'
    )
  );


-- ---------------------------------------------------------------------------
-- 5. Keeping profiles.email true
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because the person changing their address has no UPDATE
-- privilege on the email column, and must not be given one — an address the
-- browser can write is an address that can be pointed at somebody else's
-- invitation.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

commit;


-- ===========================================================================
-- CHECK IT, rather than assume it
-- ===========================================================================
-- The bucket must be private. If `public` is true, stop — every photo is being
-- served to anyone holding the URL:
--
--   select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'avatars';
--
-- Four policies, no more and no fewer:
--
--   select policyname, cmd from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname like 'avatars_object%'
--   order by policyname;
--
-- The column exists and the browser may write it:
--
--   select column_name from information_schema.columns
--   where table_name = 'profiles' and column_name = 'avatar_path';
--
--   select privilege_type, column_name
--   from information_schema.column_privileges
--   where table_name = 'profiles' and grantee = 'authenticated'
--     and privilege_type = 'UPDATE';
--
-- The email trigger is attached:
--
--   select tgname from pg_trigger where tgname = 'on_auth_user_email_changed';
-- ===========================================================================
