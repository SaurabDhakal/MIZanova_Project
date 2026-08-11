-- ===========================================================================
-- 034_iep_files.sql — put the actual document behind the IEP register
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- db/008 created `iep_documents` as a register — "a list a parent can see and
-- acknowledge is useful before then, and is honest about what it is" — with
-- `storage_path` and a note saying Storage would arrive later. It has been null
-- ever since. This is the file.
--
-- A SECOND BUCKET, NOT THE ONE FROM db/030, and the reasons are worth stating
-- because sharing one would have been less work:
--
--   Different rules. A resource is teaching material a specialist chooses to
--   share. An IEP is a child's whole plan, visible to everyone entitled to that
--   child without anyone deciding to share it. Those are not the same question,
--   and the `resources` bucket's policies answer theirs by looking the path up
--   in `public.resources` — an IEP path would find nothing there and be refused.
--
--   Blast radius. One bucket means one policy mistake exposes both. Two means a
--   wrong answer about therapy handouts cannot reach a child's full plan.
--
--   Different file types. A plan is a PDF or a Word document. A resource is
--   more likely a video.
--
-- SAME PATH CONVENTION as db/030 — '<document id>/<filename>' — so the storage
-- policies decide by looking the document up, and an object is reachable
-- exactly when its row is. One source of truth rather than two that can drift.
--
-- ---------------------------------------------------------------------------
-- SOMETHING THIS SCRIPT DELIBERATELY DOES NOT FIX
-- ---------------------------------------------------------------------------
-- `iep_documents_write_staff` is `for all`, so any verified staff member
-- assigned to the child can DELETE a document — including one a family has
-- already confirmed reading. db/010 locks a safeguarding incident once an
-- administrator has acknowledged it, for exactly that reason, and there is no
-- equivalent here.
--
-- That is a pre-existing gap and widening this script to close it would mix two
-- decisions in one migration. It is written down here and in the architecture
-- review instead. Attaching a file makes it slightly worse — deleting the row
-- leaves the object behind, because Storage does not cascade from a table — so
-- the application removes the object first.

begin;

-- ---------------------------------------------------------------------------
-- 1. The bucket
-- ---------------------------------------------------------------------------
-- PRIVATE. Reached only through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'iep-documents',
  'iep-documents',
  false,
  20971520, -- 20 MB. A plan is a document, not a video.
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------------
-- 2. Two questions, asked the same way the table asks them
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, taking the document id as a parameter. That shape is the
-- one db/033 arrived at the hard way: the function reads a DIFFERENT table from
-- the policy that calls it, so RLS on `iep_documents` does not re-trigger and
-- nothing recurses. And because these are only ever called from
-- storage.objects — never from iep_documents' own policy — there is no row
-- being inserted for them to fail to see, which is the trap db/031 fixed.

/** Everyone entitled to the child: assigned staff, the school, the family. */
create or replace function public.can_view_iep_file(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.iep_documents d
    where d.id = p_document_id
      and public.can_view_student(d.student_id)
  );
$$;

revoke all on function public.can_view_iep_file(uuid) from public, anon;
grant execute on function public.can_view_iep_file(uuid) to authenticated, service_role;


/**
 * Staff only, and only verified ones. Mirrors iep_documents_write_staff, so
 * whoever may register a document may attach its file — and a family, who may
 * read a plan, may never replace one.
 */
create or replace function public.can_write_iep_file(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.iep_documents d
    where d.id = p_document_id
      and public.can_staff_view_student(d.student_id)
  );
$$;

revoke all on function public.can_write_iep_file(uuid) from public, anon;
grant execute on function public.can_write_iep_file(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. The bucket's own policies
-- ---------------------------------------------------------------------------
-- Without these the register is decorated with a download button that never
-- works — or worse, one that works for the wrong person. Storage is its own
-- table with its own RLS; a document row nobody may read still has bytes behind
-- it that somebody might.

drop policy if exists iep_object_select on storage.objects;
create policy iep_object_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'iep-documents'
    and public.can_view_iep_file(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists iep_object_insert on storage.objects;
create policy iep_object_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'iep-documents'
    and public.can_write_iep_file(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists iep_object_delete on storage.objects;
create policy iep_object_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'iep-documents'
    and public.can_write_iep_file(((storage.foldername(name))[1])::uuid)
  );

-- NO UPDATE POLICY, and this matters more here than it did for resources.
-- Replacing the file under a plan a family has already confirmed reading would
-- change what they agreed they had read, leaving the acknowledgement pointing
-- at a document that no longer exists and no trace that it ever did. Register a
-- new version instead — which is what a school would do on paper anyway.

commit;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
--   npm run storage-check
--
-- covers this bucket alongside the other one: a teacher attaches a file, the
-- family opens it, a stranger is refused, and a family cannot replace it.
--
-- The bucket must be private. If this returns true, stop:
--   select id, public, file_size_limit from storage.buckets
--   where id = 'iep-documents';
-- ---------------------------------------------------------------------------
