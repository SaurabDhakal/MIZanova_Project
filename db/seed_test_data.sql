-- ===========================================================================
-- MiZanova — seed_test_data.sql
-- A test school and three students, so there is something real to look at
-- while we build. We will attach test accounts to this school at step 8.
--
-- NOT production data. SAFE TO RUN TWICE — the fixed UUID and the
-- `on conflict do nothing` clauses mean a second run changes nothing.
-- ===========================================================================

-- Fixed id so re-running this file updates rather than duplicates.
insert into public.schools (id, name, suburb, state, timezone)
values (
  '11111111-1111-1111-1111-111111111111',
  'Parramatta West Primary School',
  'Parramatta',
  'NSW',
  'Australia/Sydney'
)
on conflict (id) do nothing;


-- Three students. Note the deliberate awkward cases:
--   - L'Estrange has an apostrophe (doubled to escape it in SQL)
--   - Okafor-Bright is hyphenated
-- If the display_name expression mishandles either, we want to know now and
-- not when a real parent sees their child's name rendered wrong.
insert into public.students
  (school_id, first_name, last_name, year_level, external_ref, date_of_birth)
values
  ('11111111-1111-1111-1111-111111111111', 'Ethan', 'Mitchell',      '4', '4021', '2016-03-14'),
  ('11111111-1111-1111-1111-111111111111', 'Maya',  'Rodriguez',     '4', '4022', '2016-07-02'),
  ('11111111-1111-1111-1111-111111111111', 'Sofia', 'L''Estrange',   '4', '4023', '2016-11-21'),
  ('11111111-1111-1111-1111-111111111111', 'Julian','Okafor-Bright', '3', '4024', '2017-01-30')
on conflict (school_id, external_ref) do nothing;


-- ---------------------------------------------------------------------------
-- Invoices, so Billing & Revenue has something to be about
-- ---------------------------------------------------------------------------
-- Without these the screen is correct and empty, and an empty screen cannot
-- show whether it works. One of each status, because each renders differently
-- and each counts towards a different figure:
--
--   paid   -> Collected
--   open   -> Outstanding, and the one dated in the past is also Past due
--   draft  -> counted, and no family can see it (db/020's select policy)
--   void   -> counted, in no total
--
-- Fixed ids so a second run changes nothing. Statuses are set on INSERT: the
-- guard in db/020 that reserves 'paid' for the payment system is a BEFORE
-- UPDATE trigger, so seeding a paid row directly is allowed and marking one
-- paid from a browser still is not.
insert into public.invoices
  (id, school_id, student_id, description, amount_cents, status, due_date, paid_at)
select
  v.id::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  s.id,
  v.description,
  v.amount_cents,
  v.status::public.invoice_status,
  v.due_date::date,
  v.paid_at::timestamptz
from (values
  ('aaaa0001-0000-4000-8000-000000000001', '4021', 'Term 3 tuition',                 145000, 'paid',  '2026-07-15', '2026-07-11T09:20:00+10:00'),
  ('aaaa0001-0000-4000-8000-000000000002', '4022', 'Speech therapy, 12 sessions',     96000, 'open',  '2026-07-01', null),
  ('aaaa0001-0000-4000-8000-000000000003', '4023', 'Term 4 tuition',                 145000, 'open',  '2026-10-15', null),
  ('aaaa0001-0000-4000-8000-000000000004', '4024', 'Occupational therapy assessment', 38000, 'draft', null,         null),
  ('aaaa0001-0000-4000-8000-000000000005', '4021', 'Excursion levy — cancelled',       4500, 'void',  null,         null)
) as v(id, external_ref, description, amount_cents, status, due_date, paid_at)
join public.students s
  on s.external_ref = v.external_ref
 and s.school_id = '11111111-1111-1111-1111-111111111111'
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- THE PROOF
-- ---------------------------------------------------------------------------
-- `stored_in_database` is what a school staff member is allowed to see.
-- `what_a_parent_sees` is the generated column — computed by Postgres, and
-- impossible to write to. This is the surname guarantee, demonstrated.
select
  first_name || ' ' || last_name as stored_in_database,
  display_name                   as what_a_parent_sees,
  year_level,
  external_ref
from public.students
where school_id = '11111111-1111-1111-1111-111111111111'
order by first_name;


-- ---------------------------------------------------------------------------
-- OPTIONAL: prove the column really cannot be written to.
-- Uncomment the line below and run it. Postgres will refuse with:
--   ERROR: column "display_name" can only be updated to DEFAULT
--
-- update public.students set display_name = 'Ethan Mitchell';
-- ---------------------------------------------------------------------------
