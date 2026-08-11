-- ===========================================================================
-- 020_billing.sql — invoices a school issues and a family pays (FR / M11)
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- The model comes from the design: a school bills a family for a named child
-- — "November Tuition", "Speech Therapy (12 sessions)" — and the parent pays.
-- Not a subscription, and not Special Miles billing the parent.
--
-- MONEY IS AN INTEGER NUMBER OF CENTS.
-- ---------------------------------------------------------------------------
-- $12.30 cannot be represented exactly in binary floating point, so a column
-- of type real or double precision quietly loses fractions of a cent and the
-- totals stop adding up. `numeric` would be exact, but Stripe's API speaks in
-- the smallest currency unit, and converting back and forth is the other
-- classic way to introduce rounding errors. Storing exactly what Stripe stores
-- means there is never a conversion to get wrong.
--
-- WHO CAN SAY SOMETHING IS PAID.
-- ---------------------------------------------------------------------------
-- Nobody using a browser. Not the parent, obviously, and not the school
-- either. `status` only reaches 'paid' through a function the API server calls
-- after Stripe confirms the money moved. A trigger enforces that, so it holds
-- even if a policy is later written carelessly.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum (
      'draft',   -- being prepared, the family cannot see it
      'open',    -- issued and payable
      'paid',
      'void'     -- cancelled; kept, never deleted
    );
  end if;
end $$;

create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete restrict,
  student_id  uuid not null references public.students(id) on delete restrict,

  -- Shown to the family, so it has to make sense to somebody who was not in
  -- the meeting: "Speech therapy, 12 sessions, term 3".
  description text not null check (btrim(description) <> ''),

  amount_cents integer not null check (amount_cents > 0),
  currency     text not null default 'aud' check (currency = lower(currency)),

  status      public.invoice_status not null default 'draft',
  due_date    date,

  issued_by   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  paid_at     timestamptz,

  -- Stripe's own identifiers, so a payment here can be matched to a payment
  -- there without guessing from amounts and timestamps.
  stripe_session_id        text unique,
  stripe_payment_intent_id text,

  constraint invoices_paid_has_timestamp
    check ((status = 'paid') = (paid_at is not null))
);

create index if not exists invoices_student_idx on public.invoices (student_id);
create index if not exists invoices_school_idx  on public.invoices (school_id);

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Only the server may mark an invoice paid
-- ---------------------------------------------------------------------------
create or replace function public.invoices_guard_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    -- auth.role() is 'service_role' only for the API server's key, which never
    -- leaves the server. Every browser session is 'authenticated'.
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception
        'An invoice is marked paid by the payment system, not by a person.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_guard_paid_trigger on public.invoices;
create trigger invoices_guard_paid_trigger
  before update on public.invoices
  for each row execute function public.invoices_guard_paid();

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
alter table public.invoices enable row level security;

-- A family sees its own child's invoices, but never a draft: an amount someone
-- is still deciding is not a bill.
drop policy if exists invoices_select on public.invoices;
create policy invoices_select
  on public.invoices for select to authenticated
  using (
    public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
    or (public.is_guardian_of(student_id) and status <> 'draft')
  );

drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert
  on public.invoices for insert to authenticated
  with check (
    public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
  );

-- Editing covers correcting a description, changing a due date, issuing a
-- draft, or voiding. Marking paid is refused by the trigger above regardless
-- of what this allows.
drop policy if exists invoices_update on public.invoices;
create policy invoices_update
  on public.invoices for update to authenticated
  using (
    public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
  )
  with check (
    public.is_platform_admin()
    or (public.is_school_admin() and public.can_view_student(student_id))
  );

-- No delete policy. A voided invoice stays: "we billed this and cancelled it"
-- is a fact somebody may need to demonstrate later.

revoke all on public.invoices from anon;

-- ---------------------------------------------------------------------------
-- Called by the API server once Stripe confirms payment
-- ---------------------------------------------------------------------------
-- Idempotent on purpose. Stripe can tell us about the same payment more than
-- once, and paying twice for one invoice must not be recordable.
create or replace function public.mark_invoice_paid(
  p_invoice_id        uuid,
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
  update public.invoices
     set status = 'paid',
         paid_at = now(),
         stripe_session_id = coalesce(stripe_session_id, p_session_id),
         stripe_payment_intent_id = p_payment_intent_id
   where id = p_invoice_id
     and status <> 'paid';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.mark_invoice_paid(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_invoice_paid(uuid, text, text) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked, from the BROWSER CONSOLE while signed in as a PARENT.
-- Both must fail:
--
--   await supabase.from('invoices').update({ status: 'paid' }).eq('id', '…')
--   await supabase.rpc('mark_invoice_paid', { p_invoice_id: '…', … })
--
-- The first is refused by the trigger, the second because the function is not
-- granted to anyone with a browser session.
-- ---------------------------------------------------------------------------
