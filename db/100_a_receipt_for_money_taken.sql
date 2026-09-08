-- ---------------------------------------------------------------------------
-- 100 — A receipt for money taken
-- ---------------------------------------------------------------------------
-- db/092 built the till and db/096 made sure closing an account does not
-- destroy the record of a sale. Between those two, the person who actually
-- handed over the money gets nothing they can keep: the individual's home
-- screen lists what they bought, and that is a line on a web page they cannot
-- file, forward, or claim against anything.
--
-- Somebody paying for their own support out of their own pocket may well be
-- claiming it — an NDIS plan, an employer's study allowance, a tax return.
-- "It is on the website" is not an answer to any of those.
--
-- ---------------------------------------------------------------------------
-- A RECEIPT, AND DELIBERATELY NOT A TAX INVOICE
-- ---------------------------------------------------------------------------
-- In Australia a tax invoice has required contents, and the seller's ABN is
-- one of them. This project has refused to print an ABN since the landing page
-- was written, because the one in the client's design is 12 345 678 901 and a
-- fabricated company number on a document about money is a worse lie than a
-- fabricated one on a poster.
--
-- So this produces a RECEIPT: what was bought, what it cost, when, and a
-- number to quote. The screen says plainly that it is not a tax invoice and
-- what would make it one. The day Special Miles supplies an ABN and confirms
-- its GST position, this becomes a tax invoice by adding two lines to a
-- template — not by rebuilding anything.
--
-- ---------------------------------------------------------------------------
-- THE NUMBER IS A SEQUENCE, NOT THE UUID
-- ---------------------------------------------------------------------------
-- `course_purchases.id` is a uuid, which is unquotable down a phone line and
-- meaningless to an accounts department. A receipt number has to be short,
-- ordered and permanent.
--
-- It is assigned on PAYMENT rather than on row creation. A pending row that
-- never settles is somebody who reached Stripe and closed the tab; giving it a
-- receipt number would put gaps in the sequence that look like missing sales
-- to anyone auditing it later.
-- ---------------------------------------------------------------------------

begin;

create sequence if not exists public.receipt_number_seq start with 1001;

alter table public.course_purchases
  add column if not exists receipt_number bigint;

create unique index if not exists course_purchases_receipt_number_idx
  on public.course_purchases (receipt_number)
  where receipt_number is not null;

comment on column public.course_purchases.receipt_number is
  'Short, ordered, permanent. Assigned when the payment settles, never on a '
  'pending row — see db/100.';


-- ---------------------------------------------------------------------------
-- Settling a payment now issues the number
-- ---------------------------------------------------------------------------
-- Same function db/092 wrote, with one clause added. Still idempotent: the
-- webhook and the browser's return both call it, `status <> 'paid'` means the
-- second is a no-op, and `coalesce` means a number is never reissued even if
-- that guard is ever loosened.
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
         stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
         receipt_number = coalesce(receipt_number, nextval('public.receipt_number_seq'))
   where stripe_session_id = p_session_id
     and status <> 'paid';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.mark_course_purchase_paid(text, text)
  from public, anon, authenticated;
grant execute on function public.mark_course_purchase_paid(text, text) to service_role;

-- The sequence is driven only by that function, which runs as the definer.
revoke all on sequence public.receipt_number_seq from public, anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it. Settle a test purchase twice and the number must not move:
--
--   select public.mark_course_purchase_paid('cs_test', 'pi_test');  -- true
--   select public.mark_course_purchase_paid('cs_test', 'pi_test');  -- false
--   select receipt_number from public.course_purchases
--    where stripe_session_id = 'cs_test';
-- ---------------------------------------------------------------------------
