-- ---------------------------------------------------------------------------
-- 106 — Asking how it went
-- ---------------------------------------------------------------------------
-- Somebody turns a suggestion into a goal, checks in once, and then nothing in
-- the product ever asks again. Advice that is never followed up is advice, and
-- what Joe's brief sells is "capacity-building rather than one-off
-- intervention" — the difference between the two is entirely in whether
-- anybody comes back.
--
-- ---------------------------------------------------------------------------
-- PULLED, NEVER PUSHED — and that is a decision this codebase already made
-- ---------------------------------------------------------------------------
-- server/index.js says it plainly, about screening reminders:
--
--     PRESSED BY A PERSON, never fired by a clock. There is no scheduler in
--     this product, and inventing one here would mean its first act was
--     emailing real practitioners without anybody deciding to.
--
-- The same holds and the same answer applies. A nudge here is worked out when
-- somebody opens the product, from data that is already there — no scheduler,
-- no job, and nothing arriving in anybody's inbox because a clock struck.
--
-- It also happens to be the kinder design. A notification that finds you on a
-- Tuesday night to say you have not done the thing you promised yourself is
-- the exact opposite of what this account is for.
--
-- ---------------------------------------------------------------------------
-- WHY THERE IS A SNOOZE AND NOT A DISMISSAL
-- ---------------------------------------------------------------------------
-- Without one, "not now" means the same prompt on the next page load, which is
-- nagging, and this product is used by people for whom a bad fortnight is a
-- symptom rather than a failure of will. db/101 refused a streak counter for
-- exactly this reason.
--
-- Without one being TEMPORARY, "not now" means never — and somebody who put a
-- goal down in a bad month is precisely who should be asked again in a better
-- one.
--
-- So: a date, set by the person, after which it is fair to ask again. They
-- decide when that is; nothing here decides it for them.
-- ---------------------------------------------------------------------------

begin;

alter table public.individual_goals
  add column if not exists nudge_snoozed_until timestamptz;

comment on column public.individual_goals.nudge_snoozed_until is
  'Do not ask how this is going before this date. Set by the person, never by '
  'the product — see db/106.';

commit;

-- ---------------------------------------------------------------------------
-- No policy changes. `individual_goals_own` is already FOR ALL on your own
-- rows, so somebody can snooze their own goal and nobody else's, and there is
-- nothing new to grant.
--
-- Check it. As the owner:
--   update public.individual_goals set nudge_snoozed_until = now() + interval '7 days';
-- and as anybody else, the same statement must touch nothing.
-- ---------------------------------------------------------------------------
