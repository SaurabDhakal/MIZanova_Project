-- ===========================================================================
-- seed_demo_school.sql — a school with enough in it to design against
-- ===========================================================================
-- Run in the Supabase SQL editor, or with the project's own pg connection.
-- SAFE TO RUN TWICE: every id is derived from a fixed string, so a second run
-- collides with itself and changes nothing.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- The database holds 1 school, 4 students and 1 behaviour log. Every screen
-- that is supposed to show a shape — a confidence histogram, a review queue, a
-- safeguarding backlog, activity over a fortnight — is correct and empty, and
-- an empty screen cannot show whether it works or what it should look like.
-- Designing the platform admin dashboard against four rows produced tiles and
-- one bar; the cards worth building only become obvious once there is a term's
-- worth of work to look at.
--
-- ---------------------------------------------------------------------------
-- IT FILLS THE SCHOOL THAT ALREADY EXISTS, ON PURPOSE
-- ---------------------------------------------------------------------------
-- All four team accounts hold memberships at Parramatta West Primary. A new
-- demo school would be invisible to every one of them — an educator would sign
-- in and see nothing, because RLS answers about the school they belong to, not
-- the school with the nicest data in it.
--
-- ---------------------------------------------------------------------------
-- EVERY ROW IS REMOVABLE, AND THAT IS THE POINT
-- ---------------------------------------------------------------------------
-- Demo data in a database that also holds real work is only acceptable if
-- getting rid of it is one statement. Every student here carries an
-- `external_ref` of 'DEMO-nnn', and behaviour logs, strategies and goals hang
-- off students by `on delete cascade`. The teardown is at the bottom of this
-- file.
--
-- Names are ordinary Australian school names rather than 'Test Student 1',
-- because a screen full of placeholders cannot be shown to anybody and cannot
-- be judged either. They are invented; any resemblance is coincidence.
-- ===========================================================================

begin;

-- The school and the two staff these rows hang off. Named here rather than
-- repeated, so this file has exactly one thing to change if it is ever pointed
-- at a different tenant.
create temporary table demo_ctx on commit drop as
select
  '11111111-1111-1111-1111-111111111111'::uuid as school_id,
  'e6a840e0-40f6-44fb-b383-7512d9ee59af'::uuid as educator_id,
  '909816a1-bd51-4749-90c1-308ddc23d02f'::uuid as specialist_id;


-- ---------------------------------------------------------------------------
-- 1. Twenty-eight students
-- ---------------------------------------------------------------------------
insert into public.students (id, school_id, first_name, last_name, year_level, external_ref, is_active)
select
  md5('demo-student-' || n)::uuid,
  (select school_id from demo_ctx),
  (array['Ava','Noah','Mia','Leo','Zara','Hugo','Ruby','Kai','Isla','Arlo',
         'Nina','Felix','Sadie','Otis','Maya','Jude','Elsie','Theo','Poppy','Reid',
         'Iris','Milo','Vera','Rafi','Cleo','Beau','Nell','Oscar'])[n],
  (array['Whitlock','Farrer','Nguyen','Baptiste','Okonkwo','Ellery','Santos','Mbeki','Dunne','Kaur',
         'Petrov','Adeyemi','Lawson','Haddad','Ferreira','Kelly','Novak','Ahmed','Brennan','Tui',
         'Costa','Sharma','Molnar','Osei','Byrne','Tran','Fitzgerald','Marchetti'])[n],
  (array['K','1','2','3','4','5','6'])[1 + (n % 7)],
  'DEMO-' || lpad(n::text, 3, '0'),
  true
from generate_series(1, 28) n
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 2. Who teaches them
-- ---------------------------------------------------------------------------
-- Every child has the class teacher. A third also have the specialist, which
-- is what makes the caseload screen a caseload rather than the whole roster.
insert into public.student_educators (id, student_id, profile_id, assignment)
select md5('demo-assign-teacher-' || n)::uuid,
       md5('demo-student-' || n)::uuid,
       (select educator_id from demo_ctx),
       'class_teacher'
