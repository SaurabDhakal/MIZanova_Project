-- ===========================================================================
-- 042_schools_view_needs_every_column.sql — a compatibility view that was not
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHAT WAS WRONG.
--
-- db/039 renamed `schools` to `organisations` and left a view behind so that
-- nothing referring to `schools` would break. The view exposed three columns:
--
--   select id, name, created_at from public.organisations
--
-- The table it replaced had eight. `fetchSchools()` asks for `suburb`, `state`
-- and `is_active`, so every read failed with "column schools.suburb does not
-- exist" — and the Schools page rendered empty while the Global Overview
-- reported SCHOOLS 0.
--
-- The point of a compatibility view is that callers cannot tell the difference.
-- One that drops five columns is not a compatibility view; it is a smaller
-- table with a familiar name.
--
-- Listed explicitly rather than `select *`, so a column added to organisations
-- later is a deliberate decision to expose rather than an accident. `kind`,
-- `status` and `abn` are deliberately NOT here: they are new concepts that
-- belong to organisations, and code wanting them should say `organisations`.

begin;

drop view if exists public.schools;

create view public.schools with (security_invoker = true) as
  select id,
         name,
         suburb,
         state,
         timezone,
         is_active,
         created_at,
         updated_at
  from public.organisations;

grant select, insert, update on public.schools to authenticated;
revoke all on public.schools from anon;

commit;

-- ---------------------------------------------------------------------------
-- A DUPLICATION WORTH RESOLVING LATER, recorded here rather than left to be
-- discovered: `organisations` now has BOTH `is_active` (from the original
-- schools table) and `status` (added by db/039, with 'active' / 'trial' /
-- 'suspended' / 'closed'). Two ways to say a school is switched off will
-- eventually disagree, and when they do nobody will know which one the billing
-- code read. `status` is the better model; `is_active` should become a
-- generated column over it, or go. Not done here because this script exists to
-- fix a broken page, and mixing the two would make it unreviewable.
--
-- Check it worked:
--   select id, name, suburb, state, is_active from public.schools;
--
-- And from the BROWSER as a platform admin, the Schools page should list them
-- and the Global Overview should stop saying 0.
-- ---------------------------------------------------------------------------
