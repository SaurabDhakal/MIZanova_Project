-- ---------------------------------------------------------------------------
-- 111 — An individual can subscribe
-- ---------------------------------------------------------------------------
-- db/099 built a paid AI tier: a cheaper model for people who have not paid, a
-- capable one for people who have, separate confidence thresholds because the
-- same number does not mean the same thing on both, and separate daily limits.
-- It decides who is on which with `my_ai_tier()`, and wrote this about it:
--
--     "There is no subscription for an individual, so paid means they have
--      bought a course... that is a deliberately narrow definition and it is
--      written down here rather than spread through the server, so that the
--      day a subscription exists this function gains a branch and nothing
--      else moves."
--
-- This is that day, and the reason it cannot wait is worse than an unfinished
-- feature.
--
-- ---------------------------------------------------------------------------
-- THE PAID TIER IS CURRENTLY UNREACHABLE
-- ---------------------------------------------------------------------------
-- Every course in the database has `price_cents = null`, and the checkout
-- route refuses a free course outright — "This course is free — just start
-- it." So no new `course_purchases` row with status 'paid' can be created by
-- anybody, by any route, ever.
--
-- `my_ai_tier()` therefore returns 'free' for every individual on the
-- platform. `paid_model`, `daily_limit_per_user` and the whole escalation
-- path are live code that nothing can reach. The only accounts that answer
-- 'paid' are ones holding purchase rows left over from testing, which is
-- residue rather than a customer.
--
-- That is a capability with no consumer — the fault this codebase keeps
-- finding in itself — and the missing half is a way to pay that does not
-- depend on a priced course existing.
--
-- ---------------------------------------------------------------------------
-- NO PRICE IS INVENTED HERE, AND THAT IS DELIBERATE
-- ---------------------------------------------------------------------------
-- `price_cents` is NULL and `is_offered` is false. Joe Abboud's brief lists
-- willingness to pay and pricing strategy as open questions still being
-- researched with Practera, and src/lib/plans.ts already refuses to print a
-- figure for Montessori and for large schools on exactly that ground. A
-- subscription price arrived at by analogy would be the same fabrication as
-- the placeholder ABN this project has refused to print since the landing page
-- was written.
--
-- So this ships the machinery and leaves the number. `individual_bookings`
-- did the same thing with `fee_cents` — ready, and null, because nobody has
-- priced a specialist's afternoon. Setting a price here is two fields and no
-- deployment; see the bottom of this file.
--
-- ---------------------------------------------------------------------------
-- TRIAL DAYS ARE A COLUMN, NOT A DECISION MADE IN CODE
-- ---------------------------------------------------------------------------
-- Whether there is a free trial, and how long, is a commercial choice nobody
-- has made. `trial_days` is null, which means no trial, and the public copy
-- says so plainly rather than implying one. Set it to 14 and Stripe is told
-- 14; nothing else changes.
--
-- This is also why TrialNotice.tsx must not be reused here. It is a school's
-- badge, and it says outright that MiZanova "has no trial end date and no
-- billing clock" because a school is invoiced after a conversation. A
-- subscription does have both, and they come from Stripe.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. What Special Miles offers — one row, because there is one plan
-- ---------------------------------------------------------------------------
-- A singleton, guarded by a check constraint rather than by everybody
-- remembering. `ai_controls` is the same shape and for the same reason: this
-- is configuration, not a list.
-- ---------------------------------------------------------------------------
create table if not exists public.individual_plan (
  id             integer primary key default 1 check (id = 1),

  name           text not null default 'MiZanova for you',

  -- NULL until Special Miles sets one. Not zero — zero is a price, and a
  -- price nobody has agreed to is exactly what this refuses to print.
  price_cents    integer check (price_cents is null or price_cents > 0),
  currency       text not null default 'aud',

  bill_every     text not null default 'month'
                   check (bill_every in ('month', 'year')),

  -- NULL means no trial. A number means that many days, passed straight to
  -- Stripe, which owns the clock.
  trial_days     integer check (trial_days is null or trial_days between 1 and 90),

  -- Created by Special Miles in their own Stripe dashboard and pasted here.
  -- The server will not start a checkout without it, because a subscription
  -- needs a recurring Price object and there is no way to invent one.
  stripe_price_id text,

  -- Nothing is on sale until this is true AND there is a price AND there is a
  -- Stripe price id. All three, checked in one place, so no screen has to
  -- assemble the rule for itself.
  is_offered     boolean not null default false,

  updated_at     timestamptz not null default now(),

  constraint individual_plan_offered_needs_a_price
    check (
      not is_offered
      or (price_cents is not null and stripe_price_id is not null)
    )
);

