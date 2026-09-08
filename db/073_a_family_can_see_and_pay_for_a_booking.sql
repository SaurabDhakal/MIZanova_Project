-- ===========================================================================
-- 073_a_family_can_see_and_pay_for_a_booking.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: THE BRIEF ASKS FOR BOOKINGS WITH PAYMENTS, AND HALF OF IT IS MISSING
-- ---------------------------------------------------------------------------
-- Joe Abboud's requirements list, item 3:
--
--   "Bookings & integrated payments — secure session/workshop scheduling with
--    payment gateway integration and automated confirmations."
--
-- db/059 built the scheduling. It has no amount, no price and no payment of any
-- kind, and Stripe touches only `invoices`.
--
-- Worse, and found while looking: THE FAMILY CANNOT SEE THE BOOKING AT ALL.
-- db/059's select policies admit the assigned specialist and a platform admin.
-- A parent has no policy, so a child can be booked for speech therapy on
-- Tuesday and nobody at home is told by this product. That is a gap on its own,
-- before any money is involved.
--
-- ---------------------------------------------------------------------------
-- NOT A SECOND PAYMENT RAIL
-- ---------------------------------------------------------------------------
-- The obvious build is a price on the appointment and a new Stripe flow beside
-- it. That would be two ways to take a family's money, two webhooks and two
-- places for "paid" to be wrong.
--
-- An appointment fee IS what `invoices` already models: a school billing a
-- family for a named child. db/020 has the table, the statuses, the Stripe
-- session, the webhook and the trigger that stops anybody claiming payment from
-- a browser. So a fee becomes an ordinary invoice, and everything downstream —
-- the parent's Finance screen, checkout, the receipt — already works.
--
-- ---------------------------------------------------------------------------
-- WHY A FUNCTION RATHER THAN A POLICY
-- ---------------------------------------------------------------------------
-- db/020 lets a school administrator create invoices. A specialist is not one,
-- and widening that policy to include them would let any verified specialist
-- bill any family they can see, for any amount, at any time.
--
-- The function below writes exactly one invoice, for exactly one appointment
-- the caller owns, for exactly the fee recorded on it. It is the narrow version
-- of the same permission.
--
-- IT RAISES A DRAFT, NOT A DEMAND. The school's name is on a family invoice, so
-- the school decides what its families are asked to pay; the specialist says
-- what a session cost. db/020 already defines draft as "the family cannot see
-- it", which is exactly the state this should land in.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. What a session costs, and what was raised for it
-- ---------------------------------------------------------------------------
alter table public.specialist_appointments
  add column if not exists fee_cents integer
    check (fee_cents is null or fee_cents >= 0);

-- NULL IS THE NORMAL CASE AND MEANS "NO SEPARATE CHARGE". Most school-based
-- therapy is inside whatever the school already pays; billing every session by
-- default would be the wrong assumption to bake in. Zero is different again and
-- is allowed: a session deliberately provided free, which somebody chose.
comment on column public.specialist_appointments.fee_cents is
  'Cents. Null means no separate charge — included in what the school already pays. Zero means deliberately free.';

alter table public.specialist_appointments
  add column if not exists invoice_id uuid
    references public.invoices(id) on delete set null;

-- One invoice per appointment. Without this, pressing the button twice bills a
-- family twice for one session, and a duplicate charge is the billing mistake a
-- customer never forgets. `on delete set null` above rather than cascade: an
-- appointment outlives a voided invoice.
create unique index if not exists specialist_appointments_one_invoice
  on public.specialist_appointments (invoice_id)
  where invoice_id is not null;


-- ---------------------------------------------------------------------------
-- 2. A family can see their own child's appointments
-- ---------------------------------------------------------------------------
-- Read only, and deliberately so. A parent knowing when their child is seen is
-- ordinary; a parent moving a clinician's calendar is not.
--
-- `is_guardian_of` is db/003's helper, the same one every other family-facing
-- policy uses, so this cannot drift from the rest of the rules about who a
-- child's family is.
-- ---------------------------------------------------------------------------
drop policy if exists specialist_appointments_select_guardian
  on public.specialist_appointments;
