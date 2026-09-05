-- ---------------------------------------------------------------------------
-- 091 — Whether anybody is actually doing the courses
-- ---------------------------------------------------------------------------
-- `course_enrolments` and `module_completions` have been filling up since
-- db/075 and NOTHING READS THEM IN AGGREGATE. Not the platform admin, not a
-- school, nobody. Special Miles can write a course, publish it, and has no way
-- to find out whether a single person opened it.
--
-- Joe's brief asks for this by name: "Reporting & analytics — engagement
-- tracking, data visualisation, and exportable reports". It is also the
-- cheapest thing on that list, because the data is already being written and
-- only the reading was missing.
--
-- ---------------------------------------------------------------------------
-- AGGREGATE ONLY, AND THAT IS A DECISION RATHER THAN A LIMITATION
-- ---------------------------------------------------------------------------
-- `course_enrolments_select` already admits a platform admin to every row, so
-- naming individuals would need no new permission. This view deliberately does
-- not.
--
-- A completion is personal data about a named person, and most of the people in
-- these tables are TEACHERS doing professional development. "Oshiet Upreti
-- finished 2 of 3 modules of Educator Wellbeing" is a record of one adult's
-- learning, visible to a company they do not work for, and nobody asked them.
-- Special Miles needs to know whether a course lands; it does not need to know
-- who is behind on one.
--
-- If a school later needs named completions to prove staff training for
-- compliance, that is a different feature with a different justification and a
-- different audience, and it should be built deliberately rather than arrived
-- at because this view happened to expose the names.
--
-- ---------------------------------------------------------------------------
-- WHAT THE NUMBERS MEAN, EXACTLY
-- ---------------------------------------------------------------------------
-- `modules` is the CURRENT module count. db/075's trigger compares completions
-- against it, so adding a module to a published course makes a finished
-- enrolment unfinished again — by design, because the course changed. That
-- means `completed` can fall without anybody withdrawing, and the screen says
-- so rather than letting somebody read it as people dropping out.
--
-- security_invoker, like the `schools` view: the counts are whatever the caller
-- is entitled to see. A platform admin sees everything; anybody else sees their
-- own enrolment and nothing else, which is harmless and correct rather than a
-- second place to keep a permission rule in step.
-- ---------------------------------------------------------------------------

create or replace view public.course_engagement
with (security_invoker = true) as
select
  c.id                                                          as course_id,
  c.title,
  c.summary,
  c.is_published,
  c.audiences,
  c.created_at,
  (
    select count(*)
    from public.course_modules m
    where m.course_id = c.id
  )::int                                                        as modules,
  count(e.id)::int                                              as enrolments,
  count(e.id) filter (where e.completed_at is not null)::int     as completed
from public.courses c
left join public.course_enrolments e on e.course_id = c.id
group by c.id, c.title, c.summary, c.is_published, c.audiences, c.created_at;

comment on view public.course_engagement is
  'Per-course enrolment and completion counts. Aggregate on purpose — see '
  'db/091 for why it does not name anybody.';

revoke all on public.course_engagement from anon;
grant select on public.course_engagement to authenticated;


-- ---------------------------------------------------------------------------
-- Check it. As a platform admin, one row per course:
--   select title, modules, enrolments, completed from public.course_engagement
--    order by enrolments desc;
--
-- As anybody else, the same rows with counts of only their own enrolment.
-- ---------------------------------------------------------------------------
