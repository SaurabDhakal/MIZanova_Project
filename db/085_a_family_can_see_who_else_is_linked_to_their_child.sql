-- ---------------------------------------------------------------------------
-- 085 — A family can see who else is linked to their child
-- ---------------------------------------------------------------------------
-- Two small changes, both for the "About your child" screen: a family can
-- already read WHICH rows link people to their child, and could not read the
-- NAMES on half of them.
--
-- What was already permitted, and unused:
--   student_educators_select   can_view_student(student_id)  → a guardian
--   student_guardians_select   can_view_student(student_id)  → a guardian
--
-- So the links were readable and nothing queried them. Names are the gap:
--
--   staff        profiles_select_my_childs_staff already joins through
--                student_educators, so a parent could always name the teacher
--                and the specialist assigned to their child.
--   guardians    nothing. A parent could see that a second person is linked to
--                their child and not who.
--
-- ---------------------------------------------------------------------------
-- WHY THIS ONE IS NARROWER THAN IT LOOKS
-- ---------------------------------------------------------------------------
-- It reads "a guardian may read the profile of another guardian OF THE SAME
-- CHILD". Not of the same school, not of the same class. The two people already
-- share responsibility for one child, and each of them can already see the
-- other's link row; this only lets them put a name to it.
--
-- It matters most in the case nobody wants to design for and everybody has:
-- separated families. "Who else can open my child's record" is not an idle
-- question there, and answering it with a row count and no name is worse than
-- not answering at all.
--
-- ---------------------------------------------------------------------------
-- AND A NOTE ON A DECISION db/002 CALLED LOCKED
-- ---------------------------------------------------------------------------
-- That migration's comment says "parents see first name + initial only —
-- Ethan M." On 4 September 2026 that was reversed for a parent's OWN child:
-- src/lib/displayName.ts `fullName()` now names the child in full on parent
-- screens. The generated `display_name` column is untouched and still carries
-- every screen that can show more than one household's children.
--
-- The reasoning, in short: `students_select` is `can_view_student(id)`, and a
-- guardian satisfies it only through `is_guardian_of()`. A parent's query has
-- never been able to return another family's child, so the column was a second
-- belt around a rule the database was already keeping. The cost accepted is
-- that a screenshot of a parent screen now carries a surname — recorded in the
-- header of src/pages/parent/Dashboard.tsx so it is not rediscovered as a bug.
-- ---------------------------------------------------------------------------


create or replace function public.shares_a_child_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_guardians mine
    join public.student_guardians theirs
      on theirs.student_id = mine.student_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = p_profile_id
  );
$$;

comment on function public.shares_a_child_with(uuid) is
  'True if the caller and the given profile are both guardians of the same '
  'child. See db/085.';

revoke all on function public.shares_a_child_with(uuid) from anon;
grant execute on function public.shares_a_child_with(uuid) to authenticated;


-- Additive, like db/084. RLS is a union of permissive policies, so this can
-- only make readable a name the family already knew was there.
drop policy if exists profiles_select_my_childs_other_guardians on public.profiles;
create policy profiles_select_my_childs_other_guardians
  on public.profiles for select to authenticated
  using (public.shares_a_child_with(id));


-- ---------------------------------------------------------------------------
-- And the school their child attends
-- ---------------------------------------------------------------------------
-- A parent could read no row of `schools` at all — measured, zero. So the
-- product could not tell a family the name of the school their own child goes
-- to, which is not a secret being kept from them but a screen unable to say
-- something obvious.
--
-- security definer for the same reason as above: this is read from inside a
-- policy, and `students` has policies of its own.
-- ---------------------------------------------------------------------------
create or replace function public.is_my_childs_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_guardians sg
    join public.students s on s.id = sg.student_id
    where sg.profile_id = auth.uid()
      and s.school_id = p_school_id
  );
$$;

comment on function public.is_my_childs_school(uuid) is
  'True if the caller is a guardian of a child enrolled at the given school. '
  'See db/085.';

revoke all on function public.is_my_childs_school(uuid) from anon;
grant execute on function public.is_my_childs_school(uuid) to authenticated;

-- ON `organisations`, NOT `schools`. `schools` is a view — a security_invoker
-- view over organisations — so a policy cannot sit on it and the underlying
-- table is what decides. The existing rule there is
-- `(id = my_school_id()) or is_platform_admin()`, and a parent's profile has no
-- school_id, which is why the answer was zero rows rather than one.
drop policy if exists organisations_select_my_childs_school on public.organisations;
create policy organisations_select_my_childs_school
  on public.organisations for select to authenticated
  using (public.is_my_childs_school(id));


-- ---------------------------------------------------------------------------
-- Check it. Signed in as a parent, "About your child" should name every person
-- under "Who can see this record" and leave none of them blank.
-- ---------------------------------------------------------------------------
--   select count(*) as guardian_links_whose_person_cannot_be_named
--   from public.student_guardians sg
--   where not exists (
--     select 1 from public.profiles p where p.id = sg.profile_id
--   );
