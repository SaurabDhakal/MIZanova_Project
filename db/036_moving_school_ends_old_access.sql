-- ===========================================================================
-- 036_moving_school_ends_old_access.sql — changing school must end the old one
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHAT WAS WRONG WITH db/035.
--
-- `redeem_invitation` set the profile's school, role and verification, and
-- stopped there. It left `student_educators` alone.
--
-- Those rows are what `is_assigned_staff_for()` reads, and that function does
-- not look at anybody's school — it only asks whether a link exists between
-- this person and this child. So:
--
--   A teacher assigned to eleven children at St Paul's accepts an invitation
--   from Rosebank. Their profile now says Rosebank. Their eleven assignment
--   rows still say St Paul's, and every one of them still passes
--   is_assigned_staff_for. They can read behaviour logs, goals, IEP documents
--   and specialist sessions for eleven children at a school they have left.
--
-- Nothing on any screen would show it. St Paul's Directory & Access would still
-- list them, and their new school's administrator has no reason to look.
--
-- This is the accountability chain the whole product rests on failing quietly:
-- the school that is answerable for those children no longer employs the person
-- reading their records.
--
-- ---------------------------------------------------------------------------
-- THE FIX, and the limit of it
-- ---------------------------------------------------------------------------
-- Accepting an invitation to a DIFFERENT school ends every assignment to a
-- child who is not at the new one. Staying at the same school changes nothing —
-- an administrator re-inviting a colleague to correct their role must not wipe
-- their caseload.
--
-- THIS IS A CONSEQUENCE OF ONE SCHOOL PER PERSON. `profiles.school_id` is a
-- single column, so a specialist genuinely working across four schools cannot
-- be represented, and the honest behaviour under that model is to end the old
-- access rather than pretend the person is in two places. When memberships
-- arrive (docs/11 §2) this becomes "end THIS membership", and cross-school work
-- becomes possible for the first time. The comment stays until then so nobody
-- reads the delete below as an opinion about specialists.

begin;

create or replace function public.redeem_invitation(
  p_token_hash text,
  p_profile_id uuid
)
returns table (school_id uuid, role public.user_role)
language plpgsql
security definer
set search_path = public
as $$
declare
  inv       public.invitations%rowtype;
  old_school uuid;
  ended     integer := 0;
begin
  select * into inv
    from public.invitations
   where token_hash = p_token_hash
     for update;

  if not found then
    raise exception 'That invitation is not valid.' using errcode = '22023';
  end if;
  if inv.revoked_at is not null then
    raise exception 'That invitation has been withdrawn.' using errcode = '22023';
  end if;
  if inv.accepted_at is not null then
    raise exception 'That invitation has already been used.' using errcode = '22023';
  end if;
  if inv.expires_at < now() then
    raise exception 'That invitation has expired. Ask for a new one.'
      using errcode = '22023';
  end if;

  select p.school_id into old_school
    from public.profiles p
   where p.id = p_profile_id;

  update public.invitations
     set accepted_at = now(), accepted_by = p_profile_id
   where id = inv.id;

  -- VERIFIED ON ACCEPTANCE. The administrator already said this person works
  -- here; making them wait in a queue afterwards asks the same question twice.
  update public.profiles
     set school_id   = inv.school_id,
         role        = inv.role,
         is_verified = true
   where id = p_profile_id;

  -- Moving school ends access to the children left behind. See the header.
  if old_school is distinct from inv.school_id then
    with removed as (
      delete from public.student_educators se
       where se.profile_id = p_profile_id
         and se.student_id in (
           select s.id from public.students s
            where s.school_id is distinct from inv.school_id
         )
      returning 1
    )
    select count(*) into ended from removed;

    if ended > 0 then
      -- Somebody should be able to see that this happened, and to whom.
      insert into public.admin_audit_events
        (actor_id, action, subject_id, subject_label, detail)
      values (
        p_profile_id,
        'staff_moved_school',
        p_profile_id,
        (select full_name from public.profiles where id = p_profile_id),
        format(
          'Accepted an invitation to a different school. %s student assignment(s) at the previous school were ended.',
          ended
        )
      );
    end if;
  end if;

  return query select inv.school_id, inv.role;
end;
$$;

revoke all on function public.redeem_invitation(text, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_invitation(text, uuid) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Is anyone in this state right now? Run this before assuming not.
--
-- Staff holding an assignment to a child at a school they do not belong to:
--
--   select p.full_name, p.role, sc.name as their_school, s2.name as childs_school
--   from public.student_educators se
--   join public.profiles p  on p.id = se.profile_id
--   join public.students  st on st.id = se.student_id
--   join public.schools   s2 on s2.id = st.school_id
--   left join public.schools sc on sc.id = p.school_id
--   where p.school_id is distinct from st.school_id;
--
-- Any row is somebody reading records at a school that does not employ them.
-- Delete the assignment, do not change the profile.
-- ---------------------------------------------------------------------------
