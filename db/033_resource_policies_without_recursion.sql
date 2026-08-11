-- ===========================================================================
-- 033_resource_policies_without_recursion.sql — two constraints, one shape
-- that satisfies both
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHAT WAS WRONG.
--
--   infinite recursion detected in policy for relation "resource_shares"
--
-- `resources_select` contains an inline `select ... from resource_shares`.
-- db/032 gave `resource_shares_select` an inline `select ... from resources`.
-- Reading either table evaluates the other's policy, which reads the first
-- table again, and Postgres stops it.
--
-- HOW THE MISTAKE HAPPENED, because the shape of it matters more than the fix.
-- There are two rules here and they pull in opposite directions:
--
--   db/003  A policy must not query another RLS-protected table inline, or the
--           two policies call each other forever. That is the entire reason
--           the security-definer helpers exist — SECURITY DEFINER runs as the
--           function's owner, so RLS on what it reads does not re-trigger.
--
--   db/031  A policy must not look up the row it has already been handed. A
--           STABLE function runs against the snapshot from the start of the
--           statement, so it cannot see a row still being inserted, and
--           `insert ... returning` fails with a row-level security error.
--
-- db/032 avoided the second by inlining, and hit the first. db/030 avoided the
-- first with a helper, and hit the second.
--
-- THE SHAPE THAT SATISFIES BOTH: a security-definer function that takes, as a
-- parameter, a value read straight off the row under test, and queries only a
-- DIFFERENT table.
--
--   read off the row  → no lookup of the row being inserted  → no snapshot problem
--   security definer  → RLS on the other table does not fire → no recursion
--
-- Both helpers below are exactly that. Nothing here changes who may see what;
-- db/032's decision stands, and this is only how it is expressed.

begin;

-- ---------------------------------------------------------------------------
-- Do I own this resource? Takes the id off the share row; reads only resources.
-- ---------------------------------------------------------------------------
create or replace function public.owns_resource(p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.resources r
    where r.id = p_resource_id
      and r.owner_id = auth.uid()
      and public.am_i_verified()
  );
$$;

revoke all on function public.owns_resource(uuid) from public, anon;
grant execute on function public.owns_resource(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Is this resource shared with a child I may see? Takes the id off the
-- resource row; reads only resource_shares.
-- ---------------------------------------------------------------------------
create or replace function public.resource_shared_with_my_student(p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.resource_shares rs
    where rs.resource_id = p_resource_id
      and public.can_view_student(rs.student_id)
  );
$$;

revoke all on function public.resource_shared_with_my_student(uuid) from public, anon;
grant execute on function public.resource_shared_with_my_student(uuid)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- resources — the owner branch still reads its own column, per db/031
-- ---------------------------------------------------------------------------
drop policy if exists resources_select on public.resources;
create policy resources_select
  on public.resources for select to authenticated
  using (
    public.is_platform_admin()
    -- Straight off the row under test, so this works for a row that is still
    -- being inserted. This is the half db/031 exists for.
    or (owner_id = auth.uid() and public.am_i_verified())
    -- A different table, behind SECURITY DEFINER. This is the half db/003
    -- exists for.
    or public.resource_shared_with_my_student(id)
  );


-- ---------------------------------------------------------------------------
-- resource_shares — one child per row, which was db/032's whole point
-- ---------------------------------------------------------------------------
drop policy if exists resource_shares_select on public.resource_shares;
create policy resource_shares_select
  on public.resource_shares for select to authenticated
  using (
    public.is_platform_admin()
    or public.owns_resource(resource_id)
    -- The question this row is actually about. A share concerns ONE child, so
    -- a family sees their own child's row and not the four other families who
    -- were given the same material.
    or public.can_view_student(student_id)
  );

-- The write policies had the same inline lookup of `resources`. They were not
-- reached by the recursion because nothing was inserting while reading, but
-- they would have been the moment sharing was attempted from the same
-- statement as a read. Same fix, same reason.
drop policy if exists resource_shares_insert on public.resource_shares;
create policy resource_shares_insert
  on public.resource_shares for insert to authenticated
  with check (
    shared_by = auth.uid()
    and public.owns_resource(resource_id)
    and public.is_assigned_staff_for(student_id)
  );

drop policy if exists resource_shares_delete on public.resource_shares;
create policy resource_shares_delete
  on public.resource_shares for delete to authenticated
  using (public.owns_resource(resource_id));

commit;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
--   npm run storage-check
--
-- which now signs in as a guardian and reads a resource shared with their
-- child — the exact path that produced the recursion error on screen.
--
-- Or from the BROWSER CONSOLE as a parent:
--   await supabase.from('resources').select('id, resource_shares(student_id)')
-- must return rows rather than an "infinite recursion" error, and each row's
-- resource_shares must contain only their own child.
-- ---------------------------------------------------------------------------
