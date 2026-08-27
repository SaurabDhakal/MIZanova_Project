-- ===========================================================================
-- 072_what_a_school_pays_special_miles.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: THE PRODUCT HAD NO RECORD OF ITS OWN REVENUE
-- ---------------------------------------------------------------------------
-- `invoices` (db/020) carries `student_id not null`. Every invoice in this
-- system is a school billing a family for a named child, and db/020 says so:
-- "Not a subscription, and not Special Miles billing the parent."
--
-- So Billing & Revenue shows SCHOOLS' money. Special Miles' own income —
-- what a school pays to use the platform — existed nowhere. A school agreed a
-- price on the phone, was invoiced from a spreadsheet, and the application it
-- was paying for never knew.
--
-- The marketing site already collects a plan on the enquiry form and stores it
-- in `enquiries.plan_key`. Nothing has ever read it back. It is a label on a
-- card.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE DOES NOT CONTAIN A SINGLE PRICE
-- ---------------------------------------------------------------------------
-- The brief is explicit that pricing is unsettled. Joe Abboud's own document,
-- under the challenges this project exists to address:
--
--   "Special Miles is currently collaborating with Practera on a Customer and
--    Market Insights project ... This work examines adoption likelihood, key
--    constraints, WILLINGNESS TO PAY, PRICING STRATEGIES, and market
--    segmentation. The findings will directly inform the design ..."
--
-- The commercial model in the same document names customer groups and says
-- "group packages, institutional subscriptions, and subsidised access models".
-- Segments and shapes, no numbers.
--
-- So the RATE LIVES ON THE AGREEMENT, NOT IN THE CODE. A person types what a
-- school actually agreed. Nothing here decides what anything costs, and a
-- hard-coded figure would be far worse than an empty field: this product has
-- already been bitten by a placeholder rendered as a real claim on a child's
-- record, and a placeholder rendered as a real claim on an INVOICE is a
-- contract dispute.
--
-- It also matches how this business really sells. Consultancy with subsidised
-- access is negotiated per customer; a rate card in a database would be wrong
-- the first time somebody agreed a pilot.
--
-- ---------------------------------------------------------------------------
-- WHY A SECOND INVOICE TABLE RATHER THAN A NULLABLE student_id
-- ---------------------------------------------------------------------------
-- Making `invoices.student_id` nullable would let one table hold both, and
-- would quietly remove the guarantee every family-facing screen leans on —
-- that an invoice is always about one child. These are different documents
-- with different readers, different lifecycles and different RLS: a parent
-- must never see a platform invoice, and a school's business manager has no
-- business in another family's tuition.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. How often a school is billed
-- ---------------------------------------------------------------------------
-- Termly is here because Australian schools budget in terms, and a vendor that
-- can only bill monthly or yearly ends up straddling a school's own cycle.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'billing_period') then
    create type public.billing_period as enum ('monthly', 'termly', 'annual');
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. What a school has agreed to pay
-- ---------------------------------------------------------------------------
-- One live agreement per organisation, enforced below. A school that changes
-- plan ends the old agreement and starts a new one, so the history of what was
-- charged when survives — which is the question asked during a billing dispute.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.organisations(id) on delete restrict,

  -- The tier as it was SOLD, in the customer's language. Free text rather than
  -- an enum on purpose: the five names on the enquiry form (small_school,
  -- mid_school, large_school, essential, premium) do not correspond to the five
  -- customer groups in the brief, and neither list is settled. An enum would
  -- freeze a vocabulary that is still being researched, and renaming an enum
  -- value later rewrites history that an invoice already referred to.
  plan_label    text not null check (btrim(plan_label) <> ''),

  -- WHAT THEY AGREED, IN CENTS, PER PERIOD. Integer cents for the reason
  -- db/020 gives: floating point loses fractions and Stripe speaks in the
  -- smallest unit, so storing what Stripe stores means nothing to convert.
  --
  -- Zero is ALLOWED and is not a mistake. The brief names "subsidised access
  -- models", and a pilot or a sponsored school is a real agreement at a real
  -- rate of nothing. `>= 0` rather than `> 0`, unlike db/020's invoices, and
  -- the screen has to say "free" rather than leaving a blank that reads as
  -- unset.
  rate_cents    integer not null check (rate_cents >= 0),
  currency      text not null default 'aud' check (currency = lower(currency)),
  period        public.billing_period not null default 'annual',

  starts_on     date not null default current_date,
  -- Null means it is running. Set to end it; the row is never deleted, because
  -- what a school used to pay is the answer to most billing questions.
  ends_on       date,

  -- Why this rate. A discount nobody wrote a reason for becomes unexplainable
  -- the moment the person who agreed it leaves.
  note          text check (length(note) <= 2000),

  agreed_by     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint platform_subscriptions_dates_make_sense
    check (ends_on is null or ends_on >= starts_on)
);

