-- ===========================================================================
-- 041_review_system_events.sql — let somebody say "seen it"
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHAT WAS WRONG.
--
-- The Global Overview says "6 recent problems" and has said so for two days.
-- All six are `billing.webhook_rejected`, and all six came from
-- `npm run webhook-check` — the script that deliberately sends unsigned and
-- forged webhooks to prove the endpoint refuses them. Three refusals per run,
-- run twice.
--
-- So the panel whose entire job is to be believed has been reporting six
-- problems that are not problems, permanently, with no way to change that.
--
-- ---------------------------------------------------------------------------
-- WHY NOT JUST MAKE A REJECTED WEBHOOK 'info'
-- ---------------------------------------------------------------------------
-- Because the comment next to that line in server/index.js is right:
--
--   Either someone is probing the endpoint, or STRIPE_WEBHOOK_SECRET is wrong.
--   The two look identical from here and have very different consequences —
--   one is noise, the other silently stops every payment being recorded.
--
-- A wrong webhook secret produces exactly this event and means every payment
-- from now on is taken by Stripe and never recorded. Downgrading it to 'info'
-- would hide the single most expensive silent failure in the product in order
-- to tidy a dashboard.
--
-- ---------------------------------------------------------------------------
-- WHY NOT LET THE TEST SCRIPT IDENTIFY ITSELF
-- ---------------------------------------------------------------------------
-- A header saying "this is only a drill" is a header an attacker sends too.
-- Making it unforgeable means signing it, which means the monitoring now has
-- its own secret and its own key rotation — a lot of machinery so that a
-- dashboard can avoid asking a person a question once.
--
-- ---------------------------------------------------------------------------
-- WHAT IT DOES INSTEAD
-- ---------------------------------------------------------------------------
-- The server cannot tell a drill from a probe. A person can, in about four
-- seconds, once. So: a platform admin marks an event reviewed, with a note,
-- and the panel counts what is UNREVIEWED.
--
-- That is how every incident tool works, and it is the honest shape here —
-- the judgement stays with the human who has the context, and the record keeps
-- who made it and when.
--
-- REVIEWED IS NOT RESOLVED. It means somebody looked. An event is never edited
-- and never deleted; the note sits beside it. "We ran the forgery drill" and
-- "the secret was wrong, fixed at 14:20" are both worth keeping, and neither
-- should be a reason for the event itself to disappear.

begin;

alter table public.system_events
  add column if not exists reviewed_at  timestamptz,
  add column if not exists reviewed_by  uuid references public.profiles(id) on delete set null,
  add column if not exists review_note  text;

-- The panel's query: unreviewed things that need somebody. Partial, so it stays
-- small however many events accumulate — at 200 schools this table is the one
-- that grows without anybody watching it.
drop index if exists public.system_events_unresolved_idx;
create index if not exists system_events_needs_review_idx
  on public.system_events (occurred_at desc)
  where reviewed_at is null and severity in ('warning', 'critical');


-- ---------------------------------------------------------------------------
-- Marking one reviewed
-- ---------------------------------------------------------------------------
-- A function rather than an update policy, for the same reason db/022 moved
-- acknowledgement timestamps into a trigger: the time is set by the database,
-- so "I looked at this on Tuesday" cannot be written on Friday.
create or replace function public.review_system_event(
  p_event_id uuid,
  p_note     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only Special Miles staff can review system events.'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_note), '') = '' then
    -- A note is the entire point. "Reviewed" with no reason is indistinguishable
    -- from somebody clearing a red number because it was red.
    raise exception 'Say what this was. A review with no note is just a dismissal.'
      using errcode = '22023';
  end if;

  update public.system_events
     set reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_note = btrim(p_note)
   where id = p_event_id
     and reviewed_at is null;   -- first review stands; it is a record, not a field
end;
$$;

revoke all on function public.review_system_event(uuid, text) from public, anon;
grant execute on function public.review_system_event(uuid, text)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Reviewing a whole run at once
-- ---------------------------------------------------------------------------
-- The drill produces three identical events every time it runs. Asking for
-- three notes teaches people to type "ok" three times, which is worse than one
-- honest note covering all of them.
create or replace function public.review_system_events_like(
  p_source text,
  p_event  text,
  p_note   text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Only Special Miles staff can review system events.'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Say what this was. A review with no note is just a dismissal.'
      using errcode = '22023';
  end if;

  update public.system_events
     set reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_note = btrim(p_note)
   where source = p_source
     and event = p_event
     and reviewed_at is null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.review_system_events_like(text, text, text)
  from public, anon;
grant execute on function public.review_system_events_like(text, text, text)
  to authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
--   select severity, source, event, reviewed_at from public.system_events
--   order by occurred_at desc;
--
-- Then, from the Global Overview as a platform admin, review the six webhook
-- rejections with a note such as "npm run webhook-check, 4 Aug — the forgery
-- drill. Refusals are the endpoint working." The panel should go quiet, and
-- the events should still be there with the note attached.
--
-- If the panel goes quiet and you did NOT review anything, something is wrong
-- with the query rather than with the system.
-- ---------------------------------------------------------------------------
