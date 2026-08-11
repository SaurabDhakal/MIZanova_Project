-- ===========================================================================
-- MiZanova — admin_tasks.sql
-- Things only a human with database access may do.
--
-- DO NOT run this file top to bottom. Each block is a separate task — copy the
-- one you need, replace the email address, and run just that block.
--
-- Tasks are keyed by EMAIL rather than by UUID so you never have to copy an
-- id around. The email lives in auth.users, which is why each one joins.
--
-- These live in SQL rather than in the application on purpose. Granting an
-- admin role, verifying a teacher, or linking a person to a child are acts
-- that should require deliberate database access, not a button.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- TASK 1 — Who has an account?
-- ---------------------------------------------------------------------------
select
  u.email,
  p.role,
  p.is_verified,
  p.full_name,
  case when p.school_id is null then 'no school' else 'assigned' end as school,
  p.id
from public.profiles p
join auth.users u on u.id = p.id
order by u.created_at desc;


-- ---------------------------------------------------------------------------
-- TASK 2 — Put someone into a school
-- ---------------------------------------------------------------------------
-- Everyone except a Platform Admin needs a school before Row-Level Security
-- lets them see anything. Signup deliberately does not set this: which school
-- you belong to is not something you may claim for yourself.
--
-- '1111…1111' is the test school from db/seed_test_data.sql.
update public.profiles p
set school_id = '11111111-1111-1111-1111-111111111111'
from auth.users u
where u.id = p.id
  and u.email = 'CHANGE-ME@example.com';


-- ---------------------------------------------------------------------------
-- TASK 3 — Verify an educator or specialist (FR18)
-- ---------------------------------------------------------------------------
-- Stands in for the Platform Admin verification queue (WWCC / ID documents)
-- built in M14. Until then, the same decision made by hand.
update public.profiles p
set is_verified = true
from auth.users u
where u.id = p.id
  and u.email = 'CHANGE-ME@example.com';


-- ---------------------------------------------------------------------------
-- TASK 4 — Promote someone to an admin role
-- ---------------------------------------------------------------------------
-- The ONLY way to become school_admin or platform_admin. The signup trigger
-- refuses both, and column grants stop the browser writing to `role` at all.
--
-- ⚠️ AFTER RUNNING THIS, THAT PERSON MUST SIGN OUT AND SIGN BACK IN.
--    The app holds the profile it loaded at sign-in and will not notice the
--    new role until the session is rebuilt.
update public.profiles p
set role = 'school_admin'          -- or 'platform_admin'
from auth.users u
where u.id = p.id
  and u.email = 'CHANGE-ME@example.com';


-- ---------------------------------------------------------------------------
-- TASK 5 — Link a parent to their child
-- ---------------------------------------------------------------------------
-- This row IS the parent's permission to see that child. Inserting it is the
-- single most sensitive write in the system.
insert into public.student_guardians (student_id, profile_id, relationship, is_primary)
select
  (select id from public.students where external_ref = '4021'),  -- Ethan M.
  u.id,
  'parent',
  true
from auth.users u
where u.email = 'CHANGE-ME@example.com'
on conflict (student_id, profile_id) do nothing;


-- ---------------------------------------------------------------------------
-- TASK 6 — Assign an educator to their students
-- ---------------------------------------------------------------------------
-- Being an educator at a school is not enough to see a student — you must be
-- assigned. This assigns one teacher to every student at the test school.
insert into public.student_educators (student_id, profile_id, assignment)
select s.id, u.id, 'class_teacher'
from public.students s
cross join auth.users u
where s.school_id = '11111111-1111-1111-1111-111111111111'
  and u.email = 'CHANGE-ME@example.com'
on conflict (student_id, profile_id, assignment) do nothing;


-- ---------------------------------------------------------------------------
-- TASK 7 — Record consent for a student
-- ---------------------------------------------------------------------------
insert into public.consents (student_id, granted_by, consent_type, policy_version)
select
  (select id from public.students where external_ref = '4021'),
  u.id,
  'ai_strategy_generation',
  'v1'
from auth.users u
where u.email = 'CHANGE-ME@example.com'
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- TASK 9 — Put a specialist on a student's caseload
-- ---------------------------------------------------------------------------
-- A specialist needs this before the review queue shows them anything: the
-- queue is filtered by can_staff_view_student, so an unassigned specialist
-- correctly sees an empty queue.
--
-- Run TASK 2 (assign the school) for them as well.
insert into public.student_educators (student_id, profile_id, assignment)
select s.id, u.id, 'specialist'
from public.students s
cross join auth.users u
where s.school_id = '11111111-1111-1111-1111-111111111111'
  and u.email = 'CHANGE-ME@example.com'
on conflict (student_id, profile_id, assignment) do nothing;


-- ---------------------------------------------------------------------------
-- TASK 10 — Tune the AI confidence threshold (governance dial)
-- ---------------------------------------------------------------------------
-- Suggestions scoring below this go to a specialist instead of a teacher.
-- Raising it sends more for review; lowering it sends fewer. Every change
-- should say why — that is what makes the audit meaningful.
update public.ai_controls
set confidence_threshold = 0.85,
    last_change_reason = 'CHANGE-ME: why you are changing it'
where id = true;

-- The kill switch. Setting this false stops all generation immediately.
-- update public.ai_controls
-- set ai_enabled = false,
--     last_change_reason = 'CHANGE-ME'
-- where id = true;


-- ---------------------------------------------------------------------------
-- TASK 8 — Who can currently reach which student?
-- ---------------------------------------------------------------------------
-- A plain-language audit of the access model. Useful when a screen is empty
-- and you need to know whether that is a bug or correct behaviour.
select
  s.display_name  as student,
  p.full_name     as person,
  p.role,
  case
    when sg.id is not null then 'guardian'
    when se.id is not null then 'assigned ' || se.assignment
  end             as connection
from public.students s
left join public.student_guardians sg on sg.student_id = s.id
left join public.student_educators se on se.student_id = s.id
left join public.profiles p on p.id = coalesce(sg.profile_id, se.profile_id)
where p.id is not null
order by s.display_name, p.role;
