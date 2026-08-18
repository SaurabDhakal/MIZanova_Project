-- ===========================================================================
-- 060_deleting_a_school_is_not_deleting_its_people.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- Adds the one thing the Schools page could not do: remove an organisation
-- that was created by mistake and has nothing in it. CLOSING is still how a
-- real customer leaves — db/053 — and nothing here changes that.
--
-- ---------------------------------------------------------------------------
-- SEVEN TABLES POINT AT AN ORGANISATION, AND THEY DO NOT BEHAVE ALIKE
-- ---------------------------------------------------------------------------
--   profiles.school_id      restrict    refuses the delete
--   students.school_id      restrict    refuses the delete
--   invoices.school_id      restrict    refuses the delete
--   resources.school_id     restrict    refuses the delete
--   ai_generation_events    set null    survives, detached — db/026 wanted this
--   invitations.school_id   cascade     DELETED, silently
--   memberships.org_id      cascade     DELETED, silently
--
-- The four `restrict` columns are why deleting a populated school has always
-- been impossible, and they are enough on their own to protect every child's
-- record. This script exists for the two that CASCADE.
--
-- ---------------------------------------------------------------------------
-- WHY A LIVE MEMBERSHIP MUST BLOCK, WHEN `profiles.school_id` ALREADY DOES
-- ---------------------------------------------------------------------------
-- Since db/039 identity has two halves. `profiles.school_id` is what somebody
-- currently IS; `memberships` is what they MAY be. A specialist working at
-- school A while holding a live membership at school B has `school_id = A`,
-- so A's restrict protects A and NOTHING protects B.
--
-- Delete B today and that membership is cascaded away without a word. The
-- person keeps their account, keeps working at A, and quietly loses a place
-- they were entitled to return to. Nobody would ever find out why: there is no
-- deleted-membership record to read, because the row is gone.
--
-- A membership is a grant of access to children's records. Access should be
-- ENDED by somebody, on a date, and be readable afterwards — that is the whole
-- argument db/039 makes about `ended_at`. Removing one as a side effect of
-- tidying up a tenant list is the opposite of it.
--
-- So: end the memberships first, deliberately, and then the school can go.
--
-- Invitations do NOT block. An invitation to an organisation that no longer
-- exists cannot be redeemed and means nothing; cascading it away is correct.
-- The count is exposed below so the screen can still SAY it is happening,
-- because "3 pending invitations were cancelled" is a fact somebody may need.
--
-- ---------------------------------------------------------------------------
-- THE GUARD IS `security definer`, AND THAT IS NOT DECORATION
-- ---------------------------------------------------------------------------
-- It counts rows in `memberships`, which has its own RLS. A plain invoker
-- function would do that count AS THE CALLER: any membership the caller cannot
-- see is counted as zero, and the guard waves through exactly the deletion it
-- exists to stop. A check that reads through the caller's own permissions is
-- not a check.
--
-- Same fault as db/055, wearing different clothes.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The guard
-- ---------------------------------------------------------------------------
create or replace function public.organisation_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  live int;
begin
  select count(*) into live
  from public.memberships
  where organisation_id = old.id
    and ended_at is null;

  if live > 0 then
    raise exception
      'This organisation still has % live staff membership(s). End them before deleting it.', live
      using errcode = 'foreign_key_violation';
  end if;

  return old;
end $$;

drop trigger if exists organisations_guard_delete on public.organisations;
create trigger organisations_guard_delete
  before delete on public.organisations
  for each row execute function public.organisation_delete_guard();


-- ---------------------------------------------------------------------------
-- 2. What is standing in the way — one row per organisation
-- ---------------------------------------------------------------------------
-- `security_invoker` so this is not a second door onto other schools' figures.
-- db/055 shipped a view without it and any signed-in account could read every
-- school's support hours; the counts here are smaller but the door is the same.
--
-- A count this view under-reports can only ever make the screen offer a delete
-- the database then refuses, which is safe. The reverse — a view that sees more
-- than its reader may — is the one that leaks.
create or replace view public.organisation_deletability
with (security_invoker = true) as
select
  o.id,
  (select count(*) from public.students    s where s.school_id      = o.id) as students,
  (select count(*) from public.profiles    p where p.school_id      = o.id) as people,
  (select count(*) from public.memberships m where m.organisation_id = o.id
                                              and m.ended_at is null)       as memberships,
  (select count(*) from public.resources   r where r.school_id      = o.id) as resources,
  (select count(*) from public.invoices    i where i.school_id      = o.id) as invoices,
  (select count(*) from public.invitations v where v.school_id      = o.id) as invitations
from public.organisations o;

grant select on public.organisation_deletability to authenticated;
revoke all on public.organisation_deletability from anon;


-- ---------------------------------------------------------------------------
-- 3. Permission to delete, said out loud
-- ---------------------------------------------------------------------------
-- MEASURED, NOT ASSUMED. db/039, db/042 and db/053 each granted `select,
-- insert, update` on the view and never delete, which reads like delete was
-- withheld. It is not: `tests/rls/organisation-deletion.test.ts` shows a school
-- administrator's delete being refused by RLS with NO error and zero rows —
-- the signature of a policy declining, not of a missing privilege. Supabase's
-- default privileges grant the rest on every object created in `public`.
--
-- RLS was always the real gate, and always sufficient:
-- `schools_write_platform_admin` in db/004 is `for all`, so it has covered
-- delete since the beginning.
--
-- These two lines therefore change nothing today. They are here so the
-- privilege is written down instead of inherited from a default that a future
-- Supabase release or a tightened `alter default privileges` could withdraw
-- without anybody connecting it to a Delete button that stopped working.
--
-- ⚠️ A dropped view takes its grants with it. db/053 does `drop view` then
-- `create view`; if that view is ever rebuilt again, re-run this section.
grant delete on public.schools       to authenticated;
grant delete on public.organisations to authenticated;
revoke all on public.organisations from anon;

commit;


-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
-- Every organisation and what is holding it in place. A row of zeros is a row
-- the Schools page will now offer to delete.
--
--   select o.name, d.*
--   from public.organisation_deletability d
--   join public.organisations o on o.id = d.id
--   order by o.name;
--
-- And that the trigger is on:
--
--   select tgname from pg_trigger
--   where tgrelid = 'public.organisations'::regclass and not tgisinternal;
--   -- expect organisations_guard_delete
