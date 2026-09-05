-- ---------------------------------------------------------------------------
-- 089 — An individual can sign themselves up, and has something to read
-- ---------------------------------------------------------------------------
-- The second half of db/088. That file added the enum value; this one uses it,
-- which is why they are separate — see the note there.
--
-- ---------------------------------------------------------------------------
-- WHY NO NEW POLICIES ARE NEEDED, WHICH IS THE HAPPY PART
-- ---------------------------------------------------------------------------
-- The Academy and the Library are already audience-driven and person-scoped:
--
--   courses_select      is_published and my_role() = any (audiences)
--   articles_select     is_published and my_role() = any (audiences)
--   course_modules      the same, through the course
--   course_enrolments   profile_id = auth.uid()
--   module_completions  through the enrolment, to auth.uid()
--
-- Not one of those mentions a school, a student record or a guardian link. An
-- enrolment belongs to a PERSON. So a new role sees exactly the content it is
-- named in, and can enrol and complete, with nothing added. The only reason
-- individuals could not use the product was that no role landed them there.
--
-- What an individual still cannot do is everything that runs through a student
-- record: bookings, invoices, behaviour, plans. `specialist_appointments` and
-- `invoices` both require a student, and a student requires a school. Those are
-- the next pieces of work and this file deliberately does not pretend
-- otherwise.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. A second self-selectable role
-- ---------------------------------------------------------------------------
-- Still a closed list, and still decided here rather than on the signup page —
-- db/044's reasoning is unchanged: the role arrives in `raw_user_meta_data`,
-- which the browser writes, so removing a picker from the page changes what an
-- honest person can choose and nothing about what anybody can send.
--
-- `individual` is safe to self-select for the same reason `parent` is: it
-- carries no school, no membership and no assignment, so `can_view_student()`
-- is false for every child in the database. Somebody claiming it gets the
-- Academy and their own account. There is nothing else to reach.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_role text := nullif(new.raw_user_meta_data ->> 'role', '');
  safe_role    public.user_role;
begin
  -- TWO self-selectable roles. Everything else is granted by somebody who
  -- already has standing to grant it.
  if claimed_role = 'individual' then
    safe_role := 'individual';
  elsif claimed_role = 'parent' then
    safe_role := 'parent';
  else
    -- Covers null, nonsense, and every attempt to claim a role that has to be
    -- given rather than taken. Defaults to parent, unchanged from db/044:
    -- the invitation flow signs up as 'parent' and redeem_invitation sets the
    -- real role afterwards, so this default must stay exactly where it is.
    safe_role := 'parent';
  end if;

  insert into public.profiles (id, role, first_name, last_name, email)
  values (
    new.id,
    safe_role,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. Something to read on arrival
-- ---------------------------------------------------------------------------
-- Chosen rather than granted wholesale. Two courses and one article assume
-- nothing about a school, so an individual can read them without meeting a
-- sentence about "your child's teacher" that does not apply to them.
--
-- Deliberately NOT given: "What the AI sees, and what it never sees" and "Why
-- a parent sees Ethan M." Both describe the classroom product, and an
-- individual has no classroom. Adding them would pad the Library at the cost
-- of the reader wondering what they had signed up for.
--
-- The Library will therefore look thin for an individual — one article — and
-- that is honest. The answer is more writing, not wider audiences.
-- ---------------------------------------------------------------------------
update public.courses
   set audiences = audiences || 'individual'::public.user_role
 where title in ('Empowered Parenting', 'Asking for what helps')
   and not ('individual' = any (audiences));

update public.articles
   set audiences = audiences || 'individual'::public.user_role
 where title = 'What MiZanova will not tell you'
   and not ('individual' = any (audiences));


-- ---------------------------------------------------------------------------
-- Check it.
-- ---------------------------------------------------------------------------
--   select title, audiences from public.courses
--    where 'individual' = any (audiences);      -- expect 2
--
--   select title from public.articles
--    where 'individual' = any (audiences);      -- expect 1
--
-- And after signing somebody up with role 'individual' in the metadata:
--   select role from public.profiles where email = '...';   -- 'individual'
