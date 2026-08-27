-- ===========================================================================
-- 071_an_invoice_with_no_due_date_can_still_be_chased.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: A PILE OF MONEY THAT CAN NEVER BE OVERDUE
-- ---------------------------------------------------------------------------
-- `invoices.due_date` is nullable — db/020, line 53 — and db/061 computes
-- overdue as:
--
--     where i.status = 'open' and i.due_date is not null and i.due_date < current_date
--
-- The `is not null` is deliberate and it is arithmetically right: an invoice
-- with no due date has missed no deadline.
--
-- But it creates a category nothing on the screen ever mentions. An issued
-- invoice with no due date sits in Outstanding for ever. However long it goes
-- unpaid it can never appear in "Past due date", and no figure on Billing
-- counts it. On this database that is already true of a real row:
--
--     Occupational therapy assessment · issued · $380 · created 18 Aug · no due date
--
-- This is the shape of fault the week has been full of, with the polarity
-- reversed. db/051 decided a screening check with no expiry is the MOST urgent
-- one; here an invoice with no due date is silently the least. Both come from
-- the same place: a null dropped out of a comparison and nothing said so.
--
-- ---------------------------------------------------------------------------
-- COUNTED, NOT RECLASSIFIED
-- ---------------------------------------------------------------------------
-- These do NOT join the overdue figure. Calling an invoice late when nobody
-- ever set a date would be inventing a deadline, and the overdue number is the
-- one somebody quotes in an email to a school.
--
-- They get their own pair of columns so the screen can say the true thing:
-- this much is past its date, and this much has no date to be past.
--
-- The fix at source — requiring a due date when an invoice is ISSUED, leaving
-- drafts open-ended — belongs to the school administrator's invoice form and
-- to whoever owns that folder. It would also reject rows that already exist.
-- Reporting the gap is this screen's job; closing it is not.
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
  )                                               as oldest_overdue,

  -- ISSUED, UNPAID, AND CARRYING NO DEADLINE AT ALL.
  --
  -- Also a subset of outstanding, and disjoint from overdue: an invoice either
  -- has a due date or it does not, so no amount is counted in both. Adding
  -- overdue_cents to this one is therefore safe, which is what lets the screen
  -- say how much of the outstanding total nobody can chase.
  count(*) filter (
    where i.status = 'open'
      and i.due_date is null
  )                                               as no_due_date,
  coalesce(sum(i.amount_cents) filter (
    where i.status = 'open'
      and i.due_date is null
  ), 0)                                           as no_due_date_cents

from public.invoices i
group by i.school_id, i.currency;

grant select on public.school_billing_totals to authenticated;
revoke all on public.school_billing_totals from anon;

-- READ ONLY, AND SAID SO RATHER THAN ASSUMED.
--
-- Supabase's default privileges on `public` hand `authenticated` the full set
-- on every new object, so re-creating this view silently granted insert, update,
-- delete and truncate along with the select db/061 asked for. That has been
-- true since db/061 and was inert: the view carries a GROUP BY, so Postgres
-- refuses to write through it whatever the grant says.
--
-- Inert is not the same as absent. The protection was coming from the shape of
-- the query rather than from a decision, so a later rewrite into something
-- simpler would have made those grants live without anybody touching a grant.
revoke insert, update, delete, truncate, references, trigger
  on public.school_billing_totals from authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select school_id, outstanding_cents, overdue_cents, no_due_date_cents
--   from public.school_billing_totals;
--
-- The invariant worth checking, because it is what the screen's wording
-- depends on — the two subsets must never overlap, and together they cannot
-- exceed what is outstanding:
--
--   select count(*) from public.school_billing_totals
--   where overdue_cents + no_due_date_cents > outstanding_cents;
--   -- must be 0
--
--   select relname, reloptions from pg_class where relname = 'school_billing_totals';
--   -- must include security_invoker=true
--
-- `drop view` then `create view` rather than `create or replace`, because
-- replace cannot add a column in the middle and refuses to change the output
-- list. The grant and the revoke are reissued for the same reason: dropping the
-- view drops them with it, and a view that authenticated cannot select is a
-- Billing page that shows nothing to anybody. db/061 established this pair;
-- losing them here would be silent until somebody opened the screen.
-- ---------------------------------------------------------------------------
