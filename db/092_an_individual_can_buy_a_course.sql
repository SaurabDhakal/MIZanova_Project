-- ---------------------------------------------------------------------------
-- 092 — An individual can buy a course
-- ---------------------------------------------------------------------------
-- Joe's brief lists "Individual subscriptions and program enrolments (parents,
-- students)" as a revenue stream. Money in MiZanova moves two ways today: a
-- school invoicing a family for a named child, and Special Miles invoicing a
-- school. Both require a school and a student. NOTHING BILLS A PERSON, so the
-- individual account db/088 created is a free account, which is not the
-- business the brief describes.
--
-- ---------------------------------------------------------------------------
-- NO PRICES ARE INVENTED HERE
-- ---------------------------------------------------------------------------
-- `price_cents` is null on every existing course and this file sets none.
-- src/lib/plans.ts is explicit that published figures come from the client's
-- own designs and that "nothing here is estimated or rounded", and Joe's brief
-- says willingness to pay is still being researched with Practera. So this
-- builds the till and leaves the pricing to Special Miles, exactly as
-- Subscriptions lets an administrator agree any rate rather than constraining
-- one.
--
-- null price = free, which is what every course is until somebody decides
-- otherwise. Nothing changes for anybody on the day this is applied.
--
-- ---------------------------------------------------------------------------
-- THE GATE IS THE ENROLMENT POLICY, NOT A BUTTON
-- ---------------------------------------------------------------------------
-- A "Buy" button that a browser could skip is not a paywall. The check goes
-- into `course_enrolments_insert`, so an unpaid enrolment is refused by the
-- database whatever the browser sends — the same reasoning db/020 gives for
-- reading an invoice amount from the database rather than the request.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. What a course costs
-- ---------------------------------------------------------------------------
alter table public.courses
  add column if not exists price_cents integer,
  add column if not exists currency text not null default 'aud';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'courses_price_positive'
  ) then
    alter table public.courses
      add constraint courses_price_positive
      check (price_cents is null or price_cents > 0);
  end if;
end $$;

comment on column public.courses.price_cents is
  'What an individual pays, in cents. NULL means free — see db/092. No price '
  'is set by any migration; Special Miles sets them.';


-- ---------------------------------------------------------------------------
-- 2. What somebody bought
-- ---------------------------------------------------------------------------
-- `on delete restrict` for the course, deliberately. A record of money changing
-- hands must not disappear because somebody tidied up a course, and there is no
-- delete-course path in the product anyway — so this turns a mistake nobody can
-- currently make into one nobody can ever make.
-- ---------------------------------------------------------------------------
create table if not exists public.course_purchases (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id)  on delete restrict,
  profile_id    uuid not null references public.profiles(id) on delete cascade,

  -- Copied at the moment of sale, never read back from `courses`. A price that
  -- changes next term must not rewrite what somebody was charged last term.
  amount_cents  integer not null check (amount_cents > 0),
  currency      text    not null default 'aud',

  status        text    not null default 'pending'
                  check (status in ('pending', 'paid', 'refunded')),

  stripe_session_id        text,
  stripe_payment_intent_id text,

  created_at    timestamptz not null default now(),
  paid_at       timestamptz,

  constraint course_purchases_paid_has_timestamp
    check ((status = 'paid') = (paid_at is not null))
);

create index if not exists course_purchases_profile_idx
  on public.course_purchases (profile_id, course_id);

create unique index if not exists course_purchases_session_idx
  on public.course_purchases (stripe_session_id)
  where stripe_session_id is not null;

alter table public.course_purchases enable row level security;

-- Read your own. A platform admin reads all, because Billing has to be able to
-- answer "did this person pay" when somebody writes in.
drop policy if exists course_purchases_select on public.course_purchases;
create policy course_purchases_select
  on public.course_purchases for select to authenticated
  using (profile_id = auth.uid() or public.is_platform_admin());

-- NO INSERT OR UPDATE POLICY, WHICH IS THE POINT. A purchase row is created and
-- settled by the server holding the service role, after Stripe has been asked
-- what happened. A browser that could write one could enrol itself in anything.
revoke all on public.course_purchases from anon;
grant select on public.course_purchases to authenticated;


-- ---------------------------------------------------------------------------
-- 3. Have I paid for this?
-- ---------------------------------------------------------------------------
create or replace function public.has_paid_for_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.course_purchases p
    where p.course_id = p_course_id
      and p.profile_id = auth.uid()
      and p.status = 'paid'
  );
$$;

revoke all on function public.has_paid_for_course(uuid) from anon;
grant execute on function public.has_paid_for_course(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. Enrolment now asks whether it was paid for
-- ---------------------------------------------------------------------------
-- Everything the old policy checked is kept exactly: it is your own row, the
-- course is published, and your role is one of its audiences. The only addition
-- is the last line.
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
        and c.is_published
        and public.my_role() = any (c.audiences)
        and (
          c.price_cents is null
          or public.has_paid_for_course(c.id)
        )
    )
  );


-- ---------------------------------------------------------------------------
-- 5. Settling a payment, idempotently
-- ---------------------------------------------------------------------------
-- Same shape and the same reason as `mark_invoice_paid` in db/020: the webhook
-- and the browser's return both call this, whichever arrives first wins, and
-- the second is a no-op rather than an error.
-- ---------------------------------------------------------------------------
create or replace function public.mark_course_purchase_paid(
  p_session_id        text,
  p_payment_intent_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.course_purchases
     set status = 'paid',
         paid_at = now(),
         stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id)
   where stripe_session_id = p_session_id
     and status <> 'paid';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.mark_course_purchase_paid(text, text)
  from public, anon, authenticated;
grant execute on function public.mark_course_purchase_paid(text, text) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Check it. From the browser console, signed in as an individual — all three
-- must fail or return nothing:
--
--   await supabase.from('course_purchases').insert({ ... })     -- no policy
--   await supabase.from('course_purchases').update({ status: 'paid' })
--
-- And after a platform admin sets a price on a course, enrolling in it without
-- paying must be refused by the policy rather than by the screen.
-- ---------------------------------------------------------------------------
