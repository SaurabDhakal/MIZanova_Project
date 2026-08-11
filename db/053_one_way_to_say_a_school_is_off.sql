-- ===========================================================================
-- 053_one_way_to_say_a_school_is_off.sql — resolving is_active vs status
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- db/042 recorded this rather than fixing it, and said why:
--
--   > `organisations` now has BOTH `is_active` (from the original schools
--   > table) and `status` (added by db/039, with 'active' / 'trial' /
--   > 'suspended' / 'closed'). Two ways to say a school is switched off will
--   > eventually disagree, and when they do nobody will know which one the
--   > billing code read.
--
-- Nothing kept them in step. Nothing ever has. They agree today only because
-- both carry their defaults on every row, and the first time anybody suspends
-- a school through one of them the other will still say the opposite.
--
-- ---------------------------------------------------------------------------
-- `is_active` GOES, RATHER THAN BECOMING A GENERATED COLUMN
-- ---------------------------------------------------------------------------
-- db/042 offered both. A generated column would have been the cautious
-- choice — one source of truth, existing readers untouched — and it was the
-- wrong one here, because of what the readers turned out to be:
--
--   `fetchSchools` selects `is_active`.
--   `SchoolRow` carries it.
--   NO SCREEN RENDERS IT.
--
-- It is fetched on every load of the Schools page and thrown away. Keeping a
-- second name for a fact nobody reads, in order to protect code that does not
-- use it, would be preserving the duplication and calling it compatibility.
--
-- `status` is also the more honest column. A boolean can only say on or off; a
-- platform admin looking at a tenant list wants to know which of their schools
-- are on TRIAL, and that is a question `is_active` cannot be asked.
--
-- ---------------------------------------------------------------------------
-- WHAT "ACTIVE" MEANS, NOW THAT IT HAS TO BE DECIDED
-- ---------------------------------------------------------------------------
-- Four statuses, and the split is not down the middle:
--
--   active     a paying customer            the app works
--   trial      evaluating, not yet paying   the app works
--   suspended  switched off, may come back  the app should not
--   closed     gone                         the app should not
--
-- A trialling school being treated as inactive would be the exact opposite of
-- what a trial is for. This is written down because a boolean hid the question
-- and somebody would otherwise have to guess it later.
--
-- NOTHING ENFORCES IT YET, and that is deliberate rather than forgotten. No
-- policy consults `status`, so suspending a school today changes a label and
-- not access. Making it cut off a whole school's staff mid-term is a
-- commercial decision with the same shape as the WWCC question in doc 13, and
-- it belongs to Special Miles rather than to this script.
-- ===========================================================================

begin;

-- The view depends on the column, so it goes first and comes back below.
drop view if exists public.schools;

alter table public.organisations drop column if exists is_active;

/*
 * REPRODUCED IN FULL, not patched. `create view` replaces the whole
 * definition, and rebuilding one from memory is how db/046 silently deleted
 * db/036. This is db/042's list with `is_active` removed and two columns that
 * were always there and never exposed added: `kind` tells a Montessori centre
 * from a school, which the client's own brief asks for, and `status` is the
 * point of the script.
 *
 * `security_invoker` so the caller's RLS decides, as before. A view without it
 * reads the underlying table with the OWNER's rights.
 */
create view public.schools with (security_invoker = true) as
  select id,
         name,
         suburb,
         state,
         timezone,
         kind,
         status,
         created_at,
         updated_at
  from public.organisations;

grant select, insert, update on public.schools to authenticated;
revoke all on public.schools from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select id, name, kind, status from public.schools;
--
-- And that the old name is gone rather than hiding somewhere:
--
--   select column_name from information_schema.columns
--    where table_name = 'organisations' and column_name = 'is_active';   -- 0 rows
--
-- The test harness inserts into `schools` naming only `name`, so it is
-- unaffected — but run the suite anyway, because that is the point of having
-- it.
