-- ===========================================================================
-- 057 — Unlinking is not editing
-- ===========================================================================
-- Deleting an ordinary working goal fails once an agreed plan points at it.
--
--   delete from goals where id = '…';
--   ERROR: The goals on an agreed plan cannot be changed.
--
-- The caller did not touch the plan. `iep_goals.goal_id` is declared
-- `on delete set null` (db/054), so removing the goal makes Postgres UPDATE the
-- iep_goals row to clear the link — and `iep_goals_guard_frozen` is a BEFORE
-- UPDATE trigger that refuses any change once the plan is agreed. The guard
-- cannot tell the difference between somebody rewriting an agreement and the
-- database tidying up a dangling reference.
--
-- FOUND BY SEEDING DEMO DATA. Re-running a seed script that clears goals threw
-- the message above; nothing about deleting a goal suggests a plan is involved,
-- which is exactly why it is worth a script of its own. A teacher tidying up a
-- goal they wrote by mistake would have hit the same wall with the same
-- baffling message.
--
-- SAME SHAPE AS THE BUG IN db/054 ITSELF. That one blocked deleting a STUDENT
-- who had an agreed plan, because the cascade fired the same guard. It was
-- fixed for DELETE and this is the UPDATE path of the identical mistake: a
-- guard written to stop people editing an agreement, catching the database
-- maintaining its own referential integrity.
--
-- WHAT IS STILL REFUSED. Everything that was refused before. The exemption is
-- narrow and precise: an update whose ONLY effect is clearing goal_id to null.
-- Change a word of the agreement, or point the link at a different goal, and
-- the guard fires exactly as it did.
-- ===========================================================================

create or replace function public.iep_goals_guard_frozen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_status public.iep_plan_status;
  target_plan uuid;
begin
  -- NEW DOES NOT EXIST ON DELETE. Referencing it raises "record new is not
  -- assigned yet", and `coalesce(new, old)` is no safer — the reference itself
  -- is the error, before coalesce ever runs. Branch on TG_OP instead.
  if tg_op = 'DELETE' then
    target_plan := old.plan_id;
  else
    target_plan := new.plan_id;
  end if;

  select status into plan_status from public.iep_plans where id = target_plan;

  -- THE PLAN HAS ALREADY GONE, so this is the cascade from deleting the plan
  -- or the whole student, not somebody editing an agreed plan.
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if plan_status in ('agreed', 'in_review', 'closed', 'superseded') then
    /*
     * THE ONE EXEMPTION: the link being cleared because the goal it pointed at
     * has been deleted. Every other column must be untouched and goal_id must
     * be going to null, never to a different goal — so this cannot be used to
     * quietly re-point an agreed plan at something else.
     */
    if tg_op = 'UPDATE'
       and new.goal_id is null
       and old.goal_id is not null
       and new.plan_id         is not distinct from old.plan_id
       and new.area_of_concern is not distinct from old.area_of_concern
       and new.long_term_goal  is not distinct from old.long_term_goal
       and new.short_term_goal is not distinct from old.short_term_goal
       and new.strategies      is not distinct from old.strategies
       and new.sort_order      is not distinct from old.sort_order
    then
      return new;
    end if;

    raise exception
      'The goals on an agreed plan cannot be changed. Record a review instead, or write a new plan.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- The trigger itself is unchanged; only the function body moved.
drop trigger if exists iep_goals_guard_frozen_trigger on public.iep_goals;
create trigger iep_goals_guard_frozen_trigger
  before insert or update or delete on public.iep_goals
  for each row execute function public.iep_goals_guard_frozen();
