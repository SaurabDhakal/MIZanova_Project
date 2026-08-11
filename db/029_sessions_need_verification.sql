-- ===========================================================================
-- 029_sessions_need_verification.sql — close a gap left open by 028
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHAT WAS WRONG.
--
-- Every policy in 028 asked `is_assigned_staff_for(student_id)` and stopped
-- there. That function answers one question — is there a row in
-- student_educators linking this person to this child — and nothing else.
--
-- It does NOT ask whether the school has verified them. db/013 added that
-- gate to `can_staff_view_student`, and every policy that calls it inherited
-- the check: behaviour logs, AI strategies, home observations, goals, IEP
-- documents, the safeguarding queue. 028 did not call it, deliberately —
-- `can_staff_view_student` also admits school administrators, who must not
-- reach these tables — and in routing around that, it routed around
-- verification too.
--
-- The result was the wrong way up. An unverified teacher assigned to a child
-- could not read a behaviour log about them, but COULD read a shared therapy
-- session. An unverified specialist could write clinical notes about a child
-- they had never been confirmed as qualified to see. The most sensitive table
-- in the product had the weakest gate in it.
--
-- Nobody would have noticed from the screens. Verification is invisible to the
-- person who has it, and an unverified account looks the same until it is
-- refused something. Found by tests/rls/specialist-sessions.test.ts, which
-- asserted the gate applied here and discovered it did not.
--
-- THE FIX is `am_i_verified() and is_assigned_staff_for(...)` — the two halves
-- of `can_staff_view_student` that apply, without the school-admin branch that
-- does not.
--
-- GUARDIANS ARE UNCHANGED, and that is deliberate. db/013 put the guardian
-- branch outside the verification condition on purpose: a parent's access to
-- their own child is not conditional on the school having checked their
-- identity documents. That reasoning holds here.

begin;

-- ---------------------------------------------------------------------------
-- specialist_sessions
-- ---------------------------------------------------------------------------

-- The specialist carrying this child. Now: a VERIFIED specialist.
drop policy if exists specialist_sessions_select_specialist on public.specialist_sessions;
create policy specialist_sessions_select_specialist
  on public.specialist_sessions for select to authenticated
  using (
    public.my_role() = 'specialist'
    and public.am_i_verified()
    and public.is_assigned_staff_for(student_id)
  );

-- An assigned teacher, once the session has been shared with them.
drop policy if exists specialist_sessions_select_teacher on public.specialist_sessions;
create policy specialist_sessions_select_teacher
  on public.specialist_sessions for select to authenticated
  using (
    shared_with_teacher
    and public.my_role() = 'educator'
    and public.am_i_verified()
    and public.is_assigned_staff_for(student_id)
  );

drop policy if exists specialist_sessions_insert on public.specialist_sessions;
create policy specialist_sessions_insert
  on public.specialist_sessions for insert to authenticated
  with check (
    public.my_role() = 'specialist'
    and public.am_i_verified()
    and public.is_assigned_staff_for(student_id)
    and specialist_id = auth.uid()
  );

-- Authorship alone is no longer enough to revise a record. If a school
-- withdraws someone's verification, the sessions they already wrote stop being
-- editable by them — which is the point of withdrawing it.
drop policy if exists specialist_sessions_update on public.specialist_sessions;
create policy specialist_sessions_update
  on public.specialist_sessions for update to authenticated
  using (specialist_id = auth.uid() and public.am_i_verified())
  with check (specialist_id = auth.uid() and public.am_i_verified());

-- ---------------------------------------------------------------------------
-- specialist_session_notes
-- ---------------------------------------------------------------------------

drop policy if exists session_notes_select on public.specialist_session_notes;
create policy session_notes_select
  on public.specialist_session_notes for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.specialist_sessions s
      where s.id = session_id
        and public.my_role() = 'specialist'
        and public.am_i_verified()
        and public.is_assigned_staff_for(s.student_id)
    )
  );

drop policy if exists session_notes_write on public.specialist_session_notes;
create policy session_notes_write
  on public.specialist_session_notes for all to authenticated
  using (
    public.am_i_verified()
    and exists (
      select 1 from public.specialist_sessions s
      where s.id = session_id and s.specialist_id = auth.uid()
    )
  )
  with check (
    public.am_i_verified()
    and exists (
      select 1 from public.specialist_sessions s
      where s.id = session_id and s.specialist_id = auth.uid()
    )
  );

commit;

-- ---------------------------------------------------------------------------
-- Who does this lock out right now?
--
-- Run this before assuming nothing changed. Anyone listed carries a caseload
-- and has never been verified — they could write clinical notes until now, and
-- cannot from this moment.
--
--   select p.id, p.first_name, p.last_name, p.role, s.name as school
--   from public.profiles p
--   join public.student_educators se on se.profile_id = p.id
--   left join public.schools s on s.id = p.school_id
--   where p.role in ('specialist','educator')
--     and coalesce(p.is_verified, false) = false
--   group by p.id, p.first_name, p.last_name, p.role, s.name;
--
-- Verify someone from the Platform Admin → Verification screen, or by hand:
--   update public.profiles set is_verified = true where id = '...';
-- ---------------------------------------------------------------------------