insert into public.individual_plan (id) values (1)
  on conflict (id) do nothing;

comment on table public.individual_plan is
  'The one subscription Special Miles offers an individual. Price is null and '
  'is_offered is false until they set them — see db/111.';
comment on column public.individual_plan.trial_days is
  'Null means no trial, which is what the public copy says today. A number is '
  'passed to Stripe as trial_period_days.';

alter table public.individual_plan enable row level security;

-- Readable by anybody signed in; written only by a platform admin.
drop policy if exists individual_plan_select on public.individual_plan;
create policy individual_plan_select
  on public.individual_plan for select to authenticated
  using (true);

drop policy if exists individual_plan_update on public.individual_plan;
create policy individual_plan_update
  on public.individual_plan for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- db/109's lesson, applied on the way in rather than after an audit finds it:
-- granting select does not revoke anything, and Supabase already gives
-- `authenticated` insert, update and delete on a new table in public. Say what
-- is intended instead of relying on a missing policy.
revoke all on public.individual_plan from anon, authenticated;
grant select on public.individual_plan to authenticated;
grant update (price_cents, currency, bill_every, trial_days,
              stripe_price_id, is_offered, updated_at)
  on public.individual_plan to authenticated;


-- ---------------------------------------------------------------------------
-- 2. The price list is public — db/098's precedent, one table further along
-- ---------------------------------------------------------------------------
-- The Pricing page is read by people who are not signed in, which is the whole
-- point of a pricing page. `individual_plan_select` is granted `to
-- authenticated`, so a visitor would see nothing.
--
-- A definer view granted to `anon`, carrying only what a poster in a window
-- carries: what it is called, what it costs, how often, and whether there is a
-- trial. `stripe_price_id` is deliberately NOT selected — it is an
-- integration detail, not a price, and it has no business on a public page.
-- ---------------------------------------------------------------------------
create or replace view public.individual_plan_public
with (security_invoker = false) as
select
  p.name,
  p.price_cents,
  p.currency,
  p.bill_every,
  p.trial_days,
  p.is_offered
from public.individual_plan p
where p.id = 1;

comment on view public.individual_plan_public is
  'The subscription as a poster in a window: no Stripe ids. Readable signed '
  'out, because a shop that hides its prices until you have an account is not '
  'protecting anything — db/098, db/111.';

grant select on public.individual_plan_public to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. Who is subscribed
-- ---------------------------------------------------------------------------
-- `on delete set null` rather than cascade, for db/096's reason exactly:
-- closing an account must not delete the record that money was taken. The row
-- survives with nobody's name on it, which is an amount and a date attached to
-- no person — enough to account for the money, useless for identifying anyone.
-- ---------------------------------------------------------------------------
create table if not exists public.individual_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid references public.profiles(id) on delete set null,

  -- Copied at the moment of sale, never read back from individual_plan. A
  -- price that changes next month must not rewrite what somebody agreed to.
  amount_cents   integer not null check (amount_cents > 0),
  currency       text not null default 'aud',
  bill_every     text not null check (bill_every in ('month', 'year')),

  status         text not null
                   check (status in ('trialing', 'active', 'past_due',
                                     'canceled', 'incomplete')),

  stripe_subscription_id text,
  stripe_customer_id     text,

  -- Stripe owns the clock; these are its answers, kept so a screen can say
  -- when access ends without asking Stripe on every page load.
  current_period_end   timestamptz,
  trial_ends_at        timestamptz,

  -- Cancelling does not end access immediately. Somebody who has paid for the
  -- month keeps the month — taking it away the instant they cancel is charging
  -- for time and then not providing it.
  cancel_at_period_end boolean not null default false,

  created_at     timestamptz not null default now(),
  canceled_at    timestamptz,

  constraint individual_subscriptions_canceled_has_timestamp
    check ((status = 'canceled') = (canceled_at is not null))
);

