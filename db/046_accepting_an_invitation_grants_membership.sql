-- ===========================================================================
-- 046_accepting_an_invitation_grants_membership.sql — the dead staff account
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- FIXES A LIVE DEFECT. Since db/039, accepting an invitation has produced an
-- account that can do nothing at all.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS HAPPENING
-- ---------------------------------------------------------------------------
-- db/039 split identity in two. `memberships` is what you MAY be; `profiles`
-- is what you currently ARE. `my_role()` was tightened at the same time, so it
-- now returns a role only when a LIVE MEMBERSHIP backs it — which is the whole
-- security win of that migration: ending somebody's membership ends their
-- access on the next request, rather than leaving a role set once and trusted
-- forever.
--
-- `redeem_invitation` was written before any of that, and was never taught the
-- second half. It set profiles.role, profiles.school_id and is_verified, and
-- stopped. So an invited teacher accepted, was told they were verified, signed
-- in — and every policy in the database asked `my_role()`, which found no
-- membership and answered NULL.
--
-- Measured, not guessed. Inviting an educator to a real school, accepting, and
-- signing in as them:
--
--     profile after accepting: role 'educator', school_id set, is_verified true
--     live memberships:        0
--     my_role():               null
--     my_school_id():          null
--     students visible:        0
--
-- ---------------------------------------------------------------------------
-- WHY NOBODY NOTICED
-- ---------------------------------------------------------------------------
-- db/039 backfilled a membership for every staff profile that already existed,
-- so everybody who had accepted an invitation BEFORE that migration was
-- repaired by it. The only people affected are the ones who accept AFTER —
-- which, so far, is nobody, because the last acceptance predates db/039 by a
-- day.
--
-- The suite passed throughout. `onboarding.test.ts` asserted that acceptance
-- set school_id, role and is_verified — three true statements about a row, and
-- not one of them the thing an invitation promises. The promise is "you can now
-- do your job", and nothing asked whether that had become true.
--
-- This is the same fault as the other eight, in its ninth disguise: the test
-- checked what was written, not what it was written FOR. The test added
-- alongside this signs in as the invited person and asks them what they can
-- see, which is the only question that was ever worth asking.
--
-- ---------------------------------------------------------------------------
-- THE FIX
-- ---------------------------------------------------------------------------
-- Acceptance now grants the membership, in the same transaction that sets the
-- profile. Those two facts were never independent — one is what you may be,
-- the other is which of those you are right now, and an invitation creates both
-- at once.
-- ===========================================================================

begin;

/*
 * REBUILT FROM db/036's VERSION, NOT db/035's.
 *
 * The first draft of this file rebuilt the function from db/035 and silently
 * deleted db/036 — the half that ends a teacher's assignments at the school
 * they have just left. `create or replace` replaces the WHOLE function, so
 * reinstating an old body is a way to undo a fix nobody remembers making. The
 * regression test for db/036 caught it, which is exactly what it was for.
 *
 * Anything that replaces this function again must carry all three parts:
 * validate the invitation, grant the membership, and release the children left
 * behind.
 */
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
  inv        public.invitations%rowtype;
  old_school uuid;
  ended      integer := 0;
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

  -- Read BEFORE the profile moves, or there is nothing to compare against.
  select p.school_id into old_school
    from public.profiles p
   where p.id = p_profile_id;

  update public.invitations
     set accepted_at = now(), accepted_by = p_profile_id
   where id = inv.id;

  /*
   * WHAT THEY MAY BE — new in db/046, and the reason this file exists.
   *
   * Without this row `my_role()` returns null and the account is inert. It is
   * written in the same transaction as the profile update below so the two
   * cannot be observed apart: any transaction that leaves a staff profile
   * pointing at a school also leaves the membership that makes it mean
   * something.
   *
   * THE OLD MEMBERSHIP IS DELIBERATELY LEFT ALONE. db/036 ends the person's
   * assignments at the school they came from, and that stays exactly as it
   * was. It does not end their membership there, because since db/039 a person
   * may legitimately hold several — a specialist working across three schools
   * is the model, not an edge case — and an invitation cannot tell "I have
   * moved" from "I now also work here". They keep a membership they can switch
   * back to, and no children under it. If Special Miles decides an invitation
   * should mean "moved", that is a product decision and belongs in its own
   * script with its own test.
   *
   * NO COLUMN LIST ON THE CONFLICT CLAUSE, and it is not a shortcut.
   * `on conflict (profile_id, organisation_id, role) where ended_at is null`
   * names the partial unique index exactly, and fails at runtime with 42702,
   * "column reference role is ambiguous" — because `role` is also one of this
   * function's OUT parameters, and inside plpgsql that name means both things.
   * The bare form references no columns, so there is nothing to be ambiguous
   * about, and `memberships_one_live` still catches the conflict.
   */
  insert into public.memberships (profile_id, organisation_id, role, invited_by)
  values (p_profile_id, inv.school_id, inv.role, inv.invited_by)
  on conflict do nothing;

  -- WHAT THEY ARE RIGHT NOW, and the active context: somebody invited to a
  -- second school lands there, which is what pressing the link in that
  -- school's email means.
  --
  -- VERIFIED ON ACCEPTANCE. The administrator already said this person works
  -- here; making them wait in a queue afterwards asks the same question twice.
  update public.profiles
     set school_id   = inv.school_id,
         role        = inv.role,
         is_verified = true
   where id = p_profile_id;

  -- Moving school ends access to the children left behind — db/036, unchanged.
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


-- ---------------------------------------------------------------------------
-- Repair anybody already caught by this
-- ---------------------------------------------------------------------------
-- Idempotent, and expected to affect nothing on the current database — the last
-- acceptance predates db/039. It is here because this script will be run on a
-- database that has been live for a while, and "expected to affect nothing" is
-- not the same as "will".
insert into public.memberships (profile_id, organisation_id, role, started_at)
select p.id, p.school_id, p.role, coalesce(p.created_at, now())
from public.profiles p
where p.school_id is not null
  and p.role in ('educator', 'specialist', 'school_admin')
  and not exists (
    select 1 from public.memberships m
    where m.profile_id = p.id
      and m.organisation_id = p.school_id
      and m.role = p.role
      and m.ended_at is null
  )
on conflict do nothing;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
-- This must return 0 — every staff profile pointing at a school now has the
-- membership that makes that pointer mean something:
--
--   select count(*)
--     from public.profiles p
--    where p.school_id is not null
--      and p.role in ('educator', 'specialist', 'school_admin')
--      and not exists (
--        select 1 from public.memberships m
--         where m.profile_id = p.id
--           and m.organisation_id = p.school_id
--           and m.role = p.role
--           and m.ended_at is null);
--
-- The real check is the test: accept an invitation, sign in as that person,
-- and ask them what they can see. See tests/rls/onboarding.test.ts.
