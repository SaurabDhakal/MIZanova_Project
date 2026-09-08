-- ---------------------------------------------------------------------------
-- 116 — A school sets its own sharing policy
-- ---------------------------------------------------------------------------
-- FR15: "Admins must be able to toggle Auto-share and Parent Invite settings
-- at the school level." Neither exists under any spelling — grep for
-- auto_share, autoShare, parent_invite or invite_policy returns the empty set.
--
-- Today both decisions are made one row at a time by whoever happens to be in
-- front of the screen. A teacher ticks "share this with the family" per log; a
-- school administrator issues a guardian code per child. Nothing at the school
-- level says what this school's practice IS, which is the thing a principal
-- signs off and the thing an auditor asks about.
--
-- ---------------------------------------------------------------------------
-- AUTO-SHARE IS A TRIGGER, AND IT CAN ONLY EVER SAY YES
-- ---------------------------------------------------------------------------
-- A column default cannot do this: the answer depends on the school, and
-- `behaviour_logs` has no school column — it reaches one through the student.
-- So it is a BEFORE INSERT trigger, and it is written to be incapable of the
-- dangerous direction:
--
--   auto-share ON   and the log is not flagged  →  shared_with_parents = true
--   anything else                               →  left exactly as it arrived
--
-- It never sets the flag back to false. A school that turns auto-share off
-- stops new logs being shared automatically; it does not retract what families
-- have already been told, which would be the product deciding to un-tell
-- somebody something on a policy change.
--
-- ---------------------------------------------------------------------------
-- AND IT REFUSES TO AUTO-SHARE A FLAGGED INCIDENT
-- ---------------------------------------------------------------------------
-- This is the clause that matters. FR14 says "critical incidents must be
-- locked until reviewed and approved by the admin", and db/010 builds that as
-- a safeguarding queue a lead acknowledges. An auto-share that ignored
-- `is_risk_flagged` would send exactly those incidents to a family the instant
-- a teacher pressed save — before the lead had read it, and possibly before
-- anybody had decided whether the family is who the child needs protecting
-- from.
--
-- Two requirements from the same document would have collided silently, in the
-- direction that hurts a child. A flagged log is never auto-shared; a human
-- shares it deliberately or not at all.
--
-- ---------------------------------------------------------------------------
-- PARENT INVITE IS CHECKED WHERE CODES ARE MADE
-- ---------------------------------------------------------------------------
-- Not on `invitations`. `issue_invitation` refuses the parent role outright —
-- families arrive through `guardian_access_codes` (db/037), which is a
-- different table with a different function. Gating the wrong one would have
-- produced a switch that looked authoritative and changed nothing, which is
-- the failure this codebase names most often.
--
-- Rebuilt from db/037's live body. `npm run sql-supersessions` says
-- `issue_guardian_code` is defined once; `redeem_guardian_code` is the one in
-- that file that has moved on to db/043, and this does not touch it.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Two settings, defaulted to what every school does today
-- ---------------------------------------------------------------------------
-- Auto-share defaults OFF because that is the current behaviour: db/005
-- defaults `shared_with_parents` to false and a teacher opts in per log.
-- Turning this on for existing schools would change what families see, from a
-- migration, without anybody choosing it.
--
-- Parent invite defaults ON for the same reason in the other direction: every
-- school can issue guardian codes today, and defaulting it off would silently
-- break the linking flow for all of them.
-- ---------------------------------------------------------------------------
alter table public.organisations
  add column if not exists auto_share_updates boolean not null default false;
alter table public.organisations
  add column if not exists parent_invite_enabled boolean not null default true;

comment on column public.organisations.auto_share_updates is
  'FR15. When true, a behaviour log is shared with the family as it is written '
  '— unless it is risk-flagged, which is never auto-shared. Off by default '
  'because that is what every school did before this column existed.';
comment on column public.organisations.parent_invite_enabled is
  'FR15. When false, no new guardian access code may be issued at this school. '
  'Codes already issued still redeem: withdrawing a code somebody is holding '
  'is a different decision from stopping new ones.';


