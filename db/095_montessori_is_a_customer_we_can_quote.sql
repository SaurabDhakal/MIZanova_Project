-- ---------------------------------------------------------------------------
-- 095 — Montessori is a customer we can quote
-- ---------------------------------------------------------------------------
-- `organisations.kind` has admitted 'montessori' since the tenancy work, and
-- AddSchoolSection has offered it in a dropdown for just as long. So Special
-- Miles can already RECORD a Montessori centre as a customer.
--
-- What it could not do is take an enquiry from one. `enquiries.plan_key` is a
-- CHECK against five values — three school bands and two family tiers — and a
-- Montessori centre fits none of them. The pricing page offered no way to ask,
-- and the form behind it would have refused the row if it had.
--
-- ---------------------------------------------------------------------------
-- WHY THERE IS NO PRICE ATTACHED TO IT
-- ---------------------------------------------------------------------------
-- This file widens a constraint. It sets no figure, and src/lib/plans.ts gets
-- the Montessori entry with null prices, the same as Large schools.
--
-- That is not laziness. The school bands are priced per student — "Up to 150",
-- "150 to 600" — and docs/11 sets out why that ruler does not fit: Montessori
-- in Australia is substantially early childhood, a centre is not sized like a
-- primary school, and the settings do not have year levels to count children
-- into. Publishing a number by analogy would be inventing a price, which this
-- codebase refuses to do for the same reason it refuses to print an ABN it was
-- never given.
--
-- ---------------------------------------------------------------------------
-- WHY THE KIND STAYS 'school'
-- ---------------------------------------------------------------------------
-- `enquiry_kind` is an enum of 'school' and 'family', and it separates an
-- enquiry from an ORGANISATION from an enquiry from a HOUSEHOLD — which is the
-- distinction the rest of the table depends on, since `organisation_name` is
-- required for one and not the other. A Montessori centre is an organisation.
--
-- Adding a third enum value would mean an ALTER TYPE in its own migration (the
-- value cannot be used in the same transaction that adds it) plus every screen
-- that switches on the kind, to record something `plan_key` already says.
-- ---------------------------------------------------------------------------

begin;

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
      'premium'
    )
  );

comment on column public.enquiries.plan_key is
  'Which published plan the enquiry came from. Nullable — somebody can arrive '
  'at the form without choosing one. See src/lib/plans.ts for the figures, and '
  'db/095 for why montessori carries none.';

commit;

-- ---------------------------------------------------------------------------
-- Check it. This must now succeed where it previously raised 23514:
--
--   insert into public.enquiries (kind, plan_key, organisation_name,
--     contact_name, contact_email)
--   values ('school', 'montessori', 'A Montessori centre',
--     'Someone', 'someone@example.com');
--
-- Roll it back afterwards — this is a live table.
-- ---------------------------------------------------------------------------
