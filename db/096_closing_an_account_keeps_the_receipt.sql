-- ---------------------------------------------------------------------------
-- 096 — Closing an account keeps the receipt
-- ---------------------------------------------------------------------------
-- src/pages/public/ForIndividuals.tsx has always promised "an account you can
-- close, with an email address you can change". Changing the email works.
-- Closing does not exist anywhere in the product — no screen, no route, no
-- database machinery — so half of that sentence has been untrue since the day
-- the page shipped.
--
-- The individual is the right role to build it for first, and not because it
-- is the easiest. It is the only role where closing an account harms nobody
-- else: no school holds their record, no child depends on their guardianship,
-- no roster loses a teacher. Every other role needs a conversation about what
-- happens to the people attached to them, and that conversation is not this
-- file.
--
-- ---------------------------------------------------------------------------
-- WHAT THE SCHEMA ALREADY GETS RIGHT, WHICH IS ALMOST EVERYTHING
-- ---------------------------------------------------------------------------
-- `profiles.id` references `auth.users` ON DELETE CASCADE, and the forty-odd
-- foreign keys pointing at `profiles` are already split along exactly the line
-- that matters:
--
--   ON DELETE CASCADE     things that ARE the person — their enrolments, their
--                         push subscriptions, their private AI requests.
--   ON DELETE SET NULL    records of an ACTION they took — audit events, a
--                         message they sent, an AI request that cost money.
--                         The record survives; the person is detached from it.
--
-- So deleting the auth user does the right thing in forty places without this
-- file touching them. `ai_generation_events.requested_by` is SET NULL, which
-- means AI spend and volume stay countable after somebody leaves — governance
-- survives erasure, which is the correct answer to both.
--
-- ---------------------------------------------------------------------------
-- THE ONE THAT IS WRONG: course_purchases
-- ---------------------------------------------------------------------------
-- `course_purchases.profile_id` is ON DELETE CASCADE, so closing an account
-- would delete the record that money was received. That is the one row here
-- that is not only the customer's — a business must be able to account for
-- what it was paid, and in Australia that obligation outlives the customer's
-- relationship with it by years.
--
-- Deleting it is also unnecessary for the person's sake. What identifies them
-- is `profile_id`; the amount, the currency, the date and the Stripe session
-- do not. SET NULL detaches the sale from the human and keeps the receipt,
-- which serves the erasure and the ledger at the same time.
--
-- Nothing leaks. `has_paid_for_course()` matches `profile_id = auth.uid()`,
-- and null is never equal to anything, so a detached purchase grants access to
-- nobody. The select policy admits `profile_id = auth.uid() or
-- is_platform_admin()`, so a detached row is visible to Billing and to no one
-- else — which is exactly who needs it.
-- ---------------------------------------------------------------------------

begin;

alter table public.course_purchases
  alter column profile_id drop not null;

alter table public.course_purchases
  drop constraint if exists course_purchases_profile_id_fkey;

alter table public.course_purchases
  add constraint course_purchases_profile_id_fkey
  foreign key (profile_id) references public.profiles(id)
  on delete set null;

comment on column public.course_purchases.profile_id is
  'Who bought it, or NULL if they have since closed their account. The sale is '
  'kept and detached rather than deleted — see db/096.';

commit;

-- ---------------------------------------------------------------------------
-- Check it. In a transaction you roll back, against a profile that has bought
-- something:
--
--   delete from auth.users where id = '<their id>';
--   select profile_id, amount_cents, paid_at from public.course_purchases;
--
-- The row must still be there with profile_id null. Before this file, the
-- select returned nothing.
-- ---------------------------------------------------------------------------
