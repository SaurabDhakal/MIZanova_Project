-- ===========================================================================
-- 021_revoke_consent.sql — withdrawing consent must not depend on the
-- browser's clock
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- THE BUG THIS FIXES
-- ---------------------------------------------------------------------------
-- `revokeConsent` sent `revoked_at: new Date().toISOString()` — a timestamp
-- from the user's own machine. `granted_at` is set by the database. db/002
-- checks that `revoked_at >= granted_at`.
--
-- So if a laptop's clock is even a second behind the server, withdrawing a
-- consent granted moments earlier violates the constraint and fails with
-- `23514`. Found by the test suite the morning after it was written, on a
-- machine running 1.1 seconds slow. It would have reached a parent as an
-- unexplained error on the one screen where they exercise a privacy right.
--
-- Clock skew is not an edge case. Every machine has some, school laptops are
-- rarely well-synchronised, and the window here is as wide as the drift.
--
-- The fix is not a looser constraint — the constraint is correct, and a
-- consent withdrawn before it was granted is nonsense worth refusing. The fix
-- is that neither timestamp comes from a browser.

begin;

-- SECURITY INVOKER — the default, and stated explicitly because it matters.
-- The function runs as the caller, so `consents_update` in db/004 still
-- decides who may withdraw what: the guardian, a school admin who can view
-- the student, or a platform admin. This function changes WHERE THE CLOCK
-- COMES FROM and nothing else about permission.
create or replace function public.revoke_consent(p_consent_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.consents
     set revoked_at = now()
   where id = p_consent_id
     and revoked_at is null;

  get diagnostics v_updated = row_count;

  -- False means either "already withdrawn" or "not yours to withdraw". The
  -- caller cannot tell which, and should not: RLS filtering an update is
  -- indistinguishable from a no-op by design.
  return v_updated > 0;
end;
$$;

revoke all on function public.revoke_consent(uuid) from public, anon;
grant execute on function public.revoke_consent(uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked, from the BROWSER CONSOLE as a parent with a live consent:
--
--   await supabase.rpc('revoke_consent', { p_consent_id: '…' })   // true
--   await supabase.rpc('revoke_consent', { p_consent_id: '…' })   // false
--
-- And as a parent who does not guard that child: false, never an error, and
-- the consent stays live.
-- ---------------------------------------------------------------------------
