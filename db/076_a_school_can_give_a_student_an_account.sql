-- ===========================================================================
-- 076_a_school_can_give_a_student_an_account.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: db/074 ADDED A ROLE NOBODY COULD BE GIVEN
-- ---------------------------------------------------------------------------
-- db/074 created the `student` role, the `profile_id` link and the two-key
-- rule, and then said so in its own footer: "nothing creates a student account
-- yet ... until that exists, `profile_id` is set by hand."
--
-- So the role worked and was unreachable. This is the control.
--
-- ---------------------------------------------------------------------------
-- IT REUSES INVITATIONS RATHER THAN INVENTING A SECOND WAY IN
-- ---------------------------------------------------------------------------
-- db/035 already solved this problem for staff, and its solution is careful in
-- ways worth inheriting rather than re-deriving: the token is generated on the
-- server, stored hashed, shown once, single use, expiring, and revocable.
--
-- A separate mechanism for students would be a second door to the same
-- building, and the second door is always the one nobody remembers to lock.
--
-- ---------------------------------------------------------------------------
-- AN INVITATION NOW NAMES A CHILD, AND ONLY FOR THIS ROLE
-- ---------------------------------------------------------------------------
-- A staff invitation says "a teacher at this school". A student invitation has
-- to say WHICH student, or redeeming it could not know which record to link.
--
-- `student_id` is therefore nullable and constrained BOTH ways: a student
-- invitation must have one, and any other invitation must not. Half of that
-- pair is the interesting half — without it, a `school_admin` invitation
-- carrying a student id would look harmless and would be a way to attach a
-- staff account to a child record.
--
-- ---------------------------------------------------------------------------
-- REDEEMING CREATES THE ACCOUNT. IT DOES NOT OPEN IT.
-- ---------------------------------------------------------------------------
-- db/074 needs TWO keys: the school links the profile, and a guardian consents.
-- This file turns the first key only. A student who accepts an invitation gets
-- an account that signs in and shows them nothing at all until a guardian
-- grants `student_portal_access`.
--
-- That is the correct order and not an oversight. The school arranging an
-- account is an administrative act; the family agreeing is a decision, and a
-- decision that arrives second cannot be assumed by the first.
--
-- ---------------------------------------------------------------------------
-- WHAT AN INVITATION STILL CANNOT DO
-- ---------------------------------------------------------------------------
-- Create a platform administrator, and now also create a parent. Both stay off
-- the list. db/035's own words: "Special Miles staff are made deliberately, by
-- a human with database access, and there is no email in the world that should
-- be able to change that."
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. An invitation may name a student, and may grant the student role
-- ---------------------------------------------------------------------------
alter table public.invitations
  add column if not exists student_id uuid
    references public.students(id) on delete cascade;

-- `on delete cascade` rather than set null: an invitation to be a child who no
-- longer exists is not an invitation to anything, and leaving it valid with a
-- null student would let it redeem into a linkless student account.

alter table public.invitations
  drop constraint if exists invitations_role_check;

alter table public.invitations
  add constraint invitations_role_check
  check (role in ('educator', 'specialist', 'school_admin', 'student'));

alter table public.invitations
  drop constraint if exists invitations_student_only_for_students;

-- Both directions. The second half is the one that matters: a staff invitation
-- carrying a student id would be a way to attach a teacher's account to a
-- child record, and it would look like a typo rather than an attack.
alter table public.invitations
  add constraint invitations_student_only_for_students
  check (
    (role = 'student' and student_id is not null)
    or (role <> 'student' and student_id is null)
  );


-- ---------------------------------------------------------------------------
-- 2. Issuing one
-- ---------------------------------------------------------------------------
-- Reproduced whole. `create or replace function` replaces the entire body, and
-- rebuilding one from memory is how db/046 silently deleted db/036's work — so
-- this is db/035's function with the role list widened and the student checks
-- added, and nothing else changed.
-- ---------------------------------------------------------------------------
-- THE OLD SIGNATURE IS DROPPED FIRST, AND THIS IS NOT TIDINESS.
--
-- `create or replace function` matches on the argument list. Adding
-- `p_student_id` makes this a DIFFERENT function, so the five-argument version
-- from db/035 would survive alongside it — still callable, still granted to
-- service_role, and still willing to issue invitations without any of the
-- checks below. An overload is the quietest way to leave a door open: nothing
-- errors, and the old path keeps working exactly as it always did.
drop function if exists public.issue_invitation(
  uuid, text, public.user_role, text, uuid
);

