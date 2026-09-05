-- ---------------------------------------------------------------------------
-- 093 — What you paid for stays yours
-- ---------------------------------------------------------------------------
-- db/092 made courses sellable and, in doing so, broke something that was
-- harmless the day before.
--
-- `courses_select` is `is_published and my_role() = any (audiences)`, and
-- `course_modules_select` repeats it. While every course was free that was a
-- publishing switch: unpublish a course and it stops being offered. Now that
-- somebody can pay $49 for one, THE SAME SWITCH TAKES AWAY SOMETHING THEY
-- BOUGHT. Their enrolment and their completions survive — those are keyed to
-- the person, not the course — so what they are left with is a progress record
-- for a course that no longer opens, which is worse than losing it cleanly.
--
-- The same happens without anybody unpublishing anything: drop 'individual'
-- from a course's audiences and every individual who paid loses it.
--
-- Neither is a hypothetical. Retiring a course and changing who a course is for
-- are both ordinary things for Special Miles to do from the Courses screen, and
-- neither screen warns that somebody paid.
--
-- ---------------------------------------------------------------------------
-- THE RULE
-- ---------------------------------------------------------------------------
-- Paying for a course is a permanent claim on it. Publication state and
-- audience decide who may BUY a course; they do not decide who may open one
-- they already own.
--
-- This is the same reasoning db/092 used for `on delete restrict` and for
-- copying the amount at the moment of sale: a record of money changing hands
-- must not be undone by ordinary editing elsewhere.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. The course itself
-- ---------------------------------------------------------------------------
drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses
  for select to authenticated
  using (
    public.is_platform_admin()
    or (is_published and public.my_role() = any (audiences))
    or public.has_paid_for_course(id)
  );


-- ---------------------------------------------------------------------------
-- 2. Its contents, or the course is a title with nothing under it
-- ---------------------------------------------------------------------------
drop policy if exists course_modules_select on public.course_modules;
create policy course_modules_select on public.course_modules
  for select to authenticated
  using (
    exists (
      select 1
      from public.courses c
      where c.id = course_modules.course_id
        and (
          public.is_platform_admin()
          or (c.is_published and public.my_role() = any (c.audiences))
          or public.has_paid_for_course(c.id)
        )
    )
  );


-- ---------------------------------------------------------------------------
-- 3. And you can still start it
-- ---------------------------------------------------------------------------
-- Restated rather than patched, because db/092's version read as one condition
-- with a payment clause bolted on and this is two separate permissions:
--
--   you paid for it                      — settled, and nothing later revokes it
--   it is free, published, and for you    — the ordinary way in
--
-- Audience is deliberately not re-checked on the paid branch. It was checked
-- when they bought it: /api/billing/course-checkout reads the course under the
-- caller's own RLS, so nobody can buy a course they could not see.
-- ---------------------------------------------------------------------------
drop policy if exists course_enrolments_insert on public.course_enrolments;
create policy course_enrolments_insert
  on public.course_enrolments for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.courses c
      where c.id = course_enrolments.course_id
        and (
          public.has_paid_for_course(c.id)
          or (
            c.price_cents is null
            and c.is_published
            and public.my_role() = any (c.audiences)
          )
        )
    )
  );

commit;

-- ---------------------------------------------------------------------------
-- Check it. As a platform admin, unpublish a course somebody has paid for.
-- They must still see it in the Academy and still be able to open its modules;
-- nobody else must see it at all.
-- ---------------------------------------------------------------------------
