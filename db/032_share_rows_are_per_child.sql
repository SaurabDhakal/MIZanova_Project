-- ===========================================================================
-- 032_share_rows_are_per_child.sql — a family should not learn who else
-- received the same material
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHAT WAS WRONG.
--
-- db/030 guarded the share rows with the wrong question:
--
--   using (public.can_view_resource(resource_id))
--
-- That asks "may you see this RESOURCE?" — and the answer is yes for anyone it
-- was shared with. So a resource shared with five children showed all five of
-- its share rows to every one of those five families.
--
-- WHAT THAT ACTUALLY EXPOSED. Not names: `students` has its own policies and
-- `can_view_student()` returns nothing for another family's child, so the
-- embedded name comes back null. What leaked was the student_id of every other
-- recipient, and the plain fact that four other families were given the same
-- material — which for a therapy resource is itself information about those
-- children. The screen rendered it as rows reading "a student you cannot see",
-- which is a fair description of a leak.
--
-- Harmless while only staff used the screen, because assigned staff and the
-- school administrator can see those children anyway. It stopped being
-- harmless the moment the Resources page was given to parents.
--
-- THE FIX is to ask the question the row is actually about. A share row is
-- about ONE CHILD, so the test is whether you may see that child.
--
--   owner            → every share of their own resource, because they made them
--   platform admin   → everything, for support and audit
--   everyone else    → only shares for a child they are already entitled to
--
-- Nobody loses anything they should have had: a teacher assigned to the child
-- still sees that child's share, and a school administrator still sees their
-- own school's.

begin;

-- ---------------------------------------------------------------------------
-- One question, so the two policies below cannot drift apart
-- ---------------------------------------------------------------------------
create or replace function public.can_view_resource_share(p_share_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.resource_shares rs
    where rs.id = p_share_id
      and (
        public.is_platform_admin()
        or exists (
          select 1 from public.resources r
          where r.id = rs.resource_id
            and r.owner_id = auth.uid()
            and public.am_i_verified()
        )
        or public.can_view_student(rs.student_id)
      )
  );
$$;

revoke all on function public.can_view_resource_share(uuid) from public, anon;
grant execute on function public.can_view_resource_share(uuid)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- The share rows
-- ---------------------------------------------------------------------------
-- Written out rather than calling the helper above, because this policy is
-- evaluated against a row it has already been handed. Calling a function that
-- looks the row up again would repeat the mistake db/031 fixed: a STABLE
-- function cannot see a row still being inserted, so `insert ... returning`
-- would fail. Reading student_id and resource_id straight off the row needs no
-- lookup at all.
drop policy if exists resource_shares_select on public.resource_shares;
create policy resource_shares_select
  on public.resource_shares for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.resources r
      where r.id = resource_id
        and r.owner_id = auth.uid()
        and public.am_i_verified()
    )
    or public.can_view_student(student_id)
  );


-- ---------------------------------------------------------------------------
-- The acknowledgements
-- ---------------------------------------------------------------------------
-- Same leak, one level down: "who has read this" was visible to anyone who
-- could see the resource, so a family could count the other families who had
-- opened it. Now it follows the share it belongs to.
--
-- The helper is safe here: an acknowledgement always refers to a share that
-- was committed long before, so there is no in-flight row to miss.
drop policy if exists resource_acks_select on public.resource_acknowledgements;
create policy resource_acks_select
  on public.resource_acknowledgements for select to authenticated
  using (public.can_view_resource_share(share_id));

-- Insert is unchanged in spirit but retested against the same helper: you may
-- record that YOU have read something, on a share you can actually see.
drop policy if exists resource_acks_insert on public.resource_acknowledgements;
create policy resource_acks_insert
  on public.resource_acknowledgements for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.can_view_resource_share(share_id)
  );

commit;

-- ---------------------------------------------------------------------------
-- Check it worked, from the BROWSER CONSOLE.
--
-- Share one resource with two children from different families. Then, signed
-- in as one of those parents:
--
--   await supabase.from('resource_shares').select('id, student_id')
--
-- must return exactly ONE row — their own child's. Before this script it
-- returned both.
-- ---------------------------------------------------------------------------