from generate_series(1, 28) n
on conflict do nothing;

insert into public.student_educators (id, student_id, profile_id, assignment)
select md5('demo-assign-spec-' || n)::uuid,
       md5('demo-student-' || n)::uuid,
       (select specialist_id from demo_ctx),
       'specialist'
from generate_series(1, 28) n
where n % 3 = 0
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- 3. A term of behaviour logs
-- ---------------------------------------------------------------------------
-- Eight weeks, weekdays only — a Saturday incident in a primary school is a
-- data-entry error, and a chart with weekend bumps looks wrong to anybody who
-- has worked in one.
--
-- The spread is arithmetic on the row numbers rather than random(), so running
-- this file twice produces the same rows and the ids collide instead of
-- doubling everything.
-- `duration_seconds` is NOT listed here and must not be: it is a generated
-- column, `extract(epoch from (ended_at - started_at))`, and Postgres refuses
-- an insert that names one. The duration comes from setting the two ends —
-- which is the honest way round anyway, since that is what a teacher's timer
-- actually records.
insert into public.behaviour_logs
  (id, student_id, logged_by, behaviour_type, intensity, notes,
   occurred_at, started_at, ended_at, is_risk_flagged, shared_with_parents)
select
  md5('demo-log-' || n || '-' || d)::uuid,
  md5('demo-student-' || n)::uuid,
  (select educator_id from demo_ctx),
  (array['disruptive','withdrawn','emotional','physical'])[1 + ((n * 7 + d * 3) % 4)]::public.behaviour_type,
  -- Weighted so 'standard' is the common case. A roster where every incident
  -- is high intensity is not a school, it is a crisis.
  (array['standard','standard','standard','medium','medium','high'])[1 + ((n * 5 + d) % 6)]::public.behaviour_intensity,
  (array[
    'Left the mat during reading and paced at the back of the room. Returned after a two-minute break outside.',
    'Head down on the desk for most of the session. Declined to start the task; accepted a quiet corner.',
    'Raised voice when the timer sounded. Settled once the next step was written on the whiteboard.',
    'Refused to line up after lunch. Walked in with the class after a countdown.',
    'Tore up the worksheet after the second correction. Apologised unprompted at the end of the lesson.',
    'Withdrew to the reading corner during group work and stayed there until the bell.'
  ])[1 + ((n + d) % 6)],
  (current_date - d) + time '09:15' + ((n % 5) * interval '78 minutes'),
  (current_date - d) + time '09:15' + ((n % 5) * interval '78 minutes'),
  (current_date - d) + time '09:15' + ((n % 5) * interval '78 minutes')
    + ((2 + ((n * 3 + d) % 18)) * interval '1 minute'),
  -- About one in forty is flagged, which is roughly what a school sees.
  ((n * 11 + d * 5) % 40) = 0,
  ((n + d) % 3) <> 0
from generate_series(1, 28) n, generate_series(0, 55) d
where extract(dow from current_date - d) not in (0, 6)
  and ((n * 13 + d * 17) % 11) < 2
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 4. The consent that has to exist before section 5 may
-- ---------------------------------------------------------------------------
-- THIS SECTION WAS MISSING AND ITS ABSENCE WAS VISIBLE TO FAMILIES.
--
-- The strategies below are written straight into the table, which is the one
-- path that goes around the consent gate in server/index.js — that gate guards
-- the generation ROUTE, and a seed does not use it. So the demo shipped 111
-- strategies across 27 children whose Privacy & Consent screen said, correctly,
-- "Not given". Nothing was broken, and it looked precisely like the product
-- doing the one thing it promises never to do.
--
-- Dated a day before the child's first log so the order a reader reconstructs
-- is the order the product actually requires: asked first, generated after.
-- db/082 backfills the same rows for data seeded before this section existed.
insert into public.consents
  (id, student_id, consent_type, granted_at, policy_version, notes)
