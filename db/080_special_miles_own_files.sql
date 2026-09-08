-- ===========================================================================
-- 080_special_miles_own_files.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: TWO MIGRATIONS ALREADY NAMED THIS AS THE MISSING PIECE
-- ---------------------------------------------------------------------------
-- db/075 could not give a course a toolkit to download. db/079 could not put an
-- image in an article. Both stopped at the same wall and both wrote it down:
--
--   "db/030's `resources` is school-scoped — `school_id not null` — because it
--    holds a school's own material for its own families. Academy content
--    belongs to Special Miles and to no school, so it cannot live there."
--
-- The brief asks for "media upload (images, videos and documents)" and
-- "resource toolkits" by name. This is the bucket that holds them.
--
-- ---------------------------------------------------------------------------
-- A SECOND BUCKET RATHER THAN LOOSENING THE FIRST
-- ---------------------------------------------------------------------------
-- The alternative is making `resources.school_id` nullable and letting null
-- mean "ours". That would put Special Miles' marketing PDFs and a child's
-- practice video — which db/030 calls "the most sensitive material in the
-- product" — in one table behind one set of policies, distinguished by a null.
--
-- They have opposite audiences. A course toolkit is meant to be widely read; a
-- practice video of an identifiable child is meant to be seen by almost nobody.
-- One policy mistake in a shared table exposes the second while somebody is
-- thinking about the first.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DIFFERENT FROM db/030
-- ---------------------------------------------------------------------------
-- Written by Special Miles only, and readable by anybody signed in. That is a
-- deliberately wide read and it is safe HERE precisely because of what the
-- bucket may hold: material written for publication. Nothing about a child ever
-- goes in it, which is a rule this file cannot enforce and the reason the
-- comment on the table says so plainly.
--
-- PUBLIC = FALSE all the same. db/030's own words: "a public bucket serves
-- every object to anyone who guesses the URL, with no policy consulted at all."
-- An unpublished course's toolkit is not for the world, and neither is a draft.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The bucket
-- ---------------------------------------------------------------------------
-- Same 50 MB ceiling as db/030, and for the same reason it gives: the free tier
-- holds 1 GB in total, so a limit the plan cannot honour is a promise that
-- fails on upload number three. Raise it in both places when the plan changes.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library',
  'library',
  false,
  52428800, -- 50 MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'audio/mpeg'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------------
-- 2. What each file is
-- ---------------------------------------------------------------------------
create table if not exists public.library_files (
  id           uuid primary key default gen_random_uuid(),

  title        text not null check (btrim(title) <> ''),
  -- Read out by a screen reader in place of the file, and printed beside a
  -- download. "toolkit-v3-FINAL.pdf" is a filename, not a description.
  description  text,

  -- THE PATH CONVENTION IS LOAD-BEARING, as db/030 says of its own: the storage
  -- policies below read segment 1 of the object path as this row's id, so a
  -- file must always be stored at '<library_files id>/<filename>'.
  storage_path text unique,
  mime_type    text,
  size_bytes   integer check (size_bytes is null or size_bytes >= 0),

  -- Optional attachments. A file may belong to a course module, to an article,
  -- or to neither — a standalone toolkit is a real thing to publish.
  course_module_id uuid references public.course_modules(id) on delete set null,
  article_id       uuid references public.articles(id) on delete set null,

  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.library_files is
  'Special Miles'' own published material — course toolkits, article images, downloads. NOTHING ABOUT A CHILD BELONGS HERE: anything identifying a student goes in `resources` (db/030), which is school-scoped and far more tightly read. The read policy on this table is every signed-in account.';

create index if not exists library_files_module_idx
  on public.library_files (course_module_id);
create index if not exists library_files_article_idx
  on public.library_files (article_id);

drop trigger if exists library_files_touch on public.library_files;
create trigger library_files_touch
  before update on public.library_files
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- 3. Who may read and write the rows
-- ---------------------------------------------------------------------------
alter table public.library_files enable row level security;

drop policy if exists library_files_select on public.library_files;
drop policy if exists library_files_write on public.library_files;

-- Everybody signed in. See the header: this bucket holds material written for
-- publication, and narrowing it per audience would mean a course visible to a
-- parent whose toolkit was not.
create policy library_files_select on public.library_files
  for select to authenticated
  using (true);

create policy library_files_write on public.library_files
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on public.library_files from anon;


-- ---------------------------------------------------------------------------
-- 4. Who may read and write the OBJECTS
-- ---------------------------------------------------------------------------
-- A row and its file are two different things behind two different policies,
-- and db/030 makes the same split. Getting one right and the other wrong is how
-- a file stays readable after its row is gone.
-- ---------------------------------------------------------------------------
drop policy if exists library_object_select on storage.objects;
create policy library_object_select
  on storage.objects for select to authenticated
  using (bucket_id = 'library');

drop policy if exists library_object_insert on storage.objects;
create policy library_object_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'library' and public.is_platform_admin());

drop policy if exists library_object_update on storage.objects;
create policy library_object_update
  on storage.objects for update to authenticated
  using (bucket_id = 'library' and public.is_platform_admin())
  with check (bucket_id = 'library' and public.is_platform_admin());

drop policy if exists library_object_delete on storage.objects;
create policy library_object_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'library' and public.is_platform_admin());

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select id, public, file_size_limit from storage.buckets where id = 'library';
--   -- public must be FALSE
--
--   select policyname from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname like 'library_object%';
--   -- four
--
-- The one that matters, because this bucket is readable by everybody signed in
-- and the other one is not: uploading must still be refused to anybody who is
-- not Special Miles. As a school admin, this must fail:
--
--   insert into storage.objects (bucket_id, name) values ('library','x/y.pdf');
--
-- AND THE RULE THIS FILE CANNOT ENFORCE: nothing about a child goes in here.
-- The bucket is readable by every signed-in account, so a practice video filed
-- in it by mistake is a video shown to every parent at every school. Those
-- belong in `resources` — db/030 — which is scoped to one school and gated on
-- being assigned to the child.
-- ---------------------------------------------------------------------------
