-- ===========================================================================
-- 044_only_families_sign_themselves_up.sql — staff arrive by invitation
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHAT WAS WRONG.
--
-- `handle_new_user` has accepted three self-selected roles since db/001:
-- educator, parent and specialist. That was right when signing up was the only
-- way in. db/035 gave schools invitations, and the two have been contradicting
-- each other ever since.
--
-- Anybody could open /signup, choose Educator, and get an account. It was never
-- a breach — they land with no school and no membership, so `my_role()` returns
-- nothing and every screen is empty. But it produced:
--
--   * a queue of strangers nobody at any school recognises,
--   * accounts permanently stuck with no path forward, because the person who
--     could rescue them has no idea who they are,
--   * an open door for junk accounts on a product about children,
--
-- and it made the invitation flow optional, which is the opposite of what it is
-- for. An invitation is how a school says "this person works here". Self-signup
-- lets somebody say it about themselves.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS IN THE DATABASE AND NOT THE SIGNUP PAGE
-- ---------------------------------------------------------------------------
-- The role arrives in `raw_user_meta_data`, which is written by the BROWSER.
-- Removing the picker from the page changes what an honest person can choose
-- and nothing about what anybody can send. The comment in db/001 said exactly
-- this about admin roles, and the reasoning has not changed — only the list
-- has.
--
-- ---------------------------------------------------------------------------
-- WHO CAN STILL BECOME WHAT
-- ---------------------------------------------------------------------------
--   parent          signs themselves up. Families and individuals buy programs
--                   directly; this is a real customer segment, not a loophole.
--   educator        invited by their school. redeem_invitation sets the role.
--   specialist      invited by their school, or admitted to the network.
--   school_admin    invited, or created deliberately when a school is onboarded.
--   platform_admin  by running SQL. There is no other path and must not be.
--
-- Nothing about the invitation flow changes: it sends 'parent' at signup and
-- `redeem_invitation` sets the real role afterwards, with the school attached
-- and verification granted in the same transaction.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_role text := nullif(new.raw_user_meta_data ->> 'role', '');
  safe_role    public.user_role;
begin
  -- ONE self-selectable role. Everything else is granted by somebody who
  -- already has standing to grant it.
  if claimed_role = 'parent' then
    safe_role := 'parent';
  else
    -- Covers null, nonsense, and every attempt to claim a role that has to be
    -- given rather than taken.
    safe_role := 'parent';
  end if;

  insert into public.profiles (id, role, first_name, last_name, email)
  values (
    new.id,
    safe_role,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- The branch above is deliberately written out rather than collapsed to
-- `safe_role := 'parent'`. It is the place somebody will come looking when a
-- second self-service role is added — a student buying the Student Success
-- Program, say — and an if/else with a comment is where that decision belongs.
-- Collapsing it saves one line and hides the decision.
--
-- Check it worked. From the BROWSER CONSOLE, signed out:
--
--   await supabase.auth.signUp({
--     email: 'probe@example.com', password: 'longenough123',
--     options: { data: { role: 'educator', first_name: 'Probe' } }
--   })
--
-- The account is created — anybody may sign up — but:
--
--   select role from public.profiles where email = 'probe@example.com';
--
-- must say `parent`. Then delete it:
--   (Supabase dashboard -> Authentication -> delete the user)
-- ---------------------------------------------------------------------------