-- One LIVE agreement per school. Ended ones are unlimited, so history is kept.
create unique index if not exists platform_subscriptions_one_live
  on public.platform_subscriptions (school_id)
  where ends_on is null;

create index if not exists platform_subscriptions_school_idx
  on public.platform_subscriptions (school_id, starts_on desc);


-- ---------------------------------------------------------------------------
-- 3. What Special Miles has actually billed
-- ---------------------------------------------------------------------------
-- Reuses `invoice_status` from db/020 — draft, open, paid, void — because the
-- lifecycle is genuinely the same and two enums meaning the same four things is
-- how two screens end up disagreeing about what "issued" means.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_invoices (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.organisations(id) on delete restrict,

  -- The period this covers, so a school can see what it is being charged FOR
  -- rather than only how much. Both inclusive.
  period_start  date not null,
  period_end    date not null,

  description   text not null check (btrim(description) <> ''),
  amount_cents  integer not null check (amount_cents >= 0),
  currency      text not null default 'aud' check (currency = lower(currency)),

  status        public.invoice_status not null default 'draft',
  due_date      date,

  issued_at     timestamptz,
  paid_at       timestamptz,

  -- Which agreement produced it. `set null` rather than cascade: an invoice
  -- outlives the agreement it came from, and deleting the history of a charge
  -- because the plan ended is the opposite of what a ledger is for.
  subscription_id uuid references public.platform_subscriptions(id) on delete set null,

  raised_by     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint platform_invoices_period_makes_sense
    check (period_end >= period_start),
  -- The same shape of guarantee db/020 puts on `invoices`: the status and the
  -- timestamp cannot disagree.
  constraint platform_invoices_paid_has_timestamp
    check ((status = 'paid') = (paid_at is not null)),
  -- One invoice per school per period. Raising August twice is the mistake a
  -- manual "raise this period" button makes easy, and a duplicate charge is
  -- the one billing error a customer never forgets.
  constraint platform_invoices_one_per_period
    unique (school_id, period_start, period_end)
);

create index if not exists platform_invoices_school_idx
  on public.platform_invoices (school_id, period_start desc);

create index if not exists platform_invoices_status_idx
  on public.platform_invoices (status);


-- ---------------------------------------------------------------------------
-- 4. updated_at, by trigger rather than by trust
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists platform_subscriptions_touch on public.platform_subscriptions;
create trigger platform_subscriptions_touch
  before update on public.platform_subscriptions
  for each row execute function public.touch_updated_at();

drop trigger if exists platform_invoices_touch on public.platform_invoices;
create trigger platform_invoices_touch
  before update on public.platform_invoices
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- 5. Who may see and change any of this
-- ---------------------------------------------------------------------------
alter table public.platform_subscriptions enable row level security;
alter table public.platform_invoices      enable row level security;

