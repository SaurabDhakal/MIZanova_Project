-- ===========================================================================
-- 070_a_safeguarding_queue_that_shows_its_age.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: THE WORST SCHOOL LOOKS THE CALMEST
-- ---------------------------------------------------------------------------
-- `median_ack_hours` carries this filter:
--
--     FILTER (WHERE b.safeguarding_acknowledged_at IS NOT NULL)
--
-- So it measures only what HAS been acknowledged. A school that acknowledges
-- promptly reports a small number. A school that acknowledges LATE reports a
-- big one. And a school that has never acknowledged anything at all reports
-- null — which the Schools table renders as an em-dash, the quietest cell on
-- the row.
--
-- The three cases a platform admin needs to tell apart are "fine", "slow" and
-- "nobody is looking at this", and the third one currently renders as blank.
-- It is the same fault as every other one found this week: nothing and
-- not-looked are indistinguishable, and the blank is the reassuring one.
--
-- ---------------------------------------------------------------------------
-- WHAT A VENDOR MAY SEE, AND WHY THIS IS THE RIGHT NUMBER
-- ---------------------------------------------------------------------------
-- Special Miles processes this data; the school owns it. Reading the contents
-- of a flagged incident is not needed to run the service, and would be the same
-- boundary db/069 just closed — a child's record read by somebody with no part
-- in their care, leaving no entry on Record Access.
--
-- But whether a school's safeguarding process is FUNCTIONING is squarely the
-- vendor's business: it is the thing a service agreement is about, and the
-- thing somebody would be asked about afterwards.
--
-- The number that answers it is age, not count. Five incidents acknowledged
-- within the hour is a healthy school. Five sitting for three weeks is a
-- failure that needs a phone call today. `flagged_open` alone cannot tell those
-- apart, and until now nothing on the row could.
--
-- HOURS SINCE THE INCIDENT, not since it was flagged: the clock a parent or a
-- regulator would start is the one that begins when the thing happened.
--
-- No incident, child, staff member or note is exposed here. One number per
-- school, and it is a duration.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- The view, reproduced whole
-- ---------------------------------------------------------------------------
-- `create or replace view` replaces the entire definition, so this is the live
-- text of the view — read back with `pg_get_viewdef` rather than rebuilt from
-- db/014, because db/022 already redefined it once and reconstructing one from
-- the wrong file is how db/046 silently deleted db/036's work.
--
-- Every existing column is unchanged and in its original order.
-- `oldest_open_hours` is appended, so nothing reading by position moves.
--
-- `security_invoker = true` is set again ON PURPOSE. It is easy to lose in a
-- rewrite, and losing it here would show every school's figures to every school
-- admin — db/055 was exactly that.
-- ---------------------------------------------------------------------------
create or replace view public.school_kpi_overview
with (security_invoker = true) as
 SELECT s.school_id,
    count(DISTINCT s.id) FILTER (WHERE s.is_active) AS students_active,
    count(DISTINCT sg.student_id) AS students_with_guardian,
    count(DISTINCT se.student_id) AS students_with_staff,
    count(DISTINCT b.id) AS logs_total,
    count(DISTINCT b.id) FILTER (WHERE b.occurred_at > (now() - '30 days'::interval)) AS logs_30d,
    count(DISTINCT b.id) FILTER (WHERE b.occurred_at > (now() - '7 days'::interval)) AS logs_7d,
    count(DISTINCT b.id) FILTER (WHERE b.is_risk_flagged) AS flagged_total,
    count(DISTINCT b.id) FILTER (WHERE b.is_risk_flagged AND b.safeguarding_acknowledged_at IS NULL) AS flagged_open,
    percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY ((EXTRACT(epoch FROM b.safeguarding_acknowledged_at - b.occurred_at) / 3600::numeric)::double precision)) FILTER (WHERE b.safeguarding_acknowledged_at IS NOT NULL) AS median_ack_hours,
    count(DISTINCT b.id) FILTER (WHERE b.shared_with_parents) AS logs_shared,

    -- How long the oldest UNACKNOWLEDGED flagged incident has been waiting.
    --
    -- The mirror image of median_ack_hours: that one can only describe incidents
    -- somebody has already dealt with, this one can only describe the ones
    -- nobody has. Between them there is no longer a school whose safeguarding
    -- backlog reports nothing at all.
    --
    -- Null here means something good and specific — no flagged incident is
    -- waiting — which is the opposite of what a null median means, so the
    -- screen must not render the two the same way.
    max(EXTRACT(epoch FROM (now() - b.occurred_at)) / 3600::numeric)
      FILTER (WHERE b.is_risk_flagged AND b.safeguarding_acknowledged_at IS NULL)
      AS oldest_open_hours

   FROM students s
     LEFT JOIN behaviour_logs b ON b.student_id = s.id
     LEFT JOIN student_guardians sg ON sg.student_id = s.id
     LEFT JOIN student_educators se ON se.student_id = s.id
  GROUP BY s.school_id;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select school_id, flagged_open, median_ack_hours, oldest_open_hours
--   from public.school_kpi_overview;
--
-- The pair that matters: a school with flagged_open > 0 must now report a
-- number in oldest_open_hours even when median_ack_hours is null. That
-- combination — "things are waiting, nothing has ever been acknowledged" — is
-- the case that used to render as an empty cell.
--
--   select relname, reloptions from pg_class where relname = 'school_kpi_overview';
--   -- must include security_invoker=true
--
-- And it must still be invisible to the wrong reader. Signed in as a school
-- admin, this returns their own school and no other:
--
--   select count(*) from public.school_kpi_overview;
-- ---------------------------------------------------------------------------
