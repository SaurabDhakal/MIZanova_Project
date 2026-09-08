-- ---------------------------------------------------------------------------
-- 105 — An answer you have not seen
-- ---------------------------------------------------------------------------
-- NotificationBell.tsx explains at length that it went and found what each role
-- actually has queued, "rather than to show four roles a number and the fifth
-- an empty box". It lists five roles. The individual is not one of them, and
-- until now that was correct — an individual had nothing that could be waiting
-- on them.
--
-- db/103 changed that. A session request gets answered, and the person who
-- asked has no way of learning that except by opening the page and looking.
-- The email helps whoever reads email; the bell is for whoever is already in
-- the product.
--
-- ---------------------------------------------------------------------------
-- WHY A COLUMN RATHER THAN COUNTING answered BOOKINGS
-- ---------------------------------------------------------------------------
-- The bell has one rule, stated in its own file: "An item leaves when the work
-- is done and not before, so the count is always true." Counting every
-- accepted or declined booking would produce a number that never goes down —
-- a badge that is permanently lit is one people stop reading, which would
-- quietly break the bell for the other five roles too.
--
-- So the answer is marked seen when they open the screen that shows it, and
-- the bell counts what is answered and unseen. That is a line which links to
-- the screen that clears it, which is the test the bell requires of anything
-- appearing in it.
--
-- Only the person who asked may set it, and only on their own booking. A
-- specialist marking somebody else's notification as read would be a small
-- thing that felt like being watched.
-- ---------------------------------------------------------------------------

begin;

alter table public.individual_bookings
  add column if not exists answer_seen_at timestamptz;

comment on column public.individual_bookings.answer_seen_at is
  'When the person who asked saw the answer. Null while an accepted or '
  'declined booking is still news to them — see db/105.';

-- Answered and not yet seen, which is exactly what the bell counts.
create index if not exists individual_bookings_unseen_idx
  on public.individual_bookings (profile_id)
  where answer_seen_at is null and status in ('accepted', 'declined');


-- ---------------------------------------------------------------------------
-- Marking it seen, without widening what else they may write
-- ---------------------------------------------------------------------------
-- `individual_bookings_answer` lets the person who asked set status only to
-- 'cancelled'. Marking an answer seen is not a status change and must not
-- become an excuse to allow one, so it is a function with a narrow job rather
-- than a loosened policy.
-- ---------------------------------------------------------------------------
create or replace function public.mark_booking_answers_seen()
returns integer
language sql
security definer
set search_path = public
as $$
  with touched as (
    update public.individual_bookings
       set answer_seen_at = now()
     where profile_id = auth.uid()
       and answer_seen_at is null
       and status in ('accepted', 'declined')
    returning 1
  )
  select count(*)::int from touched;
$$;

revoke all on function public.mark_booking_answers_seen() from anon;
grant execute on function public.mark_booking_answers_seen() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it. As the person who asked, after a specialist has answered:
--
--   select count(*) from public.individual_bookings
--    where answer_seen_at is null and status in ('accepted','declined');  -- 1
--   select public.mark_booking_answers_seen();                            -- 1
--   -- and the same count is now 0, and a second call returns 0.
--
-- As anybody else, the function must touch nothing: it is scoped to auth.uid().
-- ---------------------------------------------------------------------------
