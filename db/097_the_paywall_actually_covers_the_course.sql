-- ---------------------------------------------------------------------------
-- 097 — The paywall actually covers the course, and there is a sample
-- ---------------------------------------------------------------------------
-- db/092 said this, in capitals:
--
--     THE GATE IS THE ENROLMENT POLICY, NOT A BUTTON. A "Buy" button that a
--     browser could skip is not a paywall.
--
-- The reasoning was right and the gate was in the wrong place. It went on
-- `course_enrolments_insert`, which controls whether somebody may create a
-- PROGRESS ROW. It never touched `course_modules_select`, which controls
-- whether they may read the course.
--
-- Measured against the live database, with a $49 price on a published course
-- and an individual who had paid nothing:
--
--     has_paid_for_course : false
--     course rows visible : 1
--     MODULE rows visible : 3      shortest body: 548 characters
--
-- So the button guarded the tick-list and the material was free to anybody in
-- the audience. Not a UI slip either — the publishable key ships in the
-- JavaScript bundle by design, so this was one query away for anyone, exactly
-- the shape of hole db/092 set out to avoid.
--
-- ---------------------------------------------------------------------------
-- THE SAMPLE IS PART OF THE FIX, NOT A FEATURE BOLTED ON
-- ---------------------------------------------------------------------------
-- Closing the hole on its own would make a priced course show a title, a
-- summary and nothing else. Nobody pays $49 for a paragraph, and a shop that
-- shows no goods is not more honest than one that gives them away — it is just
-- a worse shop.
--
-- So one module of each course stays readable to its audience whether or not
-- anybody has paid. That is the demo: read the first part, then decide.
--
-- WHICH MODULE IS A COLUMN, NOT A RULE. `is_preview` defaults to false and
-- this file sets it on the lowest `sort_order` of each course, because the
-- first part of anything is the natural sample. It is a starting position and
-- Special Miles can move it — a course whose second module is the persuasive
-- one should be able to say so without a migration.
--
-- ---------------------------------------------------------------------------
-- NOTHING CHANGES FOR ANYBODY TODAY
-- ---------------------------------------------------------------------------
-- Every course is free (`price_cents is null`), and a free course stays
-- entirely open to its audience. This only starts mattering on the day a price
-- is set, which is the same property db/092 was written to have.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Which module is the sample
-- ---------------------------------------------------------------------------
alter table public.course_modules
  add column if not exists is_preview boolean not null default false;

comment on column public.course_modules.is_preview is
  'Readable without paying, so a priced course can be sampled before it is '
  'bought. See db/097.';

-- The first module of each course, as a starting position.
update public.course_modules m
   set is_preview = true
 where m.sort_order = (
   select min(x.sort_order)
     from public.course_modules x
    where x.course_id = m.course_id
 );


-- ---------------------------------------------------------------------------
-- 2. Reading a module now asks whether it was paid for
-- ---------------------------------------------------------------------------
-- Everything the old policy allowed is kept for a FREE course. The price is
-- what introduces the question, and `c.price_cents is null` is checked before
-- `is_preview` so a free course never depends on which module was flagged.
-- ---------------------------------------------------------------------------
drop policy if exists course_modules_select on public.course_modules;
create policy course_modules_select
  on public.course_modules for select to authenticated
  using (
    exists (
      select 1
      from public.courses c
      where c.id = course_modules.course_id
        and (
          public.is_platform_admin()
          -- Bought it, or it was withdrawn after they bought it — db/093.
          or public.has_paid_for_course(c.id)
          or (
            c.is_published
            and public.my_role() = any (c.audiences)
            and (
              c.price_cents is null          -- free: the whole thing
              or course_modules.is_preview   -- priced: the sample only
            )
          )
        )
    )
  );

commit;

-- ---------------------------------------------------------------------------
-- Check it. Put a price on a published course, then as somebody in its
-- audience who has not paid:
--
--   select count(*) from public.course_modules where course_id = '<id>';
--
-- must return 1 — the sample — where before this file it returned all of them.
-- Remove the price and it returns all of them again.
-- ---------------------------------------------------------------------------
