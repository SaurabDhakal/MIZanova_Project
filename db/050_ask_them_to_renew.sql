-- ===========================================================================
-- 050_ask_them_to_renew.sql — telling the one person who can fix it
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- `13-Screening-And-Expiry.md` §5 item 4, in its own words:
--
--   > Every notification here points at Special Miles. The person who can
--   > actually fix a lapsing check is the one holding it, and they are never
--   > contacted.
--
-- db/048 built a report. A reviewer opens it, sees that somebody's Working With
-- Children Check runs out in three weeks, and then has to leave the product,
-- find the address, and write the email themselves — which is the step that
-- does not happen on a Friday afternoon.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A COLUMN AND NOT A BUTTON THAT JUST SENDS
-- ---------------------------------------------------------------------------
-- "Have we already asked them?" is the first thing a reviewer needs to know and
-- the one thing a fire-and-forget button cannot answer. Without this, the
-- honest options are to never chase anybody or to chase them weekly, and the
-- second is how a legitimate reminder becomes something people filter out.
--
-- One column, and the screen shows it next to the button.
--
-- ---------------------------------------------------------------------------
-- STILL NOT AUTOMATIC, AND STILL FOR THE SAME REASON
-- ---------------------------------------------------------------------------
-- This does not send anything by itself. There is no scheduler in this product,
-- and inventing one here would mean the first thing it ever did was email real
-- practitioners without a person deciding to. A reviewer presses the button.
--
-- That leaves doc 13 §5 item 1 exactly where it was — a report is not a
-- watcher — but it removes the excuse for not acting once somebody has looked.
-- ===========================================================================

begin;

alter table public.staff_screening
  add column if not exists last_reminded_at timestamptz;

comment on column public.staff_screening.last_reminded_at is
  'When the holder was last asked to renew this check. Null means never — '
  'which is the answer a reviewer needs before pressing send again.';


-- ---------------------------------------------------------------------------
-- The report carries it too
-- ---------------------------------------------------------------------------
-- REPRODUCED IN FULL, deliberately. `create or replace view` replaces the whole
-- definition, and rebuilding one from memory is how db/046 silently deleted
-- db/036. The existing columns keep their names, types and ORDER — Postgres
-- refuses a replacement that reorders them, and the new one is appended.
create or replace view public.screening_overview
with (security_invoker = true) as
select
  s.id,
  s.profile_id,
  s.email,
  s.check_type,
  s.state,
  s.number,
  s.expires_on,
  s.verified_at,
  p.full_name,
  -- Negative once it has passed, which reads correctly in both directions.
  (s.expires_on - current_date) as days_remaining,
  case
    when s.expires_on < current_date then 'expired'
    -- SIXTY DAYS because a WWCC renewal is not instant and a school term is
    -- ten weeks. Warning somebody the week it lapses is telling them after it
    -- is too late to act without disruption.
    when s.expires_on < current_date + 60 then 'expiring'
    else 'valid'
  end as state_of_check,
  s.last_reminded_at
from public.staff_screening s
left join public.profiles p on p.id = s.profile_id
where s.ended_at is null;

comment on view public.screening_overview is
  'Live checks with days remaining, a status, and when the holder was last '
  'asked to renew. Read by the platform admin screen and the sweep script, so '
  'both say the same thing.';

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select email, expires_on, state_of_check, last_reminded_at
--     from public.screening_overview order by days_remaining;