create policy specialist_appointments_select_guardian
  on public.specialist_appointments for select to authenticated
  using (public.is_guardian_of(student_id));


-- ---------------------------------------------------------------------------
-- 3. Turning a fee into something payable
-- ---------------------------------------------------------------------------
-- security definer, because it writes an `invoices` row the caller is not
-- otherwise allowed to write. Everything it will not do is checked before it
-- does anything.
-- ---------------------------------------------------------------------------
create or replace function public.raise_appointment_invoice(
  p_appointment_id uuid,
  p_due_date       date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt    public.specialist_appointments;
  v_school  uuid;
  v_invoice uuid;
  v_child   text;
begin
  select * into v_appt
  from public.specialist_appointments
  where id = p_appointment_id;

  if v_appt.id is null then
    raise exception 'That appointment does not exist.' using errcode = 'P0002';
  end if;

  -- THE CALLER MUST OWN IT. A verified specialist may bill for their own
  -- session and nobody else's; a school administrator may do it for any child
  -- they can already see, because raising invoices is their job anyway.
  if not (
    (v_appt.specialist_id = auth.uid() and public.am_i_verified())
    or (public.is_school_admin() and public.can_view_student(v_appt.student_id))
  ) then
    raise exception 'Only the specialist who booked it, or the school, may bill for it.'
      using errcode = '42501';
  end if;

  if v_appt.fee_cents is null or v_appt.fee_cents = 0 then
    raise exception 'That appointment has no fee to bill.' using errcode = '22023';
  end if;

  if v_appt.invoice_id is not null then
    raise exception 'That appointment has already been billed.' using errcode = '23505';
  end if;

  -- A cancelled session is not a service delivered. Said explicitly rather than
  -- left to whoever presses the button.
  if v_appt.status = 'cancelled' then
    raise exception 'That appointment was cancelled.' using errcode = '22023';
  end if;

  select s.school_id, s.display_name into v_school, v_child
  from public.students s where s.id = v_appt.student_id;

  insert into public.invoices
    (school_id, student_id, description, amount_cents, status, due_date, issued_by)
  values (
    v_school,
    v_appt.student_id,
    -- Readable to somebody who was not in the room, which is db/020's own test
    -- for this field.
    format('%s — %s, %s',
      coalesce(nullif(btrim(v_appt.purpose), ''), 'Specialist session'),
      to_char(v_appt.starts_at, 'DD Mon YYYY'),
      format('%s minutes', v_appt.duration_minutes)
    ),
    v_appt.fee_cents,
    -- Draft. The school's name is on this, so the school issues it.
    'draft',
    p_due_date,
    auth.uid()
  )
  returning id into v_invoice;

  update public.specialist_appointments
     set invoice_id = v_invoice
   where id = p_appointment_id;

  return v_invoice;
end $$;

revoke all on function public.raise_appointment_invoice(uuid, date) from public, anon;
grant execute on function public.raise_appointment_invoice(uuid, date) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select column_name from information_schema.columns
--   where table_name = 'specialist_appointments'
--     and column_name in ('fee_cents', 'invoice_id');
--   -- both present
--
-- The one that matters. Signed in as a GUARDIAN, their child's appointments
-- must now be visible and nobody else's:
--
--   select count(*) from public.specialist_appointments;
--
-- And billing twice must be refused:
--
--   select public.raise_appointment_invoice('<id>');
--   select public.raise_appointment_invoice('<id>');  -- must fail 23505
--
-- STILL NOT DONE, and named so it is not mistaken for finished: the brief also
-- asks for "automated confirmations". Nothing emails a family when an
-- appointment is booked, moved or cancelled. The mail path exists (db/043) but
-- Render blocks outbound SMTP, so that work is blocked on hosting rather than
-- on code — see the deployment notes.
-- ---------------------------------------------------------------------------
