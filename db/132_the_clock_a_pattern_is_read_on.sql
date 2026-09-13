-- ---------------------------------------------------------------------------
-- 132 — The clock a pattern is read on
-- ---------------------------------------------------------------------------
-- `student_behaviour_patterns` reports the hour incidents cluster around:
--
--     select extract(hour from occurred_at)::int ...
--
-- `occurred_at` is `timestamptz`, so that extracts the hour in the SERVER's
-- timezone, which on Supabase is UTC. The screen then prints it as though it
-- were the school's clock.
--
-- It was invisible until the demo timestamps were corrected. Before that the
-- seed stored 09:15 as 09:15 UTC, so the pattern said "clusters around 09:00"
-- and looked right by coincidence — two mistakes cancelling. With the seed
-- storing the correct instant, the same child now reads:
--
--     Clusters around 00:00 — 3 of 3
--
-- Midnight, for a classroom.
--
-- ---------------------------------------------------------------------------
-- THIS IS THE ONE FIGURE THAT DEPENDS ON A LOCAL CLOCK
-- ---------------------------------------------------------------------------
-- Every other number here is a count and a count has no timezone. "Most often
-- after a demand, 4 of 6" is the same fact in any zone. The peak hour is the
-- exception: it is only meaningful on the wall clock of the room it happened
-- in, because what it actually means is "after morning break" or "the last
-- lesson before lunch".
--
-- ---------------------------------------------------------------------------
-- AUSTRALIA/SYDNEY IS AN ASSUMPTION, AND IT IS WRITTEN DOWN HERE
-- ---------------------------------------------------------------------------
-- Every school in this product today is Australian, and the eastern zone is
-- where the customer and the demo school are. So this is correct now and it is
-- NOT correct forever: the market research targets the US and the UK, and on
-- the day a school in either signs up, this line starts lying to them.
--
-- The real fix then is a timezone column on `organisations`, defaulted from
-- the school's country, joined here. That is a bigger change than this one and
-- it should not be invented before there is a school that needs it. What must
-- not happen is the assumption staying invisible — which is why it is a named
-- constant in one place rather than spread through the query.
--
-- `at time zone` also handles daylight saving, so an incident in July and one
-- in January both report the hour the teacher actually saw.
-- ---------------------------------------------------------------------------

begin;

create or replace function public.student_behaviour_patterns(
  p_student_id uuid,
  p_days       integer default 42
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with window_logs as (
    select *
    from public.behaviour_logs
    where student_id = p_student_id
      and occurred_at >= now() - make_interval(days => p_days)
  ),
  counted as (
    select count(*)::int as total from window_logs
  ),
  top_antecedent as (
    select antecedent as value, count(*)::int as n
    from window_logs
    where antecedent is not null
      and antecedent not in ('unknown', 'other')
    group by antecedent
    order by n desc, value
    limit 1
  ),
  helped_ranked as (
    select jsonb_agg(
             jsonb_build_object('value', value, 'times', n)
             order by n desc, value
           ) as items
    from (
      select what_helped as value, count(*)::int as n
      from window_logs
      where what_helped is not null
        and what_helped not in ('nothing_tried', 'still_escalated', 'other')
      group by what_helped
      order by n desc, value
      limit 3
    ) ranked
  ),
  peak_hour as (
    -- db/132. The school's clock, not the server's. See the header.
    select extract(hour from occurred_at at time zone 'Australia/Sydney')::int as hour,
           count(*)::int as n
    from window_logs
    group by 1
    order by n desc, hour
    limit 1
  ),
  timed as (
    select duration_seconds, occurred_at,
           ntile(2) over (order by occurred_at) as half
    from window_logs
    where duration_seconds is not null
  ),
  trend as (
    select
      avg(duration_seconds) filter (where half = 1) as earlier,
      avg(duration_seconds) filter (where half = 2) as later,
      count(*)::int                                 as timed_count
    from timed
  ),
  settings as (
    select jsonb_agg(jsonb_build_object('value', value, 'times', n)
                     order by n desc, value) as items
    from (
      select unnest(setting_events) as value, count(*)::int as n
      from window_logs
      where 'other' <> all(setting_events) or cardinality(setting_events) > 1
      group by 1
      order by n desc, value
      limit 3
    ) s
  ),
  nothing_worked as (
    select count(*)::int as n
    from window_logs
    where what_helped = 'still_escalated'
  ),
  did_not_fit as (
    select count(*)::int as n
    from window_logs
    where antecedent = 'other' or what_helped = 'other'
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'window_days',   p_days,
    'total',         (select total from counted),

    'top_antecedent',
      (select jsonb_build_object('value', value, 'times', n)
       from top_antecedent),

    'what_has_helped', (select items from helped_ranked),

    'peak_hour',
      (select jsonb_build_object('hour', hour, 'times', n) from peak_hour),

    'common_setting_events', (select items from settings),

    'nothing_worked',
      (select case when n > 0 then n else null end from nothing_worked),

    'did_not_fit',
      (select case when n > 0 then n else null end from did_not_fit),

    'recovery_trend',
      (select case
         when timed_count < 6 or earlier is null or later is null then null
         when later > earlier * 1.2 then 'lengthening'
         when later < earlier * 0.8 then 'shortening'
         else 'steady'
       end
       from trend),

    'recovery_trend_from',
      (select case when timed_count >= 6 then timed_count else null end
       from trend)
  ));
$$;

revoke all on function public.student_behaviour_patterns(uuid, integer) from anon;
grant execute on function public.student_behaviour_patterns(uuid, integer)
  to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   select public.student_behaviour_patterns('<student>')->'peak_hour';
--   -- an hour a school is actually open
--
--   select to_char(occurred_at at time zone 'Australia/Sydney','HH24:MI')
--   from public.behaviour_logs where student_id = '<student>';
--   -- and it agrees with the times the timeline prints
--
-- db/verify.sql: unchanged.
-- ---------------------------------------------------------------------------
