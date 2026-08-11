-- ===========================================================================
-- MiZanova — 015_audit_events.sql
-- A general admin audit trail, and verification changes recorded in it.
--
-- Run 001-014 first. SAFE TO RUN TWICE.
-- ===========================================================================
--
-- db/012 records changes to the AI controls. Nothing records who verified a
-- staff member, or who withdrew that verification — and since verification now
-- decides whether someone can see any student data at all (db/013), that is
-- the single most consequential administrative action in the system.
--
-- It was untracked. This fixes that.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_events (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles(id) on delete set null,
  occurred_at  timestamptz not null default now(),

  -- e.g. 'staff.verified', 'staff.verification_withdrawn'
  action       text not null,
  -- Who or what it happened to.
  subject_id   uuid,
  subject_label text,

  detail       text
);

create index if not exists admin_audit_events_time_idx
  on public.admin_audit_events (occurred_at desc);


-- ---------------------------------------------------------------------------
-- 2. Verification now leaves a record
-- ---------------------------------------------------------------------------
-- Replaces the version from db/012. Same checks, plus the audit write, both
-- inside one function so a verification cannot happen without being recorded.
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
  v_role  public.user_role;
  v_name  text;
  v_was   boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a Platform Admin can verify staff.';
  end if;

  select role, full_name, is_verified
    into v_role, v_name, v_was
  from public.profiles
  where id = p_profile_id;

  if v_role is null then
    raise exception 'No such person.';
  end if;

  if v_role not in ('educator', 'specialist', 'school_admin') then
    raise exception 'Only educators, specialists and school admins are verified.';
  end if;

  update public.profiles
  set is_verified = p_verified
  where id = p_profile_id;

  -- Only record an actual change, so re-clicking does not pad the log.
  if v_was is distinct from p_verified then
    insert into public.admin_audit_events (
      actor_id, action, subject_id, subject_label, detail
    )
    values (
      auth.uid(),
      case when p_verified then 'staff.verified'
           else 'staff.verification_withdrawn' end,
      p_profile_id,
      v_name,
      case when p_verified
           then 'Identity checks attested as complete. This person can now see student records.'
           else 'Verification withdrawn. This person can no longer see any student records.'
      end
    );
  end if;
end;
$$;

revoke all on function public.set_staff_verified(uuid, boolean) from public, anon;
grant execute on function public.set_staff_verified(uuid, boolean)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. Policy
-- ---------------------------------------------------------------------------
alter table public.admin_audit_events enable row level security;

drop policy if exists admin_audit_events_select on public.admin_audit_events;
create policy admin_audit_events_select
  on public.admin_audit_events for select to authenticated
  using (public.is_platform_admin());

-- No insert, update or delete policy. Rows arrive only through the security
-- definer function above. An audit log its subjects can write to proves
-- nothing, and one they can edit is worse than having none.

revoke all on public.admin_audit_events from anon;


-- ---------------------------------------------------------------------------
-- Done. One table, one policy — db/verify.sql should show 49.
-- ---------------------------------------------------------------------------