drop policy if exists platform_subscriptions_read on public.platform_subscriptions;
drop policy if exists platform_subscriptions_write on public.platform_subscriptions;
drop policy if exists platform_invoices_read on public.platform_invoices;
drop policy if exists platform_invoices_write on public.platform_invoices;

-- A SCHOOL MAY READ ITS OWN, and that is a deliberate choice rather than an
-- oversight. A customer being able to see what it agreed to pay and what it has
-- been charged is ordinary; hiding it would mean every question became an email
-- to Special Miles. It is read only — a school cannot change its own price.
create policy platform_subscriptions_read on public.platform_subscriptions
  for select to authenticated
  using (
    public.is_platform_admin()
    or (public.is_school_admin() and school_id = public.my_school_id())
  );

create policy platform_subscriptions_write on public.platform_subscriptions
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Drafts are OURS until issued. A school seeing a draft would see a charge
-- being considered, which is the same reasoning db/020 applies to a family and
-- a school's own drafts.
create policy platform_invoices_read on public.platform_invoices
  for select to authenticated
  using (
    public.is_platform_admin()
    or (
      public.is_school_admin()
      and school_id = public.my_school_id()
      and status <> 'draft'
    )
  );

create policy platform_invoices_write on public.platform_invoices
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());


-- ---------------------------------------------------------------------------
-- 6. Nobody marks their own invoice paid from a browser
-- ---------------------------------------------------------------------------
-- The rule db/020 established for family invoices, applied here for the same
-- reason: 'paid' is a claim about money having moved, and only something
-- holding a payment provider's key may make it. There is no Stripe flow for
-- platform invoices yet, so today this means paid is set by the service role —
-- a person reconciling a bank transfer — and never by this application.
--
-- A trigger rather than a policy, so it holds even if a policy is later written
-- carelessly. Exactly db/020's argument.
-- ---------------------------------------------------------------------------
create or replace function public.platform_invoices_guard_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role and for the server, which is the
  -- only path allowed to say this.
  if new.status = 'paid'
     and (tg_op = 'INSERT' or old.status is distinct from 'paid')
     and auth.uid() is not null then
    raise exception
      'An invoice becomes paid when the money is confirmed, not from a browser.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists platform_invoices_guard_paid on public.platform_invoices;
create trigger platform_invoices_guard_paid
  before insert or update on public.platform_invoices
  for each row execute function public.platform_invoices_guard_paid();


-- ---------------------------------------------------------------------------
-- 7. It goes on the audit trail
-- ---------------------------------------------------------------------------
-- db/064 audits what administrators do to schools, invoices, applications and
-- enquiries. Agreeing a price and raising a charge belong on that list: they
-- are the two acts here somebody could later be asked to account for.
--
-- No amount is written into `detail` beyond the one being agreed — this is
-- commercial information about an organisation, not a child's record, so
-- db/069's reasoning does not apply.
-- ---------------------------------------------------------------------------
create or replace function public.audit_platform_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select o.name into v_name from public.organisations o where o.id = new.school_id;

  insert into public.admin_audit_events
    (actor_id, school_id, action, subject_id, subject_label, detail)
  values (
    auth.uid(),
    new.school_id,
    case when tg_op = 'INSERT' then 'subscription.agreed'
         else 'subscription.changed' end,
    new.id,
    coalesce(v_name, 'A school'),
    format('%s, %s %s per %s%s',
      new.plan_label,
      upper(new.currency),
      to_char(new.rate_cents / 100.0, 'FM999999990.00'),
      new.period::text,
      case when new.ends_on is not null
           then format(', ended %s', to_char(new.ends_on, 'DD Mon YYYY'))
           else '' end
    )
  );
  return null;
end $$;

drop trigger if exists audit_platform_subscription on public.platform_subscriptions;
create trigger audit_platform_subscription
  after insert or update on public.platform_subscriptions
  for each row execute function public.audit_platform_subscription();


