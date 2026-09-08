-- ---------------------------------------------------------------------------
-- 112 — A specialist can name the person who booked them
-- ---------------------------------------------------------------------------
-- db/103 let an individual with no school ask a specialist for forty-five
-- minutes, and db/104 listed the specialists who could be asked. What neither
-- did was let the specialist find out who they had agreed to meet.
--
-- On the Schedule today, an accepted session reads:
--
--     Wednesday 9 September at 9:00 am — somebody
--
-- That is not a display bug. Every select policy on `profiles` is built around
-- a school: staff at the same school, a guardian of a child you teach, someone
-- you already share a message thread with (db/084). An individual belongs to
-- no school and shares no thread, so a specialist reading their row gets
-- nothing back, and the screen says "somebody" because that is all it has.
--
-- ---------------------------------------------------------------------------
-- THE PRODUCT ALREADY SHOWS THE MORE PRIVATE HALF
-- ---------------------------------------------------------------------------
-- The specialist can already read `purpose` — the sentence the person wrote
-- about what they are finding hard, which on the demo account reads "I want
-- help working out a morning routine that survives a bad night". That is the
-- disclosure. Withholding the name while showing the disclosure is the wrong
-- way round: it makes the session harder to conduct without making the person
-- any less exposed.
--
-- And the alternative is worse than untidy. A clinician who cannot name their
-- 9am has to either turn up not knowing, or ask the person to identify
-- themselves at the start of a session they are already nervous about.
--
-- ---------------------------------------------------------------------------
-- AS NARROW AS THE FACT IT IS BUILT ON
-- ---------------------------------------------------------------------------
-- Not "specialists can read individuals". A specialist may read the profile of
-- somebody who has booked THEM, and only while that booking exists. Cancel it
-- and the row goes back to being unreadable, the same way db/084's access ends
-- with the thread.
--
-- It is deliberately not restricted to `accepted`. A request that is still
-- waiting is one the specialist has to decide about, and deciding whether to
-- take somebody on without being allowed to know who they are is not a
-- decision, it is a coin toss. A declined or cancelled booking stops
-- qualifying, so the access lasts exactly as long as the reason for it.
--
-- The direction matters too: this admits the SPECIALIST to the individual's
-- row. It grants the individual nothing new — they already see the specialist
-- through `bookable_specialists`, which is a public directory of people who
-- have chosen to offer their hours.
-- ---------------------------------------------------------------------------

begin;

-- SECURITY DEFINER and a fixed search_path, like every other helper here: the
-- policy calls it on rows the caller cannot otherwise see, so it must not be
-- evaluated with the caller's own rights.
create or replace function public.has_booked_me(candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.individual_bookings b
    where b.specialist_id = auth.uid()
      and b.profile_id = candidate
      and b.status in ('requested', 'accepted')
  );
$$;

comment on function public.has_booked_me(uuid) is
  'True when that person has a live booking with the caller. Used only to let '
  'a specialist name somebody they have agreed to meet — see db/112.';

revoke all on function public.has_booked_me(uuid) from anon;
grant execute on function public.has_booked_me(uuid) to authenticated;

drop policy if exists profiles_select_people_who_booked_me on public.profiles;
create policy profiles_select_people_who_booked_me
  on public.profiles for select to authenticated
  using (public.has_booked_me(id));

commit;

-- ---------------------------------------------------------------------------
-- Check it. As the specialist, before this file: 0 rows. After: 1, and the
-- name is the one on the booking.
--
--   select p.full_name
--   from public.profiles p
--   join public.individual_bookings b on b.profile_id = p.id
--   where b.specialist_id = auth.uid()
--     and b.status in ('requested', 'accepted');
--
-- And the boundary, which matters more: an individual who has NOT booked this
-- specialist must still be invisible to them. Cancel the booking and the same
-- query must go back to returning nothing.
-- ---------------------------------------------------------------------------
