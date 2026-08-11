-- ===========================================================================
-- MiZanova — 014_kpi_views.sql
-- Figures a school admin can actually check (FR16).
--
-- Design reference: docs/Figma Pages Design/SC2-Performance KPIs Dashboard.png
--
-- Run 001-013 first. SAFE TO RUN TWICE.
-- ===========================================================================
--
-- The design for this page shows "Absenteeism Correlation 0.84", "Parent
-- Engagement (CSAT) 8.4/10", "Escalation Reduction 24% vs last quarter" and a
-- chart comparing "Anonymized Predictive AI" against a "Standard Evidence
-- Database". MiZanova stores no attendance data, runs no satisfaction survey,
-- has no quarterly baseline and holds no such comparison — every one of those
-- numbers would have to be typed in by hand.
--
-- These views compute what the data can support. Every figure here traces to
-- rows a school admin could count themselves.
--
-- ALL THREE ARE security_invoker, so Row-Level Security on the underlying
-- tables still applies. A view is a query, not a bypass: an unverified admin
-- gets nothing from these, and an educator gets only their own students.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Headline numbers
-- ---------------------------------------------------------------------------
create or replace view public.school_kpi_overview
with (security_invoker = true) as
select
  s.school_id,

  count(distinct s.id) filter (where s.is_active)              as students_active,
  count(distinct sg.student_id)                                 as students_with_guardian,
  count(distinct se.student_id)                                 as students_with_staff,

  count(distinct b.id)                                          as logs_total,
  count(distinct b.id) filter (where b.occurred_at > now() - interval '30 days')
                                                                as logs_30d,
  count(distinct b.id) filter (where b.occurred_at > now() - interval '7 days')
                                                                as logs_7d,

  count(distinct b.id) filter (where b.is_risk_flagged)         as flagged_total,
  count(distinct b.id) filter (where b.is_risk_flagged
                                 and b.safeguarding_acknowledged_at is null)
                                                                as flagged_open,

  -- Median hours from an incident happening to an administrator acknowledging
  -- it. The single most operationally useful number on the page: a queue is
  -- only as good as how long things sit in it.
  percentile_cont(0.5) within group (
    order by extract(epoch from (b.safeguarding_acknowledged_at - b.occurred_at)) / 3600
  ) filter (where b.safeguarding_acknowledged_at is not null)   as median_ack_hours,

  count(distinct b.id) filter (where b.shared_with_parents)     as logs_shared

from public.students s
left join public.behaviour_logs   b  on b.student_id  = s.id
left join public.student_guardians sg on sg.student_id = s.id
left join public.student_educators se on se.student_id = s.id
group by s.school_id;


-- ---------------------------------------------------------------------------
-- 2. Weekly activity, for the trend
-- ---------------------------------------------------------------------------
-- Replaces the Figma's "Emotional Regulation Trends against Historical
-- Baseline". There is no baseline to compare against, so this shows what
-- happened per week and lets a human draw their own conclusion.
create or replace view public.school_behaviour_weekly
with (security_invoker = true) as
select
  s.school_id,
  date_trunc('week', b.occurred_at)::date                       as week_start,
  count(*)                                                      as logs,
  count(*) filter (where b.is_risk_flagged)                     as flagged
from public.behaviour_logs b
join public.students s on s.id = b.student_id
where b.occurred_at > now() - interval '12 weeks'
group by s.school_id, date_trunc('week', b.occurred_at)
order by week_start;


-- ---------------------------------------------------------------------------
-- 3. What the AI is actually doing
-- ---------------------------------------------------------------------------
-- The honest replacement for "Global Prediction Accuracy" and "Intervention
-- Effectiveness". We cannot measure whether a strategy worked — that would
-- need an outcome we do not collect. We CAN report how many suggestions a
-- human had to hold back, and how many teachers rejected after trying, which
-- is a real quality signal reported by real people.
create or replace view public.school_ai_overview
with (security_invoker = true) as
select
  s.school_id,
  count(*)                                                      as strategies_total,
  count(*) filter (where a.status = 'published')                as published,
  count(*) filter (where a.status = 'pending_review')           as pending_review,
  count(*) filter (where a.status = 'approved')                 as approved,
  count(*) filter (where a.status = 'rejected')                 as rejected,
  round(avg(a.confidence), 2)                                   as avg_confidence,
  -- Averaged over the strategies, not the requests: this is how much the
  -- anonymiser is removing in practice.
  round(avg(a.redaction_count), 1)                              as avg_redactions
from public.ai_strategies a
join public.students s on s.id = a.student_id
group by s.school_id;


revoke all on public.school_kpi_overview      from anon;
revoke all on public.school_behaviour_weekly  from anon;
revoke all on public.school_ai_overview       from anon;
grant select on public.school_kpi_overview      to authenticated;
grant select on public.school_behaviour_weekly  to authenticated;
grant select on public.school_ai_overview       to authenticated;


-- ---------------------------------------------------------------------------
-- Done. Three views, no tables, no policies — count stays at 48.
-- ---------------------------------------------------------------------------
