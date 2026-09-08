-- ---------------------------------------------------------------------------
-- 084 — A family can see who is messaging them
-- ---------------------------------------------------------------------------
-- Signed in as a parent on 4 September 2026, the Messages screen listed a
-- conversation about their own child like this:
--
--     Unknown        22 Aug  ·  about Ethan M.        "hi tesing"
--
-- The "Unknown" is the school administrator.
--
-- ---------------------------------------------------------------------------
-- WHY, AND WHY IT IS STRUCTURAL RATHER THAN A DATA ACCIDENT
-- ---------------------------------------------------------------------------
-- A guardian may read a staff profile through `profiles_select_my_childs_staff`,
-- which is written as a join through `student_educators` — the people ASSIGNED
-- to that child. That is the right rule for a teacher or a specialist.
--
-- A school administrator is never in that table. They are school-wide rather
-- than per-child, which is deliberate — db/029 draws exactly this distinction,
-- and `is_assigned_staff_for()` exists to keep administrators out of the
-- assigned-staff answer. Measured: school admins hold 0 rows in
-- student_educators across the whole product.
--
-- So the name of any administrator who writes to a family cannot be read by
-- that family, Messenger.tsx falls back to `person?.full_name || 'Unknown'`,
-- and the message arrives from nobody. One thread today, and it is not luck
-- that it is one — it is however many times an administrator has used the
-- feature.
--
-- ---------------------------------------------------------------------------
-- THE RULE, AND WHY IT IS THIS ONE
-- ---------------------------------------------------------------------------
-- You may read the name of somebody you share a conversation with.
--
-- Narrower than "a parent may see the administrators at their child's school",
-- which would expose staff a family has never had contact with. It grants
-- nothing that being in the conversation does not already imply: the two people
-- are talking to each other, and a message whose sender cannot be named is
-- worse than useless — it reads as a stranger with access to your child.
--
-- It is also mutual, which is correct. A staff member reading a thread sees the
-- other participants by the same rule.
--
-- ALTERNATIVE CONSIDERED: leave RLS alone and have Messenger render the role —
-- "School administrator" — where the name is missing. Rejected. A family being
-- messaged about their child needs to know which person, not which job, and
-- putting a plausible label over a failed lookup is how a gap stops being
-- noticed.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. The question, as a function
-- ---------------------------------------------------------------------------
-- security definer so it reads `thread_participants` without that table's own
-- policies running inside a policy on `profiles`. There is no recursion today —
-- thread_participants is guarded by is_thread_participant(), which never looks
-- at profiles — and this keeps it that way if either side is ever rewritten.
-- ---------------------------------------------------------------------------
create or replace function public.shares_a_thread_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.thread_participants mine
    join public.thread_participants theirs
      on theirs.thread_id = mine.thread_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = p_profile_id
  );
$$;

comment on function public.shares_a_thread_with(uuid) is
  'True if the caller and the given profile are both participants in at least '
  'one message thread. See db/084.';

revoke all on function public.shares_a_thread_with(uuid) from anon;
grant execute on function public.shares_a_thread_with(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. The policy
-- ---------------------------------------------------------------------------
-- Additive. Every existing policy on profiles is untouched, and RLS is a union
-- of permissive policies, so this can only make a name readable that a
-- conversation already implied — it cannot take anything away.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_people_i_message on public.profiles;
create policy profiles_select_people_i_message
  on public.profiles for select to authenticated
  using (public.shares_a_thread_with(id));


-- ---------------------------------------------------------------------------
-- Check it. Before: 1 thread whose sender a parent cannot name. After: 0.
-- ---------------------------------------------------------------------------
--   select count(*) as threads_with_an_unnameable_participant
--   from public.message_threads t
--   join public.thread_participants a on a.thread_id = t.id
--   join public.profiles pa on pa.id = a.profile_id and pa.role = 'parent'
--   join public.thread_participants b on b.thread_id = t.id
--   join public.profiles pb on pb.id = b.profile_id
--   where pb.profile_id is distinct from pa.profile_id
--     and not exists (
--       select 1 from public.student_educators se
--       join public.student_guardians sg on sg.student_id = se.student_id
--       where se.profile_id = pb.id and sg.profile_id = pa.id
--     );
--
-- Or simply sign in as the parent and open Messages: the thread that read
-- "Unknown" should read "Prabin Bhandari".
