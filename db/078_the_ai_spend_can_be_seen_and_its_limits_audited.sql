-- ===========================================================================
-- 078_the_ai_spend_can_be_seen_and_its_limits_audited.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: db/026 BUILT THE QUOTA AND NOBODY CAN SEE IT
-- ---------------------------------------------------------------------------
-- db/026 exists because of this, in its own words:
--
--   "One school could exhaust the entire Anthropic budget in a morning, and
--    the first sign of it would be strategies failing everywhere at once, for
--    everybody, with no clue why."
--
-- It added `daily_limit_per_school`, `daily_limit_per_user` and
-- `ai_generation_events` — one row per request that reached the model, which
-- is the thing that costs money.
--
-- None of it reaches a screen. AI Governance carries the kill switch and the
-- routing threshold and nothing else, so a platform admin cannot see how much
-- the product is being used, by whom, or which school is close to its cap. The
-- quota now stops the runaway, and the person responsible for the bill still
-- learns about it from teachers reporting that strategies stopped working —
-- which is the same failure db/026 set out to prevent, moved one level up.
--
-- ---------------------------------------------------------------------------
-- AND A LIMIT CHANGE WOULD NOT BE AUDITED
-- ---------------------------------------------------------------------------
-- Found while looking at what exposing this would mean. db/012's trigger
-- records a change only when `ai_enabled` or `confidence_threshold` moves:
--
--     if new.ai_enabled is distinct from old.ai_enabled
--        or new.confidence_threshold is distinct from old.confidence_threshold
--
-- So raising a school's daily limit — the control that directly decides how
-- much money can be spent — would be the one AI setting somebody could change
-- with no record of who did it or why. The trigger would still DEMAND a
-- reason, and then throw it away.
--
-- Fixed here before the screen offers the control, rather than after.
--
-- ---------------------------------------------------------------------------
-- db/068 WOULD ALSO HAVE MISLABELLED IT
-- ---------------------------------------------------------------------------
-- `audit_timeline` derives the action from what changed, and its else-branch
-- is 'ai.threshold_changed'. A limit change reaching that branch would appear
-- on the Audit Log as "Routing threshold changed" — a true-looking entry
-- describing something that did not happen, which is worse than a missing one.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The history can hold a limit change
-- ---------------------------------------------------------------------------
alter table public.ai_control_events
  add column if not exists was_school_limit integer,
  add column if not exists now_school_limit integer,
  add column if not exists was_user_limit   integer,
  add column if not exists now_user_limit   integer;

-- Nullable, and null means "this event was not about a limit". Existing rows
-- are left alone rather than backfilled with the current value, which would
-- claim every past change also set a limit.


-- ---------------------------------------------------------------------------
-- 2. The trigger records them
-- ---------------------------------------------------------------------------
-- Reproduced whole from db/012, which is the live definition — this project
-- has twice rebuilt a function from an ANCESTOR and silently deleted later
-- work. Nothing else changed: the reason is still required, and unchanged
-- saves still record nothing.
-- ---------------------------------------------------------------------------
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
     or new.confidence_threshold is distinct from old.confidence_threshold
     or new.daily_limit_per_school is distinct from old.daily_limit_per_school
     or new.daily_limit_per_user is distinct from old.daily_limit_per_user then
    insert into public.ai_control_events (
      changed_by, was_enabled, now_enabled, was_threshold, now_threshold,
      was_school_limit, now_school_limit, was_user_limit, now_user_limit,
      reason
    )
    values (
      coalesce(new.changed_by, auth.uid()),
      old.ai_enabled, new.ai_enabled,
      old.confidence_threshold, new.confidence_threshold,
      old.daily_limit_per_school, new.daily_limit_per_school,
      old.daily_limit_per_user, new.daily_limit_per_user,
      btrim(new.last_change_reason)
    );
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. The audit log calls a limit change what it is
-- ---------------------------------------------------------------------------
-- db/068's view, reproduced whole with one branch added ahead of the
-- else-branch. Read back from the live definition rather than rebuilt.
--
-- `security_invoker = true` is set again on purpose. Losing it in a rewrite is
-- db/055, and here it would hand the whole governance trail to every school.
-- ---------------------------------------------------------------------------
create or replace view public.audit_timeline
with (security_invoker = true) as

select
  e.id,
  e.occurred_at,
  'admin'::text                       as source,
  e.action,
  e.subject_label,
  e.detail,
  e.actor_id,
  p.full_name                         as actor_name,
  e.school_id,
  o.name                              as school_name,
  concat_ws(
    ' ',
    p.full_name,
    e.subject_label,
    e.detail,
    e.action
  )                                   as search_text
