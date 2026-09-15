-- ---------------------------------------------------------------------------
-- 136 — A record that has stopped
-- ---------------------------------------------------------------------------
-- Saurab, looking at a student he had just marked as having left: "after i did
-- they have left there should be all option blacked out".
--
-- He is right, and the screen was worse than he could see from it. A departed
-- child's record still offered:
--
--     + New goal              a goal for a child who is not there to meet it
--     + Register a document   a new IEP document on a closed record
--     Create code             A SIGN-IN for a child who has left the school
--     Log behaviour           an observation of somebody nobody can observe
--     Edit                    the profile, still writable
--
-- "Create code" is the one that matters most. It mints a credential for a
-- child who is no longer enrolled, and nothing anywhere would have stopped it.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS IN THE DATABASE AND NOT ONLY IN THE SCREEN
-- ---------------------------------------------------------------------------
-- Greying the buttons out is the other half of this change, and on its own it
-- would be the weaker half. db/002 already made the argument, about the
-- generated display_name:
--
--     The rule lives in the database, where it cannot be forgotten, rather
--     than in UI code that has to remember it on all 42 screens.
--
-- Seven components render write controls on that page. A rule kept in seven
-- places is a rule that holds until somebody adds an eighth. It also has to
-- hold for a tab left open from before the child left, for a replayed request,
-- and for anything else that talks to PostgREST directly.
--
-- ---------------------------------------------------------------------------
-- WHAT IS REFUSED, AND WHAT IS DELIBERATELY NOT
-- ---------------------------------------------------------------------------
-- The rule is: YOU CANNOT START SOMETHING NEW ABOUT A CHILD WHO HAS LEFT. You
-- can still read everything, correct what is already there, and settle up.
--
-- Refused — all of these begin something:
--   behaviour_logs, home_observations, goals, goal_review_requests,
--   iep_plans, iep_documents, specialist_sessions, specialist_appointments,
--   guardian_access_codes, home_ai_requests, ai_strategies, resource_shares,
--   student_educators, student_guardians
--
-- NOT refused, each for its own reason:
--
--   consents        — a family withdrawing consent must ALWAYS succeed. A
--                     product that refused a withdrawal because the child had
--                     left would be refusing the one request it must never
--                     refuse. Recording a historical consent is also fair.
--   invoices        — a final term's fees are legitimately raised after a
--                     child leaves, and an unpaid one is still owed. The
--                     screen already keeps departed children out of the
--                     NEW-invoice dropdown, which is the right place for a
--                     judgement rather than a rule.
--   student_profiles— a correction to what the school knew is not new activity.
--   message_threads — a conversation may have to continue: chasing that
--                     invoice, or transferring records to the new school.
--   student_access_events — the log of who opened the record. People will keep
--                     opening it; that is the point of keeping it.
--
-- UPDATE and DELETE are untouched everywhere. A mistake in an old log must
-- stay fixable, and a child who left is not a reason to freeze an error into
-- the record.
--
-- ---------------------------------------------------------------------------
-- THE MESSAGE IS WRITTEN FOR THE PERSON WHO SEES IT
-- ---------------------------------------------------------------------------
-- It names the child, says the record is closed rather than broken, and says
-- what to do if it was a mistake. A raised exception from a trigger is the
-- last thing standing between a confusing screen and a confused teacher.
-- ---------------------------------------------------------------------------

begin;

create or replace function public.refuse_if_student_has_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
  v_name   text;
begin
  select is_active, first_name || ' ' || last_name
    into v_active, v_name
  from public.students
  where id = new.student_id;

  -- No such student is not this trigger's argument to have. The foreign key
  -- on every one of these tables refuses it a moment later, and with a better
  -- message than anything invented here.
  if v_active is null or v_active then
    return new;
  end if;

  raise exception
    '% has left the school, so nothing new can be added to their record. '
    'Everything already there can still be read and corrected. If they have '
    'come back, put them on the roll again first.', v_name
    using errcode = '42501';
end;
$$;

revoke all on function public.refuse_if_student_has_left() from public, anon;

-- One trigger per table that begins something. Written as a loop so the list
-- above is the list here, and a table cannot be added to one and missed in the
-- other.
do $$
declare
  t text;
begin
  foreach t in array array[
    'behaviour_logs',
    'home_observations',
    'goals',
    'goal_review_requests',
    'iep_plans',
    'iep_documents',
    'specialist_sessions',
    'specialist_appointments',
    'guardian_access_codes',
    'home_ai_requests',
    'ai_strategies',
    'resource_shares',
    'student_educators',
    'student_guardians'
  ]
  loop
    -- Skip anything a branch has not created yet rather than failing the file.
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, which does not exist here', t;
      continue;
    end if;

    execute format(
      'drop trigger if exists %I on public.%I',
      t || '_refuse_if_left', t);
    execute format(
      'create trigger %I before insert on public.%I
         for each row execute function public.refuse_if_student_has_left()',
      t || '_refuse_if_left', t);
  end loop;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   -- every table in the list above now has one
--   select count(*) from pg_trigger
--   where tgname like '%\_refuse\_if\_left' and not tgisinternal;   -- 14
--
--   -- and it actually refuses
--   select public.set_student_left('<id>', true, 'test');
--   insert into public.goals (student_id, title) values ('<id>', 'x');
--   -- ERROR: <Name> has left the school, so nothing new can be added …
--
--   -- while a correction to what is already there still works
--   update public.behaviour_logs set notes = 'corrected' where student_id='<id>';
--   -- UPDATE n
--
--   -- and putting them back lifts it
--   select public.set_student_left('<id>', false);
--   insert into public.goals (student_id, title) values ('<id>', 'x');  -- OK
--
-- db/verify.sql: ONE new function and FOURTEEN triggers. No new table, no new
-- policy, no column.
-- ---------------------------------------------------------------------------
