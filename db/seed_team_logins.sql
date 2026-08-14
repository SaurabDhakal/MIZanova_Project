-- ===========================================================================
-- seed_team_logins.sql — give each developer a login in the role they own
--
-- NOT part of the numbered sequence. `npm run apply-db` skips it deliberately:
-- it seeds people, not schema, and a fresh database elsewhere must not sprout
-- this team's accounts.
--
-- ---------------------------------------------------------------------------
-- RUN db/seed_test_data.sql FIRST. This attaches people to the school and
-- students that file creates. Without it there is nothing to attach them to.
--
-- ---------------------------------------------------------------------------
-- STEP 1 — CREATE THE THREE ACCOUNTS BY HAND, BEFORE RUNNING THIS.
--
--   Supabase → Authentication → Users → Add user → Create new user
--   Tick "Auto Confirm User". Do it three times, one per person.
--
-- Signing up cannot do this: the trigger in db/001 only ever makes a parent,
-- and /signup is a signpost that creates nothing at all. Staff arrive by
-- invitation, and on a brand new database there is nobody to invite them.
--
-- STEP 2 — put their real email addresses in the VALUES block below.
-- STEP 3 — run the whole file.
--
-- ---------------------------------------------------------------------------
-- WHY A MEMBERSHIP ROW, AND NOT JUST profiles.role
--
-- Since db/039 identity has two halves:
--
--   memberships          what you MAY be — person x organisation x role
--   profiles.role        what you currently ARE — the active context
--
-- `my_role()` verifies the pointer against a LIVE membership before answering.
-- Set profiles.role alone and every policy asks my_role(), gets null, and
-- refuses everything — an educator on paper and nobody in practice. That is
-- exactly the fault db/046 exists to fix, and it broke 32 tests when it was
-- missed. Three fields were set correctly and the person still could not work.
--
-- is_verified matters too: db/013 gates staff access behind it, so an
-- unverified teacher sees no children at all.
--
-- SAFE TO RUN TWICE. Every insert is guarded, and the update is idempotent.
-- ===========================================================================

drop table if exists team;
create temp table team (
  email      text primary key,
  role_name  public.user_role not null,
  first_name text not null,
  last_name  text not null
);

-- Role accounts, one per developer. Deliberately named for the ROLE and not the
-- person: they exist so each of us can see the screens we own, and if somebody
-- swaps areas the account does not have to be rebuilt.
--
-- mizanova.edu.au accepts no mail, which is fine while "Confirm email" is off
-- and is the reason password reset will not work for these. Sign-in is by the
-- password set in the dashboard.
insert into team (email, role_name, first_name, last_name) values
  ('educator@mizanova.edu.au',    'educator',     'Oshiet', 'Upreti'),
  ('schooladmin@mizanova.edu.au', 'school_admin', 'Prabin', 'Bhandari'),
  ('specialist@mizanova.edu.au',  'specialist',   'Tahmid', 'Ferdous');


-- 1. What they currently ARE ------------------------------------------------
update public.profiles p
set role        = t.role_name,
    school_id   = '11111111-1111-1111-1111-111111111111',
    is_verified = true,
    first_name  = t.first_name,
    last_name   = t.last_name
from auth.users u
join team t on lower(t.email) = lower(u.email)
where p.id = u.id;


-- 2. What they MAY be. Without this row the account is inert ----------------
insert into public.memberships (profile_id, organisation_id, role)
select p.id, '11111111-1111-1111-1111-111111111111', t.role_name
from public.profiles p
join auth.users u on u.id = p.id
join team t on lower(t.email) = lower(u.email)
where not exists (
  select 1 from public.memberships m
  where m.profile_id = p.id
    and m.organisation_id = '11111111-1111-1111-1111-111111111111'
    and m.role = t.role_name
    and m.ended_at is null
);


-- 3. Children to actually work with -----------------------------------------
-- A teacher sees only assigned students (db/040), so without these rows the
-- roster is empty and every educator screen looks broken rather than new.
insert into public.student_educators (student_id, profile_id, assignment)
select s.id, p.id,
       case t.role_name when 'specialist' then 'specialist' else 'class_teacher' end
from public.students s
join team t on t.role_name in ('educator', 'specialist')
join auth.users u on lower(u.email) = lower(t.email)
join public.profiles p on p.id = u.id
where s.school_id = '11111111-1111-1111-1111-111111111111'
on conflict (student_id, profile_id, assignment) do nothing;


-- 4. LOOK AT WHAT ACTUALLY HAPPENED ------------------------------------------
-- Read it. A missing row here is silent everywhere else: the person signs in,
-- sees an empty screen, and reports "my screens do not work".
--
--   account = MISSING   -> that email has no auth user. Redo step 1, or the
--                          address above is not the one you typed into Supabase.
--   memberships = 0     -> my_role() answers null and every policy refuses them.
--   students = 0        -> they sign in fine and the roster is empty.
select
  t.email,
  t.role_name                                          as should_be,
  coalesce(p.role::text, 'MISSING — no account')       as profile_role,
  p.is_verified,
  (select count(*) from public.memberships m
     where m.profile_id = p.id and m.ended_at is null) as memberships,
  (select count(*) from public.student_educators se
     where se.profile_id = p.id)                       as students
from team t
left join auth.users u on lower(u.email) = lower(t.email)
left join public.profiles p on p.id = u.id
order by t.role_name;