create index if not exists individual_subscriptions_profile_idx
  on public.individual_subscriptions (profile_id)
  where profile_id is not null;

create unique index if not exists individual_subscriptions_stripe_idx
  on public.individual_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- One live subscription per person. Cancelled ones accumulate as history, so
-- this is a partial index rather than a plain unique constraint.
create unique index if not exists individual_subscriptions_one_live_idx
  on public.individual_subscriptions (profile_id)
  where profile_id is not null
    and status in ('trialing', 'active', 'past_due');

comment on table public.individual_subscriptions is
  'An individual''s subscription. Written only by the server after Stripe has '
  'said what happened — see db/111.';

alter table public.individual_subscriptions enable row level security;

drop policy if exists individual_subscriptions_select
  on public.individual_subscriptions;
create policy individual_subscriptions_select
  on public.individual_subscriptions for select to authenticated
  using (profile_id = auth.uid() or public.is_platform_admin());

-- NO INSERT OR UPDATE POLICY, and the grants say so rather than leaving it to
-- the absence of one. A browser that could write here could subscribe itself.
-- Cancelling goes through the server too, because the thing that actually has
-- to change is at Stripe; a row saying 'canceled' while Stripe keeps billing
-- is worse than no button at all.
revoke all on public.individual_subscriptions from anon, authenticated;
grant select on public.individual_subscriptions to authenticated;


-- ---------------------------------------------------------------------------
-- 4. The branch db/099 said this day would add
-- ---------------------------------------------------------------------------
-- A live subscription is 'trialing', 'active' or 'past_due'.
--
-- PAST_DUE COUNTS AS PAID, deliberately. It means a renewal payment failed and
-- Stripe is retrying — a card that expired, most often. Cutting somebody's
-- support off at the first failed retry, before they have been told, punishes
-- an expired card as though it were a decision. Stripe moves the subscription
-- to 'canceled' when it gives up, and that is the point where access ends.
--
-- A trial counts as paid for the same reason it exists: a trial nobody can use
-- is not a trial.
-- ---------------------------------------------------------------------------
create or replace function public.my_ai_tier()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.individual_subscriptions s
      where s.profile_id = auth.uid()
        and s.status in ('trialing', 'active', 'past_due')
    ) then 'paid'
    when exists (
      select 1
      from public.course_purchases p
      where p.profile_id = auth.uid()
        and p.status = 'paid'
    ) then 'paid'
    else 'free'
  end;
$$;

comment on function public.my_ai_tier() is
  'Which AI tier the caller is on. Paid means a live subscription (db/111) or '
  'a course they bought (db/092) — a subscriber and somebody who paid once '
  'both paid. Trialing and past_due count as live; see db/111 for why.';

revoke all on function public.my_ai_tier() from anon;
grant execute on function public.my_ai_tier() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- TURNING IT ON, when Special Miles has decided
-- ---------------------------------------------------------------------------
-- Create a recurring Price in the Stripe dashboard, then one statement:
--
--   update public.individual_plan set
--     price_cents     = 1200,          -- $12.00, whatever they settle on
--     bill_every      = 'month',
--     trial_days      = 14,            -- or null for no trial
--     stripe_price_id = 'price_1Abc…',
--     is_offered      = true,
--     updated_at      = now()
--   where id = 1;
--
-- The check constraint refuses is_offered without a price and a Stripe id, so
-- a half-configured plan cannot go on sale. Every screen reads the row, so
-- nothing is deployed and nothing is hard-coded.
--
-- ---------------------------------------------------------------------------
-- Check it.
--
--   select public.my_ai_tier();   -- as a subscriber: paid
--                                 -- after cancelling and the period ending: free
--
-- And the one that matters, as any signed-in individual:
--
--   update public.individual_subscriptions set status = 'active';  -- REFUSED
--
-- If that succeeds, somebody can subscribe themselves for nothing.
-- ---------------------------------------------------------------------------
