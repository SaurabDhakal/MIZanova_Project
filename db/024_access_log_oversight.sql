-- ===========================================================================
-- 024_access_log_oversight.sql — a school admin cannot audit themselves
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- THE HOLE THIS CLOSES
-- ---------------------------------------------------------------------------
-- db/023 claimed a property: the person whose reads are recorded cannot see
-- the record, because an audit trail its subject can inspect for gaps is a map
-- of where to hide.
--
-- That was true for teachers and specialists and NOT true for school admins.
-- The policy let them read every event for their school, and their own reads
-- are events for their school. So the one role with the most access to
-- children's records was also the only role that could check exactly what had
-- been noticed about its own behaviour.
--
-- Found because Saurab asked the obvious question — the log is shown to the
-- school admin, so how would Special Miles ever know?
--
-- The answer is a chain rather than a single watcher: staff are visible to
-- their school, and the school is visible to Special Miles. This makes the
-- first link real, and the Platform Admin screen makes the second one usable.
--
-- A PLATFORM ADMIN CAN STILL SEE THEIR OWN. That is deliberate and it is the
-- honest limit of this design: somebody has to be at the top, and here that is
-- Special Miles. What constrains them is that their administrative actions
-- are written to admin_audit_events by functions they cannot bypass, not that
-- another layer is watching.

begin;

drop policy if exists student_access_events_select on public.student_access_events;
create policy student_access_events_select
  on public.student_access_events for select to authenticated
  using (
    public.is_platform_admin()
    or (
      public.is_school_admin()
      and public.can_view_student(student_id)
      -- The change. A school admin sees the staff they are responsible for,
      -- and not themselves.
      and actor_id <> auth.uid()
    )
  );

commit;

-- ---------------------------------------------------------------------------
-- Check it worked, from the BROWSER CONSOLE as a school admin, after opening
-- a student record so there is something of your own to find:
--
--   await supabase.from('student_access_events').select('actor_id')
--
-- Rows for other staff, and none where actor_id is your own id.
-- ---------------------------------------------------------------------------