create or replace function public.issue_invitation(
  p_school_id  uuid,
  p_email      text,
  p_role       public.user_role,
  p_token_hash text,
  p_invited_by uuid,
  p_student_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_school  uuid;
begin
  if p_role not in ('educator', 'specialist', 'school_admin', 'student') then
    raise exception 'An invitation cannot grant %', p_role
      using errcode = '42501';
  end if;

  if p_role = 'student' then
    if p_student_id is null then
      raise exception 'A student invitation must say which student it is for.'
        using errcode = '22023';
    end if;

    -- THE CHILD MUST BE AT THE SCHOOL DOING THE INVITING. Without this, an
    -- administrator at one school could issue an account for a child at
    -- another — the same cross-tenant hole db/035's own comments worry about
    -- for staff, and easier to miss here because the id is just a uuid.
    select s.school_id into v_school
    from public.students s where s.id = p_student_id;

    if v_school is distinct from p_school_id then
      raise exception 'That student is not at this school.'
        using errcode = '42501';
    end if;

    -- One live account per child. db/074's unique index would refuse the
    -- second link anyway, but it would refuse it at REDEMPTION — after
    -- somebody had been sent a link and tried to use it.
    if exists (
      select 1 from public.students s
      where s.id = p_student_id and s.profile_id is not null
    ) then
      raise exception 'That student already has an account.'
        using errcode = '23505';
    end if;
  elsif p_student_id is not null then
    raise exception 'Only a student invitation names a student.'
      using errcode = '22023';
  end if;

  insert into public.invitations
    (school_id, email, role, token_hash, invited_by, student_id)
  values
    (p_school_id, lower(btrim(p_email)), p_role, p_token_hash, p_invited_by,
     p_student_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.issue_invitation(uuid, text, public.user_role, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.issue_invitation(uuid, text, public.user_role, text, uuid, uuid)
  to service_role;


-- ---------------------------------------------------------------------------
-- 3. Redeeming one
-- ---------------------------------------------------------------------------
-- TAKEN FROM db/046 VERBATIM, and the first attempt at this file did not.
--
-- It was rebuilt from db/035 instead, which is the ANCESTOR of the live
-- function rather than the live function. `create or replace` replaces the
-- whole body, so that silently deleted two later fixes:
--
--   db/046  the membership insert. Without it `my_role()` returns null and an
--           accepted invitation produces an account that can do nothing — the
--           exact defect db/046 exists to fix, reintroduced.
--   db/036  ending a person's student assignments at the school they came
--           from, and the audit entry recording it.
--
-- The suite caught both, in the file that tests them. This is the hazard db/046
-- warns about in its own header and the one this project has now hit twice:
-- reproducing a function means copying what is CURRENTLY THERE, not what
-- created it. The only edit below is the student block.
-- ---------------------------------------------------------------------------
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
  -- STAFF ONLY. `memberships.role` lists the staff roles and refuses
  -- 'student', which is correct: a membership means "may act in this capacity
  -- at this organisation", and a student's link to their school is
  -- `students.school_id`. Without this guard, redeeming a student invitation
  -- fails on the check constraint — see db/077, which is where that was found.
  if inv.role <> 'student' then
    insert into public.memberships (profile_id, organisation_id, role, invited_by)
    values (p_profile_id, inv.school_id, inv.role, inv.invited_by)
    on conflict do nothing;
  end if;

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

  -- THE FIRST OF db/074'S TWO KEYS — db/076. The account is now linked to the
  -- child; it still shows nothing until a guardian grants
  -- student_portal_access, which nothing here can do.
  if inv.role = 'student' then
    update public.students
       set profile_id = p_profile_id
     where id = inv.student_id
       and profile_id is null;

    if not found then
      raise exception 'That student already has an account.'
        using errcode = '23505';
    end if;
  end if;

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

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.invitations'::regclass and contype = 'c';
--   -- role list includes 'student'; the student_id pairing constraint exists
--
-- The pairing, both ways. Both of these must fail:
--
--   insert into public.invitations (school_id, email, role, token_hash)
--   values ('<school>', 'a@b.c', 'student', 'x');          -- no student named
--
--   insert into public.invitations (school_id, email, role, token_hash, student_id)
--   values ('<school>', 'a@b.c', 'educator', 'y', '<child>');  -- staff naming a child
--
-- And the cross-school check:
--
--   select public.issue_invitation('<school A>', 'a@b.c', 'student', 'z',
--                                  '<admin>', '<child at school B>');
--   -- must fail 42501
--
-- And there must be exactly ONE issue_invitation, not two:
--
--   select count(*) from pg_proc where proname = 'issue_invitation';  -- 1
--
-- STILL TRUE AFTER THIS FILE: an account created here sees NOTHING until a
-- guardian grants student_portal_access. That is db/074's second key and it is
-- deliberately not turned by anything in this migration.
-- ---------------------------------------------------------------------------