select
  md5('demo-consent-ai-' || s.id::text)::uuid,
  s.id,
  'ai_strategy_generation',
  coalesce(
    (select min(l.occurred_at) from public.behaviour_logs l where l.student_id = s.id),
    now()
  ) - interval '1 day',
  'v1',
  'Demo seed. Not a consent any family gave.'
from public.students s
where s.external_ref like 'DEMO-%'
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 5. AI strategies, spread across the routing threshold
-- ---------------------------------------------------------------------------
-- The confidence histogram on AI Governance exists to show whether the
-- threshold is cutting the distribution somewhere sensible, and it cannot do
-- that against a single value. These land between 0.45 and 0.96 with a lump in
-- the middle, which is where a real model puts them and exactly the shape that
-- makes the threshold decision hard.
--
-- Anything under 0.75 is held for review, matching the default the product
-- ships with, so the specialist's review queue fills for the right reason
-- rather than by being told to.
insert into public.ai_strategies
  (id, behaviour_log_id, student_id, title, body, rationale, confidence, status,
   routing_reason, anonymised_input, redaction_count, model, prompt_version, created_at)
select
  md5('demo-strategy-' || l.id::text)::uuid,
  l.id,
  l.student_id,
  (array[
    'Offer a two-minute movement break before the task',
    'Write the next step where they can see it',
    'Give the instruction once, then wait ten seconds',
    'Name the feeling before naming the behaviour',
    'Let them choose the order of the two tasks'
  ])[1 + (('x' || substr(md5(l.id::text), 1, 4))::bit(16)::int % 5)],
  'Try this at the point the pattern usually starts rather than after it. Record what happened either way — the next suggestion is built from what you write down.',
  array['Matches a pattern seen in similar logs', 'Low effort to try in a normal lesson'],
  conf.value,
  case when conf.value < 0.75 then 'pending_review' else 'published' end::public.strategy_status,
  case when conf.value < 0.75
       then 'Confidence below the routing threshold'
       else 'Above the routing threshold' end,
  'A student in this year level; ' || l.behaviour_type || ', ' || l.intensity || ' intensity.',
  2,
  'claude-sonnet-4-5',
  'demo-seed',
  l.occurred_at + interval '4 minutes'
from public.behaviour_logs l
cross join lateral (
  select round((0.45 + (('x' || substr(md5(l.id::text), 5, 4))::bit(16)::int % 52) / 100.0)::numeric, 2) as value
) conf
where l.student_id in (
        select id from public.students where external_ref like 'DEMO-%'
      )
  -- Not every log produces one. A model that always has something to say is a
  -- model nobody believes.
  and (('x' || substr(md5(l.id::text), 9, 2))::bit(8)::int % 5) < 3
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 6. Goals
-- ---------------------------------------------------------------------------
-- Spread across every status so the parent and specialist screens show more
-- than one state, including the two that are easy to forget: 'needs_review',
-- which is what the caseload card watches for, and 'discontinued', which has
-- to render without looking like a failure.
insert into public.goals
  (id, student_id, title, description, category, status, target_date, progress_percent, created_by)
select
  md5('demo-goal-' || n || '-' || g)::uuid,
  md5('demo-student-' || n)::uuid,
  (array[
    'Join group work for a full session',
    'Ask for a break using the card',
    'Start written work within two minutes',
    'Name one feeling each morning'
  ])[g],
  'Reviewed with the family each fortnight. Progress is recorded from classroom observation, not from a test.',
  (array['social_communication','emotional_regulation','literacy','self_care'])[g]::public.goal_category,
  /*
   * HASHED, NOT ARITHMETIC, AND THE FIRST VERSION WAS QUIETLY BROKEN.
   *
   * It was `(n + g) % 6`, under a `where (n + g) % 2 = 0` filter. So n + g is
   * always even, any odd-coefficient combination of the two stays even mod 6,
   * and the array only ever resolved to indices 1, 3 and 5 — not_started,
   * on_track, achieved. 'needs_review' and 'discontinued' never appeared once
   * in 56 rows.
   *
   * That is the worst kind of seed bug: it produces plausible data. The
   * specialist caseload card exists to raise 'needs_review', and it would have
   * been designed and demoed against a status the seed could not generate.
   * md5 does not care about the parity of its input.
   */
  (array['not_started','on_track','on_track','needs_review','achieved','discontinued'])[
    1 + (('x' || substr(md5('demo-goal-status-' || n || '-' || g), 1, 4))::bit(16)::int % 6)
  ]::public.goal_status,
  current_date + (30 + ((n * 7 + g) % 90)),
  (array[0, 25, 40, 60, 75, 100])[
    1 + (('x' || substr(md5('demo-goal-pct-' || n || '-' || g), 1, 4))::bit(16)::int % 6)
  ],
  (select specialist_id from demo_ctx)
