-- ===========================================================================
-- 061_money_is_added_up_by_the_database.sql — billing totals per school
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- THE FAULT THIS FIXES IS A NUMBER THAT WAS ALREADY WRONG, QUIETLY
-- ---------------------------------------------------------------------------
-- The Billing screen summed money in the browser: fetch every invoice, then
-- `.reduce()` over the rows. That is correct only while every invoice fits in
-- one response, and PostgREST returns at most 1000 rows by default and says
-- nothing about the rest.
--
-- So "Collected $48,200" was never a claim about what had been collected. It
-- was a claim about the first thousand invoices, and it would have started
-- being wrong on the thousand-and-first — getting SMALLER as business grew,
-- with nothing on the screen to suggest anything had happened. Nobody
-- reconciling a total against a bank statement would guess the cause.
--
-- Postgres has no such limit and does not ship rows to do arithmetic on them.
--
-- ---------------------------------------------------------------------------
-- GROUPED BY CURRENCY AS WELL AS SCHOOL
-- ---------------------------------------------------------------------------
-- Every invoice today is in `aud` — db/020 defaults it. Summing an `amount_cents`
-- column across currencies would still be wrong, and it is the kind of wrong
-- that produces a plausible number rather than an error. Grouping by currency
-- makes the sum correct by construction: a school billing in two currencies
-- gets two rows instead of one meaningless one. While there is only ever one
-- currency this is indistinguishable from grouping by school alone.
--
-- ---------------------------------------------------------------------------
-- `security_invoker` — AND THE AGGREGATION IS WHY IT MATTERS MORE HERE
-- ---------------------------------------------------------------------------
-- The view aggregates `invoices`, which has RLS. With `security_invoker` the
-- grouping happens over the rows the CALLER may see: a platform admin gets
-- every school, a school administrator gets their own, a parent gets their own
-- child's. One view, three correct answers, no filter to forget.
--
-- Without it the view would run as its owner and hand every signed-in account
-- the revenue of every school in the country. That is exactly what db/055
-- found in `iep_support_totals`, and an aggregate is the easiest place to
-- leave it, because nothing looks like a row of somebody else's data.
-- ===========================================================================

begin;

drop view if exists public.school_billing_totals;

create view public.school_billing_totals
with (security_invoker = true) as
select
  i.school_id,
  i.currency,

  count(*)                                        as invoices,
  count(*) filter (where i.status = 'draft')      as drafts,
  count(*) filter (where i.status = 'open')       as issued,
  count(*) filter (where i.status = 'paid')       as paid,
  count(*) filter (where i.status = 'void')       as voided,

  coalesce(sum(i.amount_cents)
           filter (where i.status = 'paid'), 0)   as collected_cents,
  coalesce(sum(i.amount_cents)
           filter (where i.status = 'open'), 0)   as outstanding_cents,

  -- Overdue is a subset of outstanding, never a separate pile. An invoice is
  -- past its due date or it is not; it is unpaid either way.
  count(*) filter (
    where i.status = 'open'
      and i.due_date is not null
      and i.due_date < current_date
  )                                               as overdue,
  coalesce(sum(i.amount_cents) filter (
    where i.status = 'open'
      and i.due_date is not null
      and i.due_date < current_date
  ), 0)                                           as overdue_cents,
  min(i.due_date) filter (
    where i.status = 'open'
      and i.due_date is not null
      and i.due_date < current_date
  )                                               as oldest_overdue

from public.invoices i
group by i.school_id, i.currency;

grant select on public.school_billing_totals to authenticated;
revoke all on public.school_billing_totals from anon;

commit;


-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select o.name, t.*
--   from public.school_billing_totals t
--   join public.organisations o on o.id = t.school_id
--   order by t.collected_cents desc;
--
-- And that it answers differently for different people — the whole point of
-- security_invoker. As a school administrator it must return AT MOST their own
-- school's row, never every school:
--
--   select count(*) from public.school_billing_totals;
