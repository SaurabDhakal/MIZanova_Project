-- ===========================================================================
-- 067_the_schools_view_still_needs_every_column.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY, AND WHY THIS IS THE SECOND TIME
-- ---------------------------------------------------------------------------
-- `public.schools` is the compatibility view over `organisations` from db/039.
-- db/039 added `abn` to the table and left it out of the view. db/042 is
-- literally called "schools view needs every column" because the same thing had
-- already broken five columns once; `abn` survived that pass because nothing
-- read it yet.
--
-- Settings > School reads it now, and the failure was "column schools.abn does
-- not exist" at the moment somebody opened the tab. The lesson db/042 recorded
-- is the one to repeat: a compatibility view that omits a column does not fail
-- when the column is added, it fails whenever somebody finally uses it, which
-- can be months later and looks like a bug in the new screen.
--
-- REPRODUCED IN FULL rather than patched. `create or replace view` replaces the
-- whole definition, and rebuilding one from memory is how db/046 silently
-- deleted db/036's work. Column names, types and order are unchanged; `abn` is
-- appended so nothing reading by position moves.
-- ===========================================================================

begin;

create or replace view public.schools
with (security_invoker = true) as
select
  id,
  name,
  suburb,
  state,
  timezone,
  kind,
  status,
  created_at,
  updated_at,
  abn
from public.organisations;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'schools'
--   order by ordinal_position;
--
-- Ten columns, ending with abn. `security_invoker` matters and is easy to lose
-- in a rewrite: without it the view runs as its owner and every school admin
-- sees every school. db/055 was exactly that mistake on a different view.
--
--   select relname, reloptions from pg_class where relname = 'schools';
--   -- must include security_invoker=true
-- ---------------------------------------------------------------------------