from generate_series(1, 28) n, generate_series(1, 4) g
where (n + g) % 2 = 0
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Screening checks, one in each state the report can tell apart
-- ---------------------------------------------------------------------------
-- The Screening page has never had a row in it, so nobody has seen what it
-- does — including the part that matters most. db/051 distinguishes four
-- states, and 'unknown' is deliberately listed first there because a check with
-- no expiry date cannot be trusted at all, where an expired one at least says
-- what happened and when. A page that has only ever been empty cannot show
-- that it treats the two differently.
--
-- One row per state, so the table, the ordering and the Global Overview alert
-- can all be judged against something.
--
-- These carry demo emails rather than a profile, which is the honest shape:
-- a screening check belongs to a person the network has admitted, and most of
-- them have not made an account yet.
insert into public.staff_screening
  (id, profile_id, email, check_type, state, number, expires_on, verified_at)
values
  -- Valid, and comfortably so.
  (md5('demo-screen-valid')::uuid, null, 'demo.screening.valid@example.com',
   'wwcc', 'NSW', 'WWC1234567E', current_date + 400, now() - interval '30 days'),
  -- Inside the sixty-day warning window: db/048 chose sixty because a renewal
  -- is not instant and a term is ten weeks.
  (md5('demo-screen-expiring')::uuid, null, 'demo.screening.expiring@example.com',
   'wwcc', 'VIC', 'WWC7654321E', current_date + 24, now() - interval '300 days'),
  -- Already lapsed. Nobody's access is removed by this; the product records
  -- checks, it does not talk to the Office of the Children's Guardian.
  (md5('demo-screen-expired')::uuid, null, 'demo.screening.expired@example.com',
   'ndis', 'QLD', 'NDIS-556677', current_date - 11, now() - interval '400 days'),
  -- The one worth seeing: verified, and no expiry was ever supplied.
  (md5('demo-screen-unknown')::uuid, '909816a1-bd51-4749-90c1-308ddc23d02f',
   'specialist@mizanova.edu.au', 'ndis', 'NSW', 'NDIS-112233', null,
   now() - interval '90 days')
on conflict (id) do nothing;

commit;


-- ---------------------------------------------------------------------------
-- What you should see
-- ---------------------------------------------------------------------------
--   select count(*) from public.students where external_ref like 'DEMO-%';
--   select count(*) from public.behaviour_logs
--     where student_id in (select id from public.students where external_ref like 'DEMO-%');
--   select status, count(*) from public.ai_strategies group by status;
--
-- Then: AI Governance shows a real distribution against the threshold, the
-- specialist review queue has something in it, Safeguarding has a backlog, and
-- the educator roster is a class rather than four names.
--
-- ---------------------------------------------------------------------------
-- TEARDOWN — removes every row this file created, and nothing else
-- ---------------------------------------------------------------------------
-- Strategies, behaviour logs and goals hang off students by `on delete
-- cascade`, so deleting the students is enough. The assignments are named
-- explicitly because they reference profiles as well.
--
--   begin;
--   delete from public.student_educators
--     where student_id in (select id from public.students where external_ref like 'DEMO-%');
--   delete from public.students where external_ref like 'DEMO-%';
--   delete from public.staff_screening where email like 'demo.screening.%';
--   delete from public.staff_screening where id = md5('demo-screen-unknown')::uuid;
--   commit;
-- ---------------------------------------------------------------------------
