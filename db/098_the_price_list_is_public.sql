-- ---------------------------------------------------------------------------
-- 098 — The price list is public
-- ---------------------------------------------------------------------------
-- The Pricing page has three audiences — schools, Montessori, families — and
-- no individuals, while an individual is the only customer on the site who can
-- actually buy something today. They can sign up, use the product and never
-- meet a price.
--
-- ---------------------------------------------------------------------------
-- WHY A VIEW RATHER THAN A FOURTH HARD-CODED LIST
-- ---------------------------------------------------------------------------
-- src/lib/plans.ts exists because school prices lived in two places and
-- drifted: the first agreement recorded on the Subscriptions screen said
-- "Mid-size schools — $2,400 per year" when the published price was $5,800 per
-- term. Wrong plan, wrong period, wrong amount, and nothing could notice.
--
-- An individual's prices are not a published list at all — they are whatever
-- `courses.price_cents` says, set by Special Miles on the Courses screen. So
-- the pricing page must read the same column the checkout charges from. Typing
-- them into plans.ts would recreate the exact fault plans.ts was built to end,
-- one table further along.
--
-- ---------------------------------------------------------------------------
-- WHY IT IS READABLE WITHOUT SIGNING IN, AND WHAT IS NOT IN IT
-- ---------------------------------------------------------------------------
-- `courses_select` is granted `to authenticated`, so a signed-out visitor —
-- which is everybody reading a pricing page — can see nothing. A price list is
-- public by nature; a shop that hides its prices until you have an account is
-- not protecting anything.
--
-- So this view runs with the definer's rights and is granted to `anon`, and
-- that is safe because of what it does NOT select: no `body`, no `video_url`,
-- no module content of any kind. Titles, summaries, audiences, a module count
-- and a price — the things a poster in a window carries. db/097 keeps the
-- material itself behind payment, and nothing here weakens it.
--
-- `is_published` is in the WHERE clause rather than left to the caller. A
-- definer view with no filter would publish drafts.
-- ---------------------------------------------------------------------------

begin;

create or replace view public.course_catalogue as
select
  c.id,
  c.title,
  c.summary,
  c.audiences,
  c.price_cents,
  c.currency,
  (
    select count(*)
    from public.course_modules m
    where m.course_id = c.id
  )::int as modules
from public.courses c
where c.is_published;

comment on view public.course_catalogue is
  'Published course titles, summaries and prices, readable without signing in '
  'so the public pricing page can show what a course actually costs. Carries '
  'no module content — see db/098.';

revoke all on public.course_catalogue from public;
grant select on public.course_catalogue to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Registering interest in something that does not exist yet
-- ---------------------------------------------------------------------------
-- The individuals tab offers one-to-one sessions as "not built", the way the
-- families tab offers subscriptions. Both need somewhere for the enquiry to
-- land, and `enquiries.plan_key` is a CHECK — db/095 widened it once already
-- for Montessori and this adds the individual.
-- ---------------------------------------------------------------------------
alter table public.enquiries
  drop constraint if exists enquiries_plan_key_check;

alter table public.enquiries
  add constraint enquiries_plan_key_check
  check (
    plan_key in (
      'small_school',
      'mid_school',
      'large_school',
      'montessori',
      'essential',
      'premium',
      'individual'
    )
  );

commit;

-- ---------------------------------------------------------------------------
-- Check it. Signed out entirely, this must return the published courses and
-- their prices:
--
--   select title, price_cents, modules from public.course_catalogue;
--
-- And this must still return nothing, because the material stays behind the
-- paywall db/097 put on it:
--
--   select body from public.course_modules;
-- ---------------------------------------------------------------------------
