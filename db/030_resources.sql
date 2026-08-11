-- ===========================================================================
-- 030_resources.sql — the specialist's material library, and real file storage
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- From docs/Full and final figma design/Resource Hub.png.
--
-- THIS IS THE FIRST TIME MIZANOVA STORES A FILE. Everything until now has been
-- rows. db/008 created iep_documents as "a register of the documents that
-- exist, not the files themselves", with storage_path null and a note saying
-- Storage would arrive later. This is later. The same bucket serves both, so
-- IEP documents can be attached without a second design.
--
-- WHAT THIS CHANGES ABOUT THE RISK. A row leaking is bad. A file leaking is
-- worse and different: these are practice videos of identifiable children,
-- communication boards with a child's photographs on them, treatment plans as
-- PDFs. A row needs interpretation. A video does not.
--
-- So the bucket is PRIVATE, and stays private. Files are reached only through
-- short-lived signed URLs the server mints after checking the same policies
-- below. There is no public URL for anything in here, ever.
--
-- ---------------------------------------------------------------------------
-- FIVE THINGS IN THE DESIGN ARE NOT BUILT, AND WHY
-- ---------------------------------------------------------------------------
--
-- 1. "All materials shared are HIPAA & FERPA compliant."
--
--    They are not. HIPAA and FERPA are United States law and neither applies
--    to a school in New South Wales; the Australian Privacy Principles do.
--    Nothing in this product implements either. This is the same false
--    assurance db/028 refused to print on the session screen, and it is worse
--    here — a clinician who believes the platform is handling compliance
--    uploads a video they would otherwise have thought twice about.
--
-- 2. "Import from Drive."
--
--    An OAuth integration that copies children's clinical material out of a
--    third party we have no agreement with, into one we do. That is a data
--    processing decision for Special Miles and its schools, not a button.
--
-- 3. Automatic reminders every 72 hours.
--
--    There is no scheduled job runner and no outbound email in this product.
--    Both are real infrastructure. A promise that reminders go out
--    automatically, when nothing sends them, is the most dangerous kind of
--    missing feature: the failure is silent and the person relying on it is a
--    parent who never got the message.
--
-- 4. "Awaiting Signature."
--
--    db/008 already settled this for IEP documents and the reasoning is
--    unchanged: a real e-signature needs identity assurance, tamper-evidence
--    and an audit trail this product does not have. What is recorded here is
--    that someone confirmed they READ it. It is called acknowledgement
--    everywhere, and must never be presented as a signature.
--
-- 5. "Resource Spotlight" — a curated library of vetted materials.
--
--    There is no curated library and no one to curate it. An empty shelf
--    labelled "new additions" is worse than no shelf.
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. The bucket
-- ---------------------------------------------------------------------------
-- PRIVATE. `public = false` is the single most important value in this file:
-- a public bucket serves every object to anyone who guesses the URL, with no
-- policy consulted at all.
--
-- The limits below are enforced by Storage itself, on the server. The browser
-- also checks them, but that check is a courtesy to the person uploading — it
-- is not what stops a 2 GB file.
--
-- WHY 50 MB AND NOT THE DESIGN'S 500 MB FOR VIDEO. The whole Supabase free
-- tier allows 1 GB of storage. Two of the design's videos would fill it. A
-- limit the plan cannot honour is a promise that fails on upload number three,
-- so this is set to something the project can actually hold. Raise it here
-- when the plan changes — one number, one place.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resources',
  'resources',
  false,
  52428800, -- 50 MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp4'
  ]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------------
