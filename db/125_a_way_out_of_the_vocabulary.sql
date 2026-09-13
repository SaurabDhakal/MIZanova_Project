-- ---------------------------------------------------------------------------
-- 125 — A way out of the vocabulary, and a fact about the day
-- ---------------------------------------------------------------------------
-- docs/19. Two things db/122 got wrong, found by measuring the screen it built
-- and by Saurab reading it.
--
-- ---------------------------------------------------------------------------
-- 1. THE LIST CANNOT HOLD EVERYTHING
-- ---------------------------------------------------------------------------
-- "The fire alarm went off" is not one of the ten antecedents and never will
-- be. A closed vocabulary is what makes these safe to send to a model without
-- redaction and countable afterwards — both of which are worth keeping — but a
-- vocabulary with no exit forces a teacher to either pick something untrue or
-- answer nothing.
--
-- So each list gains 'other', and 'other' carries a short free-text note.
--
-- THE NOTE IS FREE TEXT AND IS TREATED AS SUCH. It goes through redact() and
-- findLeaks() before the model, exactly like the observation notes, and it is
-- the only part of these columns that can carry a name. The coded value is
-- still a code.
--
-- AND 'other' IS ITSELF A MEASUREMENT. A term in which a fifth of incidents did
-- not fit is a term in which this vocabulary needs revising, and there is no
-- other way to know that. The pattern function counts it separately below
-- rather than letting it win "most common antecedent", because "most often
-- happens after: other" is not advice.
--
-- ---------------------------------------------------------------------------
-- 2. A SETTING EVENT IS A FACT ABOUT A DAY AND A ROOM, NOT ABOUT A CHILD
-- ---------------------------------------------------------------------------
-- db/122 put `setting_events` on the log, so a relief teacher covering a room
-- of thirty would tap "Relief staff today" thirty times, and a wet lunchtime is
-- the same fact repeated for every child in the building.
--
-- That is not a data-entry annoyance. It is a category error, and its
-- consequence is that the field stays empty — which matters because a setting
-- event is the most common reason a strategy that worked on Tuesday fails on
-- Wednesday, and an empty field makes a tired fortnight look like a child
-- deteriorating.
--
-- `school_day_context` lets somebody say it once for their day. The log still
-- carries its own copy, so nothing about the pattern function changes and a
-- teacher can still override one child's row.
--
-- PER PERSON, PER DAY, not per room — because this schema has no concept of a
-- room. The closest true statement is "the person doing the logging said this
-- about their day", and that is what is stored. A relief teacher setting it
-- affects the logs they write, which is the right scope for the case that
-- motivated it.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. 'other', and the note that gives it meaning
-- ---------------------------------------------------------------------------
-- Replacing a check constraint rather than adding one: two constraints on the
-- same column both have to pass, so leaving the old one would refuse every
-- 'other' while appearing to permit it.
alter table public.behaviour_logs
  drop constraint if exists behaviour_logs_antecedent_check;
alter table public.behaviour_logs
  add constraint behaviour_logs_antecedent_check
    check (antecedent is null or antecedent in (
      'transition', 'demand', 'denied', 'waiting', 'peer',
      'sensory', 'change', 'correction', 'discomfort',
      'other',      -- see antecedent_note
      'unknown'
    ));

alter table public.behaviour_logs
  drop constraint if exists behaviour_logs_what_helped_check;
alter table public.behaviour_logs
  add constraint behaviour_logs_what_helped_check
    check (what_helped is null or what_helped in (
      'quiet_space', 'familiar_adult', 'movement', 'choice_offered',
      'demand_reduced', 'waited_quietly', 'sensory_item', 'redirected',
      'other',      -- see what_helped_note
      'nothing_tried', 'still_escalated'
    ));

alter table public.behaviour_logs
  drop constraint if exists behaviour_logs_setting_events_check;
alter table public.behaviour_logs
  add constraint behaviour_logs_setting_events_check
    check (setting_events <@ array[
      'poor_sleep', 'unwell', 'medication_change', 'substitute_adult',
      'routine_disrupted', 'family_event', 'first_day_back', 'indoor_play',
      'other'       -- see setting_events_note
    ]::text[]);

alter table public.behaviour_logs
  add column if not exists antecedent_note      text,
  add column if not exists what_helped_note     text,
  add column if not exists setting_events_note  text;

/*
 * SHORT ON PURPOSE. These are an escape hatch, not a second place to write the
 * observation — the notes field already exists, already has dictation, and is
 * where the account of what happened belongs. A cap keeps the two from
 * becoming rivals, and keeps the payload small.
 */
alter table public.behaviour_logs
  drop constraint if exists behaviour_logs_notes_are_short;
