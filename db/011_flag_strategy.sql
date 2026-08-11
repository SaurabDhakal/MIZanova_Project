-- ===========================================================================
-- MiZanova — 011_flag_strategy.sql
-- Make "Flag this response" actually do something.
--
-- Run 001-010 first. SAFE TO RUN TWICE.
-- ===========================================================================
--
-- THE PROBLEM THIS FIXES
--
-- The strategy screen tells a teacher: "If this intervention is not yielding
-- results, flag this response to request a personalised intervention review
-- from your designated school specialist."
--
-- Flagging previously inserted a row into strategy_feedback and stopped there.
-- The strategy stayed published, no specialist was notified, and nothing on
-- screen changed. The promise on the page was not kept.
--
-- A teacher cannot simply be given UPDATE on ai_strategies: that would let any
-- teacher publish a held suggestion to themselves, which is the whole point of
-- the review gate. So the two writes happen together inside one security
-- definer function, which checks entitlement once and performs exactly the two
-- effects a flag should have.
-- ===========================================================================

create or replace function public.flag_strategy_for_review(
  p_strategy_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me         uuid := auth.uid();
  v_student  uuid;
  v_status   public.strategy_status;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if me is null then
    raise exception 'Not signed in.';
  end if;

  select student_id, status into v_student, v_status
  from public.ai_strategies
  where id = p_strategy_id;

  if v_student is null then
    raise exception 'Strategy not found.';
  end if;

  -- Same entitlement question the policies ask everywhere else.
  if not public.can_staff_view_student(v_student) then
    raise exception 'You do not have access to this strategy.';
  end if;

  if v_status = 'pending_review' then
    raise exception 'That suggestion is already waiting for a specialist.';
  end if;

  insert into public.strategy_feedback (strategy_id, profile_id, action, note)
  values (p_strategy_id, me, 'flagged', v_note);

  -- Back to the queue. The previous review decision is cleared so the
  -- specialist sees it as genuinely unresolved rather than already approved —
  -- a teacher flagging something a specialist released is new information.
  update public.ai_strategies
  set status         = 'pending_review',
      routing_reason = case
                         when v_note is not null
                           then 'Flagged by the teacher using it: ' || v_note
                         else 'Flagged by the teacher using it as unsuitable.'
                       end,
      reviewed_by    = null,
      reviewed_at    = null,
      review_note    = null
  where id = p_strategy_id;
end;
$$;

revoke all on function public.flag_strategy_for_review(uuid, text) from public, anon;
grant execute on function public.flag_strategy_for_review(uuid, text)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Done. No new tables or policies — policy count stays at 47.
-- ---------------------------------------------------------------------------
