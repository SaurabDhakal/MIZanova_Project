-- ===========================================================================
-- 038_peek_guardian_code.sql — read a code without spending it
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- WHAT WAS MISSING FROM db/037.
--
-- A code could be redeemed, and nothing else. That is fine for a parent who
-- already has an account, and useless for the one who does not — which is
-- almost all of them, because the code IS their invitation to the product.
--
-- Without this they arrive at an ordinary signup page, choose whatever role
-- they like, register with whatever address they normally use, and only then
-- discover the code was issued to a different one. The account is already made
-- by that point. It is the same failure the invitation flow had, in a place
-- where the person hitting it is a parent rather than a teacher.
--
-- ---------------------------------------------------------------------------
-- WHAT IT REVEALS, AND WHY EACH PIECE
-- ---------------------------------------------------------------------------
-- Anyone holding a valid code can call this without an account, so what comes
-- back is chosen carefully.
--
--   child_name     first name and last initial, not the full name. Enough for
--                  a parent to know they have the right child; not a full
--                  identity handed to somebody who found a note.
--   school_name    so they know who sent it. Families deal with more than one
--                  organisation and codes arrive weeks after the letter.
--   email_hint     MASKED — 'ja***@example.com'. This is the piece that makes
--                  the difference between a parent who links their child in
--                  thirty seconds and one who registers with the wrong address
--                  and gives up. It is the same masking a bank shows before
--                  sending a one-time code, and for the same reason: enough to
--                  recognise, not enough to learn.
--
-- Nothing here identifies the school's other students, the guardian's real
-- address, or any other code.
--
-- THE 60 BITS ARE STILL THE PROTECTION. This endpoint is rate limited on the
-- server and each wrong attempt against a real code is counted in db/037, but
-- neither is what stops guessing — the length of the code is.

begin;

create or replace function public.peek_guardian_code(p_code_hash text)
returns table (
  child_name  text,
  school_name text,
  email_hint  text,
  expired     boolean
)
language sql
security definer
set search_path = public
as $$
  select
    s.first_name || ' ' || left(s.last_name, 1) || '.',
    sc.name,
    -- ja***@example.com. Two characters is enough to recognise your own
    -- address and not enough to reconstruct somebody else's.
    left(split_part(g.guardian_email, '@', 1), 2)
      || '***@'
      || split_part(g.guardian_email, '@', 2),
    (g.expires_at < now())
  from public.guardian_access_codes g
  join public.students s  on s.id = g.student_id
  join public.schools  sc on sc.id = s.school_id
  where g.code_hash = p_code_hash
    and g.redeemed_at is null
    and g.revoked_at is null;
$$;

revoke all on function public.peek_guardian_code(text)
  from public, anon, authenticated;
grant execute on function public.peek_guardian_code(text) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked. From the CONSOLE as any signed-in user:
--
--   await supabase.rpc('peek_guardian_code', { p_code_hash: 'anything' })
--
-- must be refused — 403 or 404. Only the server may ask this question, so that
-- the rate limiting in front of it cannot be walked around.
-- ---------------------------------------------------------------------------