-- 2. resources — one row per uploaded material
-- ---------------------------------------------------------------------------
create table if not exists public.resources (
  id          uuid primary key default gen_random_uuid(),

  -- Which school this belongs to. A specialist may work across several; the
  -- material is filed under the one it was uploaded for.
  school_id   uuid not null references public.schools(id) on delete restrict,
  owner_id    uuid references public.profiles(id) on delete set null,

  title       text not null check (btrim(title) <> ''),
  description text,

  -- The design's filter tabs. 'other' exists so an upload that fits nothing is
  -- still filed rather than refused.
  category    text not null default 'other'
                check (category in ('video', 'handout', 'aac_board', 'other')),

  -- Where the file sits in the bucket, as '<resource id>/<filename>'.
  -- THE PATH CONVENTION IS LOAD-BEARING: the storage policies at the bottom of
  -- this file read the first folder segment and look the resource up by it, so
  -- an object is reachable exactly when its row is. One source of truth
  -- instead of two that can disagree.
  --
  -- Null between creating the row and the upload finishing. A row with no file
  -- is a failed upload, not a resource, and the screens filter them out.
  storage_path text unique,
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists resources_school_idx
  on public.resources (school_id, created_at desc);
create index if not exists resources_owner_idx
  on public.resources (owner_id);

drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 3. resource_shares — who a material has been given to
-- ---------------------------------------------------------------------------
-- Shared PER CHILD rather than per person, because that is the unit everything
-- else in MiZanova reasons about. Sharing with a child's record means the
-- people already entitled to that child — assigned staff, the school's
-- administrator, the guardians — can see it. Nobody gains access to a child
-- they could not already see.
create table if not exists public.resource_shares (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,

  shared_by   uuid references public.profiles(id) on delete set null,
  shared_at   timestamptz not null default now(),

  unique (resource_id, student_id)
);

create index if not exists resource_shares_student_idx
  on public.resource_shares (student_id, shared_at desc);


-- ---------------------------------------------------------------------------
-- 4. resource_acknowledgements — "I have read this"
-- ---------------------------------------------------------------------------
-- NOT A SIGNATURE. See point 4 at the top of this file, and db/008 where the
-- same decision was made for IEP documents.
--
-- Keyed by (share, person) rather than by share alone: a child can have two
-- guardians and one having read something says nothing about the other.
--
-- Its own table rather than a column on resource_shares, for the reason db/008
-- gives — guardians and staff are the same database role, so a column grant
-- cannot separate "the parent may set acknowledged_at" from "staff may edit
-- the rest of the row".
create table if not exists public.resource_acknowledgements (
  share_id        uuid not null references public.resource_shares(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),

  primary key (share_id, profile_id)
);


-- ---------------------------------------------------------------------------
-- 5. One question, asked by every policy below
-- ---------------------------------------------------------------------------
-- Kept as a function so the storage policies and the table policies cannot
-- drift apart. If this is wrong it is wrong in one place.
create or replace function public.can_view_resource(p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      -- The specialist who uploaded it, while they remain verified.
      select 1 from public.resources r
      where r.id = p_resource_id
        and r.owner_id = auth.uid()
        and public.am_i_verified()
    )
    or exists (
      -- Anyone entitled to a child it has been shared with. can_view_student
      -- already encodes the whole rule — verified assigned staff, the school's
      -- administrator, and guardians without a verification requirement — and
      -- it is covered by tests/rls/student-visibility.test.ts.
      select 1 from public.resource_shares rs
      where rs.resource_id = p_resource_id
        and public.can_view_student(rs.student_id)
    );
$$;

revoke all on function public.can_view_resource(uuid) from public, anon;
grant execute on function public.can_view_resource(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 6. Policies — the tables
-- ---------------------------------------------------------------------------
alter table public.resources                enable row level security;
alter table public.resource_shares          enable row level security;
alter table public.resource_acknowledgements enable row level security;

drop policy if exists resources_select on public.resources;
create policy resources_select
  on public.resources for select to authenticated
  using (public.can_view_resource(id));

-- Only a verified specialist uploads, and only into their own school, and only
-- as themselves.
drop policy if exists resources_insert on public.resources;
create policy resources_insert
  on public.resources for insert to authenticated
  with check (
    public.my_role() = 'specialist'
    and public.am_i_verified()
    and owner_id = auth.uid()
    and school_id = public.my_school_id()
  );

drop policy if exists resources_update on public.resources;
create policy resources_update
  on public.resources for update to authenticated
  using (owner_id = auth.uid() and public.am_i_verified())
  with check (owner_id = auth.uid() and public.am_i_verified());

-- DELETE IS ALLOWED HERE, unlike behaviour logs or specialist sessions, and
-- the difference is deliberate. Those are records of things that happened and
-- must survive someone wishing they had not. This is content — and if a
-- clinician uploads a video of the wrong child, "you cannot remove it" is the
-- wrong answer. Only the owner, and only while verified.
drop policy if exists resources_delete on public.resources;
create policy resources_delete
  on public.resources for delete to authenticated
  using (owner_id = auth.uid() and public.am_i_verified());

revoke all on public.resources from anon;


drop policy if exists resource_shares_select on public.resource_shares;
create policy resource_shares_select
  on public.resource_shares for select to authenticated
  using (public.can_view_resource(resource_id));

-- Sharing is the owner's decision. A teacher who receives a material cannot
-- pass it to another family.
drop policy if exists resource_shares_insert on public.resource_shares;
create policy resource_shares_insert
  on public.resource_shares for insert to authenticated
  with check (
    shared_by = auth.uid()
    and public.am_i_verified()
    and exists (
      select 1 from public.resources r
      where r.id = resource_id and r.owner_id = auth.uid()
    )
    -- And only to a child they actually carry. Otherwise "share" would be a
    -- way to find out whether a student id exists.
    and public.is_assigned_staff_for(student_id)
  );

-- Revoke Access in the design. The share goes; the acknowledgement goes with
-- it by cascade, which is correct — it recorded reading something that is no
-- longer shared.
drop policy if exists resource_shares_delete on public.resource_shares;
create policy resource_shares_delete
  on public.resource_shares for delete to authenticated
  using (
    public.am_i_verified()
    and exists (
      select 1 from public.resources r
      where r.id = resource_id and r.owner_id = auth.uid()
    )
  );

revoke all on public.resource_shares from anon;


drop policy if exists resource_acks_select on public.resource_acknowledgements;
create policy resource_acks_select
  on public.resource_acknowledgements for select to authenticated
  using (
    exists (
      select 1 from public.resource_shares rs
      where rs.id = share_id and public.can_view_resource(rs.resource_id)
    )
  );

-- You may only record that YOU have read something. Nobody acknowledges on
-- somebody else's behalf — that is the entire value of the record.
drop policy if exists resource_acks_insert on public.resource_acknowledgements;
create policy resource_acks_insert
  on public.resource_acknowledgements for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.resource_shares rs
      where rs.id = share_id and public.can_view_resource(rs.resource_id)
    )
  );

