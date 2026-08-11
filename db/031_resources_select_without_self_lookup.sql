-- ===========================================================================
-- 031_resources_select_without_self_lookup.sql — fix a policy that cannot see
-- the row it is being asked about
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHAT WAS WRONG.
--
-- `resources_select` in db/030 asked `can_view_resource(id)`, and that
-- function answers by looking the row up in public.resources. Fine for a row
-- that already exists. Not fine for the row being created:
--
--   insert into resources (...) values (...) returning id;   -- 42501
--   insert into resources (...) values (...);                -- accepted
--
-- Postgres applies the SELECT policy to rows handed back by RETURNING. The
-- policy calls can_view_resource(), which is STABLE, so it runs against the
-- snapshot taken when the statement began — a snapshot in which the row does
-- not exist yet. The lookup finds nothing, the function says no, and the
-- insert is rejected with "new row violates row-level security policy".
--
-- The insert policy was never the problem, which is what made this confusing:
-- every condition in it was satisfiable and provably true. What failed was
-- reading BACK what had just been written.
--
-- It would have broken the resource hub completely, because uploading needs
-- the new row's id to build the storage path — `insert(...).select()` is the
-- first thing the screen does. Found by a probe script before any screen
-- existed; the app would have failed on the very first upload.
--
-- THE FIX. A policy on a table should test the row's own columns, not go and
-- fetch the row it has already been given. `owner_id = auth.uid()` needs no
-- lookup and no snapshot, and it is faster besides.
--
-- can_view_resource() STAYS, unchanged, and is still the right tool for
-- storage.objects — there the only input is a path, so the resource genuinely
-- has to be looked up, and by then it is long committed.
--
-- THE GENERAL LESSON, worth remembering the next time a policy calls a
-- helper: a SELECT policy that queries its own table cannot be used on a table
-- anything ever inserts into with RETURNING.

begin;

drop policy if exists resources_select on public.resources;
create policy resources_select
  on public.resources for select to authenticated
  using (
    public.is_platform_admin()
    -- Read straight off the row under test. No lookup, so it works for a row
    -- that is still being inserted.
    or (owner_id = auth.uid() and public.am_i_verified())
    -- Shares live in a different table that is already committed by the time
    -- anyone asks, so this branch has no such problem.
    or exists (
      select 1 from public.resource_shares rs
      where rs.resource_id = id
        and public.can_view_student(rs.student_id)
    )
  );

commit;

-- ---------------------------------------------------------------------------
-- Check it worked, from the BROWSER CONSOLE as a verified specialist:
--
--   await supabase.from('resources')
--     .insert({ school_id: '<your school>', owner_id: '<your id>',
--               title: 'test', category: 'handout' })
--     .select('id').single()
--
-- It must return the new id rather than an RLS error. That round trip is
-- exactly what the upload flow depends on.
-- ---------------------------------------------------------------------------
