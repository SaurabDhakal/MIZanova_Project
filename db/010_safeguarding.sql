-- ===========================================================================
-- MiZanova — 010_safeguarding.sql
-- The safeguarding queue and the admin lock (FR14).
--
-- Design reference: docs/Figma Pages Design/Safeguarding & Compliance Hub.png
--
-- Run 001-009 first. SAFE TO RUN TWICE.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Acknowledgement fields on behaviour_logs
-- ---------------------------------------------------------------------------
-- A flag nobody sees is not a safeguard. These record that a responsible adult
-- looked at a flagged incident, who they were, and what they decided.
alter table public.behaviour_logs
  add column if not exists safeguarding_acknowledged_at timestamptz;

alter table public.behaviour_logs
  add column if not exists safeguarding_acknowledged_by uuid
    references public.profiles(id) on delete set null;

alter table public.behaviour_logs
  add column if not exists safeguarding_note text;

-- The queue itself: flagged and not yet acknowledged, oldest first. Partial,
-- so it stays small no matter how many logs exist.
create index if not exists behaviour_logs_safeguarding_queue_idx
  on public.behaviour_logs (occurred_at)
  where is_risk_flagged and safeguarding_acknowledged_at is null;


-- ---------------------------------------------------------------------------
-- 2. THE ADMIN LOCK (FR14)
-- ---------------------------------------------------------------------------
-- Once an administrator has acknowledged a flagged incident, the teacher who
-- wrote it can no longer edit it.
--
-- This is the point of the requirement. A safeguarding record that the person
-- who wrote it can quietly revise after an administrator has read it is not
-- evidence of anything. The teacher keeps full control right up until a
-- responsible adult formally looks at it, and not one moment after.
--
-- Administrators can still edit — someone has to be able to correct a genuine
-- error — and every edit moves updated_at, so a change is visible.
--
-- This REPLACES the update policy from 004/005.
drop policy if exists behaviour_logs_update on public.behaviour_logs;
create policy behaviour_logs_update
  on public.behaviour_logs for update to authenticated
  using (
    (logged_by = auth.uid() and safeguarding_acknowledged_at is null)
    or public.is_platform_admin()
    or (public.is_school_admin() and public.can_staff_view_student(student_id))
  )
  with check (
    (logged_by = auth.uid() and safeguarding_acknowledged_at is null)
    or public.is_platform_admin()
    or (public.is_school_admin() and public.can_staff_view_student(student_id))
  );


-- ---------------------------------------------------------------------------
-- 3. Let a school admin flag or unflag an incident
-- ---------------------------------------------------------------------------
-- Covered by the policy above; no extra policy needed. Noted here because it
-- is a deliberate capability, not an oversight: the AI flags what it notices,
-- and a human decides whether it belongs in the queue.


-- ---------------------------------------------------------------------------
-- 4. School-wide counts a school admin can actually see
-- ---------------------------------------------------------------------------
-- A plain view over behaviour_logs, so RLS on the underlying table still
-- applies — a security invoker view does not become a hole. An educator
-- querying this sees only their own students' numbers; a school admin sees
-- their whole school. Same view, different answers.
create or replace view public.school_activity_summary
with (security_invoker = true) as
select
  s.school_id,
  count(*)                                                   as total_logs,
  count(*) filter (where b.occurred_at > now() - interval '7 days')
                                                             as logs_last_7_days,
  count(*) filter (where b.is_risk_flagged)                  as flagged_total,
  count(*) filter (where b.is_risk_flagged
                     and b.safeguarding_acknowledged_at is null)
                                                             as flagged_open,
  min(b.occurred_at) filter (where b.is_risk_flagged
                               and b.safeguarding_acknowledged_at is null)
                                                             as oldest_open_at
from public.behaviour_logs b
join public.students s on s.id = b.student_id
group by s.school_id;

revoke all on public.school_activity_summary from anon;
grant select on public.school_activity_summary to authenticated;


-- ---------------------------------------------------------------------------
-- Done. No new tables. db/verify.sql: policy count stays at 47 (the update
-- policy was replaced, not added).
-- ---------------------------------------------------------------------------