create or replace function public.audit_platform_invoice_issued()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  -- Only the moment it becomes a demand for money. A draft being edited is
  -- bookkeeping; issuing it is the act with a consequence.
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from 'open') then
    select o.name into v_name from public.organisations o where o.id = new.school_id;

    insert into public.admin_audit_events
      (actor_id, school_id, action, subject_id, subject_label, detail)
    values (
      auth.uid(),
      new.school_id,
      'platform_invoice.issued',
      new.id,
      coalesce(v_name, 'A school'),
      format('%s %s for %s to %s. %s',
        upper(new.currency),
        to_char(new.amount_cents / 100.0, 'FM999999990.00'),
        to_char(new.period_start, 'DD Mon YYYY'),
        to_char(new.period_end, 'DD Mon YYYY'),
        new.description
      )
    );
  end if;
  return null;
end $$;

drop trigger if exists audit_platform_invoice_issued on public.platform_invoices;
create trigger audit_platform_invoice_issued
  after insert or update on public.platform_invoices
  for each row execute function public.audit_platform_invoice_issued();


-- ---------------------------------------------------------------------------
-- 8. What Special Miles is owed, added up by the database
-- ---------------------------------------------------------------------------
-- The lesson of db/061: the Billing page had been summing an unpaginated fetch
-- in the browser, and PostgREST caps at 1000 rows, so "collected" was really
-- "the first thousand invoices" and would have SHRUNK as business grew.
--
-- `security_invoker`, so one view answers correctly for a platform admin
-- (every school) and for a school admin (their own), rather than a filter
-- somebody has to remember.
-- ---------------------------------------------------------------------------
drop view if exists public.platform_revenue_totals;

create view public.platform_revenue_totals
with (security_invoker = true) as
select
  i.school_id,
  i.currency,
  count(*)                                        as invoices,
  count(*) filter (where i.status = 'draft')      as drafts,
  coalesce(sum(i.amount_cents)
           filter (where i.status = 'paid'), 0)   as collected_cents,
  coalesce(sum(i.amount_cents)
           filter (where i.status = 'open'), 0)   as outstanding_cents,
  -- The same pair db/071 added to school billing, for the same reason: an
  -- invoice with no due date can never be overdue, and a figure that silently
  -- excludes it is quietly incomplete.
  coalesce(sum(i.amount_cents) filter (
    where i.status = 'open' and i.due_date is not null and i.due_date < current_date
  ), 0)                                           as overdue_cents,
  coalesce(sum(i.amount_cents) filter (
    where i.status = 'open' and i.due_date is null
  ), 0)                                           as no_due_date_cents
from public.platform_invoices i
group by i.school_id, i.currency;

grant select on public.platform_revenue_totals to authenticated;
revoke all on public.platform_revenue_totals from anon;
-- Supabase's defaults grant the full set on anything new in `public`. This view
-- aggregates, so writes through it would fail anyway — but that is the query's
-- shape protecting it rather than a decision, and a later rewrite would make
-- them live. See db/071.
revoke insert, update, delete, truncate, references, trigger
  on public.platform_revenue_totals from authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select tablename, rowsecurity from pg_tables
--   where tablename in ('platform_subscriptions', 'platform_invoices');
--   -- rowsecurity must be true for both
--
--   select relname, reloptions from pg_class where relname = 'platform_revenue_totals';
--   -- must include security_invoker=true
--
-- One live agreement per school:
--
--   insert into public.platform_subscriptions (school_id, plan_label, rate_cents)
--   values ('<id>', 'A', 100), ('<id>', 'B', 200);
--   -- the second must fail on platform_subscriptions_one_live
--
-- And the guard, which is the one that matters. As a signed-in platform admin:
--
--   insert into public.platform_invoices
--     (school_id, period_start, period_end, description, amount_cents, status, paid_at)
--   values ('<id>', current_date, current_date, 'x', 100, 'paid', now());
--   -- must fail 42501
-- ---------------------------------------------------------------------------
