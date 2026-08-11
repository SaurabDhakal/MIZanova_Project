-- ===========================================================================
-- MiZanova — 012_governance.sql
-- Platform Admin controls: AI governance with an audit trail, and teacher
-- verification (FR18, FR20, FR21).
--
-- Run 001-011 first. SAFE TO RUN TWICE.
-- ===========================================================================
--
-- A locked scope decision says the admin screens are "simplified but real":
-- a real kill switch, a real audit log, no invented metrics. This file is what
-- makes that true. Every change to the AI controls must carry a written reason
-- and is recorded permanently — a toggle with no accountability attached is
-- decoration.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The audit trail
-- ---------------------------------------------------------------------------
-- ai_controls holds one row and therefore no history: after a change, the
-- previous state is gone. This table is the history, written by a trigger so
-- nothing can change the controls without leaving a record.
create table if not exists public.ai_control_events (
  id                   uuid primary key default gen_random_uuid(),
  changed_by           uuid references public.profiles(id) on delete set null,
  changed_at           timestamptz not null default now(),

  was_enabled          boolean,
  now_enabled          boolean,
  was_threshold        numeric(3,2),
  now_threshold        numeric(3,2),

  reason               text not null
);

create index if not exists ai_control_events_time_idx
  on public.ai_control_events (changed_at desc);


-- ---------------------------------------------------------------------------
-- 2. A reason is not optional
-- ---------------------------------------------------------------------------
-- Enforced in the database rather than in the form. A rule that lives only in
-- the UI is a rule that a script, a future screen, or the SQL editor ignores.
create or replace function public.record_ai_control_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_change_reason is null
     or btrim(new.last_change_reason) = '' then
    raise exception
      'Changing the AI controls requires a written reason (last_change_reason).';
  end if;

  -- Only record actual changes, so re-saving an unchanged form does not
  -- pad the audit log with noise.
  if new.ai_enabled is distinct from old.ai_enabled
     or new.confidence_threshold is distinct from old.confidence_threshold then
    insert into public.ai_control_events (
      changed_by, was_enabled, now_enabled, was_threshold, now_threshold, reason
    )
    values (
      coalesce(new.changed_by, auth.uid()),
      old.ai_enabled, new.ai_enabled,
      old.confidence_threshold, new.confidence_threshold,
      btrim(new.last_change_reason)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists ai_controls_audit on public.ai_controls;
create trigger ai_controls_audit
  before update on public.ai_controls
  for each row execute function public.record_ai_control_change();


-- ---------------------------------------------------------------------------
-- 3. Teacher verification (FR18)
-- ---------------------------------------------------------------------------
-- profiles.is_verified cannot be written from a browser: db/004 revoked UPDATE
-- on profiles from `authenticated` and granted back only first_name and
-- last_name, so nobody can verify themselves. That protection has to stay,
-- which means verification needs a deliberate, checked route instead.
--
-- Security definer, and it checks the caller is a Platform Admin itself rather
-- than trusting a policy, because the function runs as the owner.
create or replace function public.set_staff_verified(
  p_profile_id uuid,
  p_verified boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a Platform Admin can verify staff.';
  end if;

  select role into v_role from public.profiles where id = p_profile_id;

  if v_role is null then
    raise exception 'No such person.';
  end if;

  -- Verification is about people trusted with student records. Verifying a
  -- parent would be meaningless, and quietly allowing it invites confusion
  -- about what the flag means.
  if v_role not in ('educator', 'specialist', 'school_admin') then
    raise exception 'Only educators, specialists and school admins are verified.';
  end if;

  update public.profiles
  set is_verified = p_verified
  where id = p_profile_id;
end;
$$;

revoke all on function public.set_staff_verified(uuid, boolean) from public, anon;
grant execute on function public.set_staff_verified(uuid, boolean)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. Policies
-- ---------------------------------------------------------------------------
alter table public.ai_control_events enable row level security;

-- Platform admins see the whole history. School admins see it too: the AI
-- affects their students, and "who turned this off and why" is a question they
-- are entitled to ask.
drop policy if exists ai_control_events_select on public.ai_control_events;
create policy ai_control_events_select
  on public.ai_control_events for select to authenticated
  using (public.is_platform_admin() or public.is_school_admin());

-- No insert, update or delete policy at all. Rows arrive only via the trigger,
-- which runs as the owner. An audit log a user can write to is not an audit
-- log, and one they can edit is worse than none.

revoke all on public.ai_control_events from anon;


-- ---------------------------------------------------------------------------
-- Done. One new table, one new policy — db/verify.sql should show 48.
-- ---------------------------------------------------------------------------
