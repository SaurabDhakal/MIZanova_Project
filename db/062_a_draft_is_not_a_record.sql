-- ===========================================================================
-- 060_a_draft_is_not_a_record.sql — correcting and discarding a draft invoice
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- NUMBERED 060, NOT 058. Two other branches already claim 058 (profile photos)
-- and 059 (appointments). Two files with the same number is a merge that
-- silently keeps one of them and loses the other.
--
-- ---------------------------------------------------------------------------
-- WHY THERE IS A DELETE POLICY NOW, WHEN db/020 SAID THERE SHOULD NOT BE ONE
-- ---------------------------------------------------------------------------
-- db/020 refused DELETE outright, and its reason still holds: "we billed this
-- and then cancelled it" is a fact a school may have to demonstrate later, so
-- a voided invoice is kept forever.
--
-- A draft is not that fact. `invoices_select` hides drafts from families
-- entirely — nobody outside the office has ever seen one, no money has moved,
-- and nothing has been claimed of anybody. Keeping a mistyped draft forever
-- preserves no record of anything; it only means the sole way to clear a typo
-- is to issue the bill to a family and then cancel it, which manufactures
-- exactly the history db/020 was trying to protect.
--
-- So a draft can be discarded, and everything that has ever been visible to a
-- family still cannot.
--
-- ---------------------------------------------------------------------------
-- THE HOLE THAT WOULD MAKE THAT POLICY UNSAFE ON ITS OWN
-- ---------------------------------------------------------------------------
-- `invoices_update` in db/020 lets a school administrator write any `status`
-- the paid trigger does not catch. A draft-only delete policy and nothing else
-- would therefore allow this, on an invoice a family has already PAID:
--
--   update public.invoices set status = 'draft' where id = '…';
--   delete from public.invoices where id = '…';
--
-- Row-level security tests the row as it stands at the moment of the delete,
-- so "only drafts can be deleted" is worth exactly as much as "nothing can
-- become a draft again". Today nothing enforces the second half.
--
-- `invoices_guard_status_flow` below makes status one-directional: a draft may
-- be issued or abandoned, an issued invoice may be paid or cancelled, and paid
-- and cancelled are final. Nothing returns to draft, so nothing that was ever
-- real becomes deletable. It is a trigger rather than a policy for the same
-- reason `invoices_guard_paid` is one — it holds even if a policy is rewritten
-- carelessly later.
--
-- ---------------------------------------------------------------------------
-- AND WHAT MAY BE EDITED AFTER ISSUING
-- ---------------------------------------------------------------------------
-- db/020 already intended description and due date to stay correctable after
-- issuing — a family that cannot understand what they are being charged for is
-- helped by a clearer wording, and that is the note the policy comment there
-- makes. The amount is different. Silently repricing a bill somebody is
-- looking at, with no trace that it changed, is not a correction. Once a draft
-- has been issued the amount, the currency, the child and the school are
-- fixed; the way to charge something else is to cancel and raise a new one.

begin;

-- ---------------------------------------------------------------------------
-- 1. Status only ever moves forwards
-- ---------------------------------------------------------------------------
create or replace function public.invoices_guard_status_flow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'paid' then
      raise exception
        'A paid invoice cannot change status. The payment is a record of what happened.'
        using errcode = '42501';
    end if;

    if old.status = 'void' then
      raise exception
        'A cancelled invoice cannot be reopened. Raise a new one instead.'
        using errcode = '42501';
    end if;

    if new.status = 'draft' then
      raise exception
        'An invoice that has been issued cannot go back to being a draft.'
        using errcode = '42501';
    end if;
  end if;

  -- What is owed, by whom, for which child. Fixed the moment a family can see
  -- it — see the header. `old.status`, not `new.status`, so the draft-to-open
  -- update that issues an invoice is judged as the draft it still was.
  if old.status <> 'draft' then
    if new.amount_cents is distinct from old.amount_cents
       or new.currency   is distinct from old.currency
       or new.student_id is distinct from old.student_id
       or new.school_id  is distinct from old.school_id
    then
      raise exception
        'An issued invoice cannot be repriced or moved to another child. Cancel it and raise a new one.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_guard_status_flow_trigger on public.invoices;
create trigger invoices_guard_status_flow_trigger
  before update on public.invoices
  for each row execute function public.invoices_guard_status_flow();


-- ---------------------------------------------------------------------------
-- 2. A draft may be discarded
-- ---------------------------------------------------------------------------
-- `status = 'draft'` is first on purpose: it is the clause that makes this
-- policy safe to have at all, and it should be the first thing anybody reading
-- it sees. The rest is the same test as `invoices_insert` — this school's
-- administrator, and only for a child at this school.
drop policy if exists invoices_delete_draft on public.invoices;
create policy invoices_delete_draft
  on public.invoices for delete to authenticated
  using (
    status = 'draft'
    and (
      public.is_platform_admin()
      or (public.is_school_admin() and public.can_view_student(student_id))
    )
  );

commit;

-- ---------------------------------------------------------------------------
-- Check it worked, from the BROWSER CONSOLE while signed in as a SCHOOL ADMIN.
--
-- A draft can be corrected and discarded:
--
--   await supabase.from('invoices').update({ description: 'Corrected' })
--     .eq('id', '<a draft>').select('id')          // one row
--   await supabase.from('invoices').delete()
--     .eq('id', '<a draft>').select('id')          // one row
--
-- An issued invoice cannot be walked backwards or deleted. The first two are
-- refused by the trigger; the third returns an EMPTY ARRAY rather than an
-- error, because a delete filtered out by RLS is not a failure — which is why
-- every caller in src/lib/api.ts checks the rows it touched:
--
--   await supabase.from('invoices').update({ status: 'draft' })
--     .eq('id', '<an issued one>')                 // refused
--   await supabase.from('invoices').update({ amount_cents: 1 })
--     .eq('id', '<an issued one>')                 // refused
--   await supabase.from('invoices').delete()
--     .eq('id', '<an issued one>').select('id')    // []
-- ---------------------------------------------------------------------------
