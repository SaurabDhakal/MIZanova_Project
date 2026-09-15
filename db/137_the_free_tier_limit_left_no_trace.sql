-- ===========================================================================
-- 137 — The free-tier limit could be changed and leave no trace at all
-- ===========================================================================
-- db/078 taught this history to hold a limit change, and it covered two of the
-- three limits. `free_daily_limit_per_user` — how many AI requests a person on
-- the free tier gets in a day — was not in the trigger's change test and has no
-- column on `ai_control_events`.
--
-- So it is not that the change was recorded badly. It was not recorded at all:
--
--   * change ONLY the free limit, and the trigger's `if` is false, so no event
--     row is inserted. Nothing appears in the AI governance change history and
--     nothing appears on the Audit Log. The written reason the form insists on
--     is stored in `ai_controls.last_change_reason` and overwritten by the next
--     save.
--   * change it alongside another limit and a row is written, but with no
--     column to hold it — so the entry describes the other change and is silent
--     about this one.
--
-- Found on 15 September 2026 by Gate 3 (docs/22): the school limit was moved by
-- one and the change history was read back, which is the only way this kind of
-- fault is ever found.
--
-- This is the same shape as db/078 and is fixed the same way. Both functions
-- below are reproduced WHOLE from the live definitions read out of the database
-- with `pg_get_functiondef` and `pg_get_viewdef`, not rebuilt from an ancestor
-- file — this project has twice rebuilt a definition from an older copy and
-- silently deleted later work.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The history can hold it
-- ---------------------------------------------------------------------------
alter table public.ai_control_events
  add column if not exists was_free_user_limit integer,
  add column if not exists now_free_user_limit integer;

-- Nullable for the same reason db/078 gave: null means "this event was not
-- about the free limit". Past rows are not backfilled with today's value, which
-- would claim every earlier change also set it.


-- ---------------------------------------------------------------------------
-- 2. The trigger notices it, and records it
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
     or new.daily_limit_per_user is distinct from old.daily_limit_per_user
     or new.free_daily_limit_per_user
          is distinct from old.free_daily_limit_per_user then
    insert into public.ai_control_events (
      changed_by, was_enabled, now_enabled, was_threshold, now_threshold,
      was_school_limit, now_school_limit, was_user_limit, now_user_limit,
      was_free_user_limit, now_free_user_limit,
      reason
    )
    values (
      coalesce(new.changed_by, auth.uid()),
      old.ai_enabled, new.ai_enabled,
      old.confidence_threshold, new.confidence_threshold,
      old.daily_limit_per_school, new.daily_limit_per_school,
      old.daily_limit_per_user, new.daily_limit_per_user,
      old.free_daily_limit_per_user, new.free_daily_limit_per_user,
      btrim(new.last_change_reason)
    );
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. The Audit Log calls it a limit change, not a threshold change
-- ---------------------------------------------------------------------------
-- Without this, an event whose only difference is the free limit falls past
-- the limit branch into the else — and the Audit Log reports "Routing
-- threshold changed", a true-looking entry describing something that did not
-- happen. That is the exact sentence db/078's header warns about, one limit
-- later.
--
-- `security_invoker = true` is set again on purpose. Losing it in a rewrite
-- would make this view read with the owner's rights instead of the reader's.
-- ---------------------------------------------------------------------------
create or replace view public.audit_timeline
with (security_invoker = true) as
 SELECT e.id,
    e.occurred_at,
    'admin'::text AS source,
    e.action,
    e.subject_label,
    e.detail,
    e.actor_id,
    p.full_name AS actor_name,
    e.school_id,
    o.name AS school_name,
    concat_ws(' '::text, p.full_name, e.subject_label, e.detail, e.action) AS search_text
   FROM admin_audit_events e
     LEFT JOIN profiles p ON p.id = e.actor_id
     LEFT JOIN organisations o ON o.id = e.school_id
UNION ALL
 SELECT c.id,
    c.changed_at AS occurred_at,
    'ai'::text AS source,
        CASE
            WHEN c.was_enabled IS DISTINCT FROM c.now_enabled THEN
            CASE
                WHEN c.now_enabled THEN 'ai.enabled'::text
                ELSE 'ai.disabled'::text
            END
            WHEN c.was_school_limit IS DISTINCT FROM c.now_school_limit
              OR c.was_user_limit IS DISTINCT FROM c.now_user_limit
              OR c.was_free_user_limit IS DISTINCT FROM c.now_free_user_limit
              THEN 'ai.limit_changed'::text
            ELSE 'ai.threshold_changed'::text
        END AS action,
        CASE
            WHEN c.was_enabled IS DISTINCT FROM c.now_enabled THEN NULL::text
            WHEN c.was_school_limit IS DISTINCT FROM c.now_school_limit
              OR c.was_user_limit IS DISTINCT FROM c.now_user_limit
              OR c.was_free_user_limit IS DISTINCT FROM c.now_free_user_limit
              THEN concat_ws(', '::text,
            CASE
                WHEN c.was_school_limit IS DISTINCT FROM c.now_school_limit THEN format('per school %s → %s'::text, c.was_school_limit, c.now_school_limit)
                ELSE NULL::text
            END,
            CASE
                WHEN c.was_user_limit IS DISTINCT FROM c.now_user_limit THEN format('per person %s → %s'::text, c.was_user_limit, c.now_user_limit)
                ELSE NULL::text
            END,
            CASE
                WHEN c.was_free_user_limit IS DISTINCT FROM c.now_free_user_limit THEN format('per free person %s → %s'::text, c.was_free_user_limit, c.now_free_user_limit)
                ELSE NULL::text
            END)
            ELSE ((round(COALESCE(c.was_threshold, 0::numeric) * 100::numeric)::text || '% → '::text) || round(COALESCE(c.now_threshold, 0::numeric) * 100::numeric)::text) || '%'::text
        END AS subject_label,
    c.reason AS detail,
    c.changed_by AS actor_id,
    q.full_name AS actor_name,
    NULL::uuid AS school_id,
    NULL::text AS school_name,
    concat_ws(' '::text, q.full_name, c.reason) AS search_text
   FROM ai_control_events c
     LEFT JOIN profiles q ON q.id = c.changed_by;

grant select on public.audit_timeline to authenticated;

commit;