-- ---------------------------------------------------------------------------
-- 2. Auto-share, at the moment the log is written
-- ---------------------------------------------------------------------------
create or replace function public.behaviour_logs_apply_auto_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto boolean;
begin
  -- Already shared by whoever wrote it. Nothing to add.
  if new.shared_with_parents then
    return new;
  end if;

  -- THE SAFEGUARDING CLAUSE. See the header: FR14's lock and FR15's
  -- convenience would otherwise collide, and this is the side that wins.
  if new.is_risk_flagged then
    return new;
  end if;

  select o.auto_share_updates into v_auto
  from public.students s
  join public.organisations o on o.id = s.school_id
  where s.id = new.student_id;

  if coalesce(v_auto, false) then
    new.shared_with_parents := true;
  end if;

  return new;
end;
$$;

drop trigger if exists behaviour_logs_auto_share on public.behaviour_logs;
create trigger behaviour_logs_auto_share
  before insert on public.behaviour_logs
  for each row execute function public.behaviour_logs_apply_auto_share();


-- ---------------------------------------------------------------------------
-- 3. No new guardian code while the school has invites off
-- ---------------------------------------------------------------------------
-- db/037's body, unchanged apart from the check at the top.
-- ---------------------------------------------------------------------------
create or replace function public.issue_guardian_code(
  p_student_id   uuid,
  p_email        text,
  p_relationship text,
  p_code_hash    text,
  p_issued_by    uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not exists (
    select 1
    from public.students s
    join public.organisations o on o.id = s.school_id
    where s.id = p_student_id
      and o.parent_invite_enabled
  ) then
    raise exception
      'This school has family invitations switched off. A school administrator can turn them back on in Settings.'
      using errcode = '42501';
  end if;

  update public.guardian_access_codes
     set revoked_at = now(), revoked_by = p_issued_by
   where student_id = p_student_id
     and lower(guardian_email) = lower(btrim(p_email))
     and redeemed_at is null
     and revoked_at is null;

  insert into public.guardian_access_codes
    (student_id, guardian_email, relationship, code_hash, issued_by)
  values
    (p_student_id, p_email, p_relationship, p_code_hash, p_issued_by)
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.issue_guardian_code(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.issue_guardian_code(uuid, text, text, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. The view has to carry them, and this is the third time
-- ---------------------------------------------------------------------------
-- `schools` is a security_invoker view over `organisations`, and every screen
-- reads it rather than the table. A column added to the table and not to the
-- view simply does not exist as far as the product is concerned — no error, no
-- symptom, just a setting that never loads.
--
-- db/042 left `kind` behind. db/067 exists solely because `abn` was left
-- behind after that. Adding a column here without this block would have been
-- the same mistake a third time, in the same file that quotes the second one.
--
-- `security_invoker` is restated because `create or replace view` drops
-- options that are not repeated, and losing it means every school admin reads
-- every school — which is what db/055 did on a different view.
-- ---------------------------------------------------------------------------
create or replace view public.schools
with (security_invoker = true) as
select
  id,
  name,
  suburb,
  state,
  timezone,
  kind,
  status,
  created_at,
  updated_at,
  abn,
  auto_share_updates,
  parent_invite_enabled
from public.organisations;

-- PostgREST caches the shape. Without this the two new columns 404 from the
-- browser until something else happens to reload it — every apply script here
-- does this for the same reason.
notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   update public.organisations set auto_share_updates = true where id = '<a school>';
--
-- Then, as an assigned teacher at that school, write two logs:
--
--   ...one ordinary            → shared_with_parents comes back TRUE
--   ...one with is_risk_flagged → shared_with_parents comes back FALSE
--
-- The second is the assertion that matters. Turn the setting off again and a
-- new log is false; the two already written do not change.
--
-- And the other switch:
--
--   update public.organisations set parent_invite_enabled = false where id = '<a school>';
--   select public.issue_guardian_code('<a child there>', 'a@b.test', 'parent', 'x', '<admin>');
--   -- raises 42501, and issues nothing.
--
-- db/verify.sql: organisations gains two columns; no policy count changes.
-- ---------------------------------------------------------------------------