from public.admin_audit_events e
left join public.profiles p      on p.id = e.actor_id
left join public.organisations o on o.id = e.school_id

union all

select
  c.id,
  c.changed_at                        as occurred_at,
  'ai'::text                          as source,
  case
    when c.was_enabled is distinct from c.now_enabled then
      case when c.now_enabled then 'ai.enabled' else 'ai.disabled' end
    -- BEFORE the threshold branch. A change can move both, and a limit rising
    -- is the one worth naming: it is the setting that decides how much money
    -- can be spent.
    when c.was_school_limit is distinct from c.now_school_limit
      or c.was_user_limit is distinct from c.now_user_limit then 'ai.limit_changed'
    else 'ai.threshold_changed'
  end                                 as action,
  case
    when c.was_enabled is distinct from c.now_enabled then null
    when c.was_school_limit is distinct from c.now_school_limit
      or c.was_user_limit is distinct from c.now_user_limit then
      concat_ws(', ',
        case when c.was_school_limit is distinct from c.now_school_limit
             then format('per school %s → %s', c.was_school_limit, c.now_school_limit) end,
        case when c.was_user_limit is distinct from c.now_user_limit
             then format('per person %s → %s', c.was_user_limit, c.now_user_limit) end
      )
    else round(coalesce(c.was_threshold, 0) * 100)::text || '% → ' ||
         round(coalesce(c.now_threshold, 0) * 100)::text || '%'
  end                                 as subject_label,
  c.reason                            as detail,
  c.changed_by                        as actor_id,
  q.full_name                         as actor_name,
  null::uuid                          as school_id,
  null::text                          as school_name,
  concat_ws(' ', q.full_name, c.reason)  as search_text
from public.ai_control_events c
left join public.profiles q on q.id = c.changed_by;


-- ---------------------------------------------------------------------------
-- 4. What the AI is actually being used for, per school
-- ---------------------------------------------------------------------------
-- Aggregated in the database rather than counted in a browser, which is
-- db/061's lesson: PostgREST caps at 1000 rows, so a total added up on the
-- client silently stops growing at exactly the point it starts to matter.
--
-- `security_invoker`, so one view answers for a platform admin (every school)
-- and a school admin (their own) — db/026's policy on the underlying table
-- already draws that line and this inherits it.
--
-- TWENTY-FOUR HOURS, NOT "TODAY". db/026's quota is a rolling 24-hour window,
-- so a figure reset at midnight would disagree with the limit it is displayed
-- against — and a school told it has used 12 of 200 while being refused is the
-- worst possible version of this screen.
-- ---------------------------------------------------------------------------
drop view if exists public.ai_usage_by_school;

create view public.ai_usage_by_school
with (security_invoker = true) as
select
  e.school_id,
  count(*) filter (where e.occurred_at > now() - interval '24 hours')::integer
                                                    as requests_24h,
  count(*) filter (where e.occurred_at > now() - interval '7 days')::integer
                                                    as requests_7d,
  count(*) filter (where e.occurred_at > now() - interval '30 days')::integer
                                                    as requests_30d,
  count(distinct e.requested_by) filter (where e.occurred_at > now() - interval '30 days')::integer
                                                    as people_30d,
  max(e.occurred_at)                                as last_request_at
from public.ai_generation_events e
group by e.school_id;

grant select on public.ai_usage_by_school to authenticated;
revoke all on public.ai_usage_by_school from anon;
-- Supabase's defaults grant the full set on anything new in `public`. The
-- GROUP BY refuses writes anyway, but that is the query's shape protecting it
-- rather than a decision — see db/071.
revoke insert, update, delete, truncate, references, trigger
  on public.ai_usage_by_school from authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select relname, reloptions from pg_class
--   where relname in ('audit_timeline', 'ai_usage_by_school');
--   -- both must include security_invoker=true
--
-- A limit change must now be recorded AND named correctly:
--
--   update public.ai_controls
--      set daily_limit_per_school = 250, last_change_reason = 'testing'
--    where id;
--
--   select action, subject_label from public.audit_timeline
--   where source = 'ai' order by occurred_at desc limit 1;
--   -- 'ai.limit_changed', 'per school 200 → 250'
--
-- And put it back. This is a live control on a shared database.
-- ---------------------------------------------------------------------------