alter table public.behaviour_logs
  add constraint behaviour_logs_notes_are_short
    check (
      coalesce(length(antecedent_note), 0) <= 300
      and coalesce(length(what_helped_note), 0) <= 300
      and coalesce(length(setting_events_note), 0) <= 300
    );

comment on column public.behaviour_logs.antecedent_note is
  'What happened, when ''other'' was chosen. Free text: redacted before the '
  'model like any prose. Capped short — the observation belongs in `notes`.';


-- ---------------------------------------------------------------------------
-- 2. The day
-- ---------------------------------------------------------------------------
create table if not exists public.school_day_context (
  id            uuid primary key default gen_random_uuid(),

  -- Whose day. Not a room, because there is no room in this schema, and
  -- inventing one here would be a bigger decision than this table deserves.
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  -- `organisations`, not `schools`: db/039 replaced the original table with a
  -- view of the same name, and a foreign key cannot point at a view. Every
  -- migration since db/065 references the real table for the same reason.
  school_id     uuid not null references public.organisations(id) on delete cascade,

  context_date  date not null default current_date,

  setting_events text[] not null default '{}'
    check (setting_events <@ array[
      'poor_sleep', 'unwell', 'medication_change', 'substitute_adult',
      'routine_disrupted', 'family_event', 'first_day_back', 'indoor_play',
      'other'
    ]::text[]),
  note          text check (coalesce(length(note), 0) <= 300),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One row per person per day. Setting it again edits it rather than stacking.
  unique (profile_id, context_date)
);

create index if not exists school_day_context_today_idx
  on public.school_day_context (profile_id, context_date desc);

drop trigger if exists school_day_context_set_updated_at on public.school_day_context;
create trigger school_day_context_set_updated_at
  before update on public.school_day_context
  for each row execute function public.set_updated_at();

comment on table public.school_day_context is
  'docs/19. What was different about somebody''s day, said once instead of once '
  'per child. Copied onto each behaviour log at write time, so the pattern '
  'function needs no join and a single log can still disagree with the day.';

/*
 * MINE, AND ONLY MINE.
 *
 * This is a note somebody wrote about their own working day. It is not a
 * record about a child, it hangs off no student, and nobody else has a claim
 * on it — a school admin reading "medication changed" out of a teacher's day
 * would be reading about the teacher, not the class.
 *
 * The FACT reaches everybody who needs it by a different route: it is copied
 * onto the behaviour logs, which are governed by the policies that already
 * decide who may see a child's record.
 */
alter table public.school_day_context enable row level security;

drop policy if exists school_day_context_own on public.school_day_context;
create policy school_day_context_own
  on public.school_day_context for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists school_day_context_insert on public.school_day_context;
create policy school_day_context_insert
  on public.school_day_context for insert to authenticated
  with check (
    profile_id = auth.uid()
    and school_id = public.my_school_id()
  );

drop policy if exists school_day_context_update on public.school_day_context;
create policy school_day_context_update
  on public.school_day_context for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists school_day_context_delete on public.school_day_context;
create policy school_day_context_delete
  on public.school_day_context for delete to authenticated
  using (profile_id = auth.uid());

revoke all on public.school_day_context from anon;


-- ---------------------------------------------------------------------------
-- 3. 'other' must not win the count
-- ---------------------------------------------------------------------------
-- "Most often happens after: other" is not advice, for the same reason
-- 'unknown' was excluded in db/122. But unlike 'unknown' it is worth reporting
-- on its own, because a high rate means this vocabulary is failing the people
-- using it and nothing else would ever say so.
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
    select extract(hour from occurred_at)::int as hour, count(*)::int as n
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
  -- db/125. How often the vocabulary failed the person using it.
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

    -- Null when it has never happened, so no screen renders "did not fit: 0".
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
--   update public.behaviour_logs
--     set antecedent = 'other', antecedent_note = 'The fire alarm went off'
--     where id = '<uuid>';                                    -- accepted
--
--   update public.behaviour_logs set antecedent_note = repeat('x', 301)
--     where id = '<uuid>';                                    -- refused, capped
--
--   -- 'other' does not become the headline
--   select public.student_behaviour_patterns('<student>')->'top_antecedent';
--   select public.student_behaviour_patterns('<student>')->'did_not_fit';
--
--   -- and a day belongs to one person
--   insert into public.school_day_context (profile_id, school_id, setting_events)
--   values (auth.uid(), public.my_school_id(), '{substitute_adult}');
--   -- another account selecting it back gets nothing
--
-- db/verify.sql: tables gains school_day_context; policies increases by four.
-- ---------------------------------------------------------------------------