-- No update and no delete. "I have read this" is not a claim to be withdrawn
-- or backdated later.

revoke all on public.resource_acknowledgements from anon;


-- ---------------------------------------------------------------------------
-- 7. Policies — the bucket itself
-- ---------------------------------------------------------------------------
-- WITHOUT THESE, EVERYTHING ABOVE IS DECORATION. Storage is a separate table
-- with its own RLS, so a resources row that nobody may read still has an
-- object behind it that anyone might. These policies close that by asking the
-- same question the table policies ask, via the path convention.
--
-- storage.foldername(name) splits the object path; segment 1 is the resource
-- id, which is why storage_path must always be '<resource id>/<filename>'.
--
-- If these three fail with "must be owner of table objects", create them from
-- Storage → Policies in the dashboard instead. The project owner can normally
-- run them here.

drop policy if exists resources_object_select on storage.objects;
create policy resources_object_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resources'
    and public.can_view_resource(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists resources_object_insert on storage.objects;
create policy resources_object_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resources'
    and public.am_i_verified()
    and exists (
      select 1 from public.resources r
      where r.id = ((storage.foldername(name))[1])::uuid
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists resources_object_delete on storage.objects;
create policy resources_object_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'resources'
    and public.am_i_verified()
    and exists (
      select 1 from public.resources r
      where r.id = ((storage.foldername(name))[1])::uuid
        and r.owner_id = auth.uid()
    )
  );

-- No update policy. Replacing the file under a material somebody has already
-- acknowledged would change what they agreed they had read, with no trace.
-- Upload a new resource instead.

commit;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
-- The bucket must be private. If this returns true, stop and fix it — every
-- object is being served to anyone with the URL:
--   select id, public, file_size_limit from storage.buckets where id = 'resources';
--
-- Three policies on storage.objects:
--   select policyname from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname like 'resources_object%';
--
-- And from the BROWSER CONSOLE as a signed-in parent, the real test — asking
-- Storage directly for a file that has not been shared with your child:
--   await supabase.storage.from('resources').download('<some other id>/x.pdf')
-- should fail rather than return bytes.
-- ---------------------------------------------------------------------------
