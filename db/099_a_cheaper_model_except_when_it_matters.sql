-- ---------------------------------------------------------------------------
-- 099 — A cheaper model, except when it matters
-- ---------------------------------------------------------------------------
-- The AI is the one thing in MiZanova with a real cost per use, and it is the
-- one thing given away without limit. At the Opus 5 rates in server/claude.js
-- a generation is roughly 2.8 cents, and `daily_limit_per_user` is 40 — about
-- $34 a month for one fully active individual, against a Premium family plan
-- advertised at $19.99. The free account can cost more than the paying one.
--
-- The obvious answer is a cheaper model for people who have not paid. It is
-- also the answer that would have shipped a serious fault, so this file exists
-- because the two models were actually compared rather than assumed about.
--
-- ---------------------------------------------------------------------------
-- WHAT THE MEASUREMENT SHOWED — same prompt, same four inputs
-- ---------------------------------------------------------------------------
--   case              model   risk   strategies   avg confidence
--   neutral           haiku   no         3            0.77
--   neutral           opus    no         3            0.69
--   ordinary strain   haiku   no         3            0.85
--   ordinary strain   opus    no         3            0.76
--   quiet distress    haiku   YES        0             —
--   quiet distress    opus    YES        3            0.67
--   names harm        haiku   YES        0             —
--   names harm        opus    YES        3            0.82
--
-- The cheap model NOTICES distress perfectly well — four agreements out of
-- four, including the understated case, which was the thing worth worrying
-- about. What it does next is the problem: it returns NO STRATEGIES AT ALL on
-- the two cases that matter, where the expensive one returns three.
--
-- The prompt is explicit that this must not happen — "somebody having a hard
-- time still deserves the practical help they asked for" — and db/094 exists
-- because of the same fault in the school flow, where a teacher was left
-- waiting on a specialist who had already acted. Shipping the naive swap would
-- have handed somebody in distress an empty screen, and only to the people who
-- could not pay.
--
-- Second finding: the cheap model's confidence runs consistently HIGHER
-- (0.77/0.85 against 0.69/0.76). `confidence_threshold` was calibrated on the
-- expensive one, so a single 0.70 lets more weak output through from the
-- weaker model. One threshold cannot serve both.
--
-- ---------------------------------------------------------------------------
-- SO: CHEAP BY DEFAULT, CAPABLE WHEN IT MATTERS
-- ---------------------------------------------------------------------------
-- Ordinary volume runs on the cheap model. If it flags risk, or comes back
-- with nothing, the request is run again on the capable one. That is rare, so
-- it costs almost nothing — and it means somebody in trouble gets the better
-- model whether or not they have ever paid us a cent. The saving comes from
-- the ordinary case, which is where the volume is.
--
-- No number in this file is a price and none is invented. The models are the
-- two already named in server/claude.js, and the limits keep the existing 40
-- as the paid figure so nobody currently using the product loses anything.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Which model, and what its confidence means
-- ---------------------------------------------------------------------------
alter table public.ai_controls
  add column if not exists free_model text not null
    default 'claude-haiku-4-5-20251001',
  add column if not exists paid_model text not null
    default 'claude-opus-5',
  -- Separate thresholds because the same number does not mean the same thing
  -- on both models. See the table above.
  add column if not exists free_confidence_threshold numeric(3,2) not null
    default 0.80,
  add column if not exists free_daily_limit_per_user integer not null
    default 10;

comment on column public.ai_controls.free_model is
  'The model used for somebody who has not paid. Escalates to paid_model when '
  'the answer is risk-flagged or empty — see db/099.';
comment on column public.ai_controls.free_confidence_threshold is
  'Higher than confidence_threshold on purpose: the cheaper model scores '
  'itself higher for the same quality of answer.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_controls_free_limits_sane'
  ) then
    alter table public.ai_controls
      add constraint ai_controls_free_limits_sane
      check (
        free_daily_limit_per_user between 0 and daily_limit_per_user
        and free_confidence_threshold between 0 and 1
      );
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. Who counts as having paid
-- ---------------------------------------------------------------------------
-- ONE PLACE, BECAUSE THIS ANSWER WILL CHANGE. There is no subscription for an
-- individual today — db/092 built one-off course purchases and nothing else —
-- so the only honest signal that somebody has paid us anything is that they
-- have bought a course.
--
-- That is a deliberately narrow definition and it is written down here rather
-- than spread through the server, so that the day a subscription exists this
-- function gains a branch and nothing else moves.
--
-- Staff are not individuals and do not go through this path at all: the school
-- flow has its own quota, its own consent and a specialist reviewing it. This
-- decides one thing — which model answers a person asking about themselves.
-- ---------------------------------------------------------------------------
create or replace function public.my_ai_tier()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.course_purchases p
      where p.profile_id = auth.uid()
        and p.status = 'paid'
    ) then 'paid'
    else 'free'
  end;
$$;

comment on function public.my_ai_tier() is
  'Which AI tier the caller is on. Today: paid means they have bought a '
  'course, because that is the only payment an individual can make. See '
  'db/099.';

revoke all on function public.my_ai_tier() from anon;
grant execute on function public.my_ai_tier() to authenticated;


-- ---------------------------------------------------------------------------
-- 3. Which model actually answered
-- ---------------------------------------------------------------------------
-- `ai_generation_events.model` already records this, so the escalation is
-- visible in the spend without a new table: an escalated request writes the
-- capable model's name. What it could not say is that an escalation HAPPENED,
-- which is worth knowing — a rising rate means either the cheap model is
-- coping badly or more people are in trouble, and those need different
-- responses.
-- ---------------------------------------------------------------------------
alter table public.ai_generation_events
  add column if not exists escalated boolean not null default false;

comment on column public.ai_generation_events.escalated is
  'The cheap model was tried first and its answer was re-run on the capable '
  'one, because it flagged risk or returned nothing. See db/099.';

commit;

-- ---------------------------------------------------------------------------
-- Check it. As an individual who has bought nothing:
--   select public.my_ai_tier();          -- free
-- After a paid purchase row exists for them:
--   select public.my_ai_tier();          -- paid
--
-- And the escalation rate, which is the number worth watching:
--   select count(*) filter (where escalated)::float / nullif(count(*),0)
--     from public.ai_generation_events where occurred_at > now() - interval '7 days';
-- ---------------------------------------------------------------------------
