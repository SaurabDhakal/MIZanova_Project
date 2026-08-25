-- ===========================================================================
-- 068_the_audit_log_can_be_asked_about_any_day.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: THE AUDIT LOG COULD ONLY SEE THE NEWEST 200 EVENTS
-- ---------------------------------------------------------------------------
-- The screen read `admin_audit_events` with `.limit(200)`, read
-- `ai_control_events` with `.limit(50)`, merged them in the browser, and did
-- every filter, every count and the CSV export over that merged array.
--
-- So the window WAS the data. Three consequences, worst last:
--
--   1. Filtering by action searched only the newest 200 rows.
--   2. The "Where" dropdown was built from the schools present in those rows,
--      so a school whose last event fell outside the window was not offered as
--      an option at all. The screen did not say "no results" — it stopped
--      admitting the school existed.
--   3. The export took "what is on screen", so it truncated in silence. That
--      is the file somebody attaches to an email about an incident.
--
-- db/064 and db/065 put triggers on schools, invoices, applications,
-- enquiries, behaviour logs and goals. One real school passes 200 rows in
-- days. After that the compliance screen starts answering "nothing happened"
-- to questions it never actually asked.
--
-- ---------------------------------------------------------------------------
-- WHY A VIEW AND NOT TWO PAGED QUERIES
-- ---------------------------------------------------------------------------
-- A merged timeline cannot be paginated by paginating its parts. Page 2 of the
-- administrative events plus page 2 of the AI events is not page 2 of the
-- merge — the two lists interleave differently at every depth, and the exact
-- count needed for "page 3 of 12" cannot be recovered from two separate
-- counts either.
--
-- One relation, one `order by`, one `range`, one exact count. That is what the
-- union buys, and it is the same shape Record Access already uses.
--
-- ---------------------------------------------------------------------------
-- WHY THE AI LABELS MOVE INTO SQL
-- ---------------------------------------------------------------------------
-- "AI turned ON" / "AI turned OFF" / "Routing threshold changed" were derived
-- in TypeScript by comparing was_enabled with now_enabled. That is fine for
-- rendering and useless for filtering: the server had no such column, so the
-- Action filter could only ever work on rows already downloaded.
--
-- Deriving the action code here gives all three the same server-side treatment
-- every db/064 action already gets. The codes follow the existing dotted
-- convention and are named in src/lib/auditActions.ts alongside the rest.
--
-- ---------------------------------------------------------------------------
-- WHY THE NAMES ARE JOINED IN RATHER THAN EMBEDDED
-- ---------------------------------------------------------------------------
-- The screen used PostgREST embeds — `profiles ( full_name )`. Embedding
-- through a UNION view depends on PostgREST tracing a foreign key back to a
-- base table, which it cannot reliably do across a union, so the names are
-- joined here and arrive as ordinary columns.
--
-- LEFT JOIN, and that is the whole point of writing it out. An inner join
-- would drop an audit row whose actor has since been deleted — `actor_id` is
-- `on delete set null` in db/015, so those rows exist by design. An audit
-- trail that quietly loses entries when somebody leaves is worse than no audit
-- trail, because it still looks complete.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. One timeline over both tables
-- ---------------------------------------------------------------------------
-- `security_invoker = true` so the underlying RLS on both tables still
-- decides who sees what. Without it the view runs as its owner and every
-- caller reads the whole audit trail — db/055 was exactly that mistake.
--
-- Both tables are read-only to the application: rows are written by triggers
-- and security-definer functions. The view inherits that; there is nothing to
-- write here.
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
  -- One column for the search box, so a half-remembered name or a phrase from
  -- a reason is a single `ilike` rather than an `or` across four columns.
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
    else 'ai.threshold_changed'
  end                                 as action,
  -- Only a threshold change has a subject worth naming; switching AI off is
  -- about the whole product, not about a thing.
  case
    when c.was_enabled is distinct from c.now_enabled then null
    else round(coalesce(c.was_threshold, 0) * 100)::text || '% → ' ||
         round(coalesce(c.now_threshold, 0) * 100)::text || '%'
  end                                 as subject_label,
  c.reason                            as detail,
  c.changed_by                        as actor_id,
  q.full_name                         as actor_name,
  -- The AI controls are one global switch, not a per-school setting. Null here
  -- means "Special Miles", the same as it does for an administrative act, and
  -- the screen renders it that way rather than as a gap.
  null::uuid                          as school_id,
  null::text                          as school_name,
  concat_ws(' ', q.full_name, c.reason)  as search_text
from public.ai_control_events c
left join public.profiles q on q.id = c.changed_by;

commit;

-- ---------------------------------------------------------------------------
-- 2. The indexes the paged read leans on
-- ---------------------------------------------------------------------------
-- Both time indexes already exist — db/015 and db/012 — and a MergeAppend over
-- the two is what lets `order by occurred_at desc limit 25` stop early instead
-- of sorting the whole trail.
--
-- db/065 added the school index. The one missing is action: it is now a
-- server-side filter rather than an array filter in the browser, and it is the
-- one somebody uses when they know what they are looking for.
-- ---------------------------------------------------------------------------
create index if not exists admin_audit_events_action_idx
  on public.admin_audit_events (action);

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select source, count(*) from public.audit_timeline group by source;
--   -- both sources present
--
--   select relname, reloptions from pg_class where relname = 'audit_timeline';
--   -- must include security_invoker=true
--
-- The one that matters. Signed in as a platform admin, this must return the
-- SAME number as counting the base tables — if the view is dropping rows, this
-- is where it shows:
--
--   select
--     (select count(*) from public.audit_timeline)        as timeline,
--     (select count(*) from public.admin_audit_events)
--       + (select count(*) from public.ai_control_events) as tables;
--
-- And signed in as anybody else, `select count(*) from public.audit_timeline`
-- must return 0. A view that forwards the audit trail to a school admin is the
-- worst possible outcome of this file.
-- ---------------------------------------------------------------------------
