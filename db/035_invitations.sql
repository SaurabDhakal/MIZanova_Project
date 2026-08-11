-- ===========================================================================
-- 035_invitations.sql — how a real school actually adds forty teachers
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- Today the only way in is /signup: anyone claims a role, lands unverified, and
-- waits for an administrator to notice them. That works for one person testing
-- and fails completely in the last week of January, when a school needs its
-- whole staff onboarded and nobody knows who half the pending names are.
--
-- An invitation reverses the direction of trust. Instead of a stranger claiming
-- "I work at St Paul's" and an administrator trying to confirm it, the
-- administrator says "this person works here" first, and the account is created
-- already attached and already verified — because the only person whose word
-- verification means has already given it.
--
-- ---------------------------------------------------------------------------
-- THE TOKEN IS A CREDENTIAL. It is treated like one.
-- ---------------------------------------------------------------------------
-- Anyone holding a valid token gets a staff account at a named school with
-- access to children's records. That makes it exactly as sensitive as a
-- password, and it gets the same handling:
--
--   Generated on the server   a browser must never choose its own token
--   Stored HASHED             a database read must not yield working invitations
--   Shown once                at creation, then never again; lost means reissue
--   Single use                accepted_at is set once and checked
--   Expiring                  14 days; an invitation in an inbox for a year is
--                             an unlocked door somebody forgot about
--   Revocable                 for the address typed wrongly
--
-- SHA-256 rather than a slow hash, deliberately, and for the same reason as
-- db/016: a 256-bit random token has no smaller search space to grind through.
-- Slow hashing protects passwords because humans choose guessable ones. Nothing
-- is guessing this.
--
-- ---------------------------------------------------------------------------
-- WHAT AN INVITATION CANNOT DO
-- ---------------------------------------------------------------------------
-- It cannot create a platform administrator. Special Miles staff are made
-- deliberately, by a human with database access, and there is no email in the
-- world that should be able to change that. The check constraint below is the
-- enforcement; the comment is not.

begin;

create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),

  school_id   uuid not null references public.schools(id) on delete cascade,

  -- Lowercased on write. Two people typing the same address differently must
  -- not produce two invitations, and acceptance must match regardless of case.
  email       text not null check (btrim(email) <> ''),

  -- Deliberately NOT the full user_role enum. See the note above.
  role        public.user_role not null
                check (role in ('educator', 'specialist', 'school_admin')),

  token_hash  text not null unique,

  invited_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '14 days'),

  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,

  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles(id) on delete set null,

  -- An invitation cannot be both accepted and revoked.
  constraint invitations_not_both
    check (accepted_at is null or revoked_at is null)
);

create index if not exists invitations_school_idx
  on public.invitations (school_id, created_at desc);

-- Only one live invitation per address per school. Reissuing revokes the old
-- one rather than leaving two working doors into the same account.
create unique index if not exists invitations_one_live_per_email
  on public.invitations (school_id, lower(email))
  where accepted_at is null and revoked_at is null;


-- ---------------------------------------------------------------------------
-- Normalise the address on the way in
-- ---------------------------------------------------------------------------
create or replace function public.invitations_normalise()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

drop trigger if exists invitations_normalise on public.invitations;
create trigger invitations_normalise
  before insert or update on public.invitations
  for each row execute function public.invitations_normalise();


-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
alter table public.invitations enable row level security;

-- A school administrator sees their own school's. A platform admin sees all.
-- Nobody else sees any, including the person invited — they do not have an
-- account yet, and once they do the invitation is spent.
drop policy if exists invitations_select on public.invitations;
create policy invitations_select
  on public.invitations for select to authenticated
  using (
    public.is_platform_admin()
    or (public.is_school_admin() and school_id = public.my_school_id())
  );

-- NO INSERT POLICY, and that is the point.
--
-- Creating an invitation means generating a cryptographic token and storing
-- only its hash. A browser cannot be trusted to do either — it would choose its
-- own token, and it would have to be told the hashing scheme. The server does
-- it with the service key, which bypasses RLS entirely.
--
-- The same reasoning as `mark_invoice_paid` in db/020: anything where the
-- browser must not choose the value is not a policy problem, it is a
-- server-side function.

-- Revoking, however, is an ordinary act by an ordinary administrator.
drop policy if exists invitations_revoke on public.invitations;
create policy invitations_revoke
  on public.invitations for update to authenticated
  using (
    accepted_at is null
    and (
      public.is_platform_admin()
      or (public.is_school_admin() and school_id = public.my_school_id())
    )
  )
  with check (
    accepted_at is null
    and (
      public.is_platform_admin()
      or (public.is_school_admin() and school_id = public.my_school_id())
    )
  );

-- No delete policy. A revoked invitation is a record of somebody having been
-- invited and that invitation being withdrawn, which is exactly the kind of
-- thing an audit asks about.

revoke all on public.invitations from anon;


-- ---------------------------------------------------------------------------
-- Issuing — service_role only
-- ---------------------------------------------------------------------------
-- Takes the ALREADY-HASHED token. The raw one never reaches the database, so a
-- query log, a backup or a compromised replica cannot yield a working
-- invitation.
create or replace function public.issue_invitation(
  p_school_id  uuid,
  p_email      text,
  p_role       public.user_role,
  p_token_hash text,
  p_invited_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_role not in ('educator', 'specialist', 'school_admin') then
    raise exception 'An invitation cannot grant %', p_role
      using errcode = '22023';
  end if;

  -- Reissuing supersedes rather than duplicates. Two live invitations to one
  -- address is two ways in, and revoking one would feel like revoking both.
  update public.invitations
     set revoked_at = now(), revoked_by = p_invited_by
   where school_id = p_school_id
     and lower(email) = lower(btrim(p_email))
     and accepted_at is null
     and revoked_at is null;

  insert into public.invitations
    (school_id, email, role, token_hash, invited_by)
  values
    (p_school_id, p_email, p_role, p_token_hash, p_invited_by)
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.issue_invitation(uuid, text, public.user_role, text, uuid)
  from public, anon, authenticated;
grant execute on function public.issue_invitation(uuid, text, public.user_role, text, uuid)
  to service_role;


-- ---------------------------------------------------------------------------
-- Looking one up, before the person has an account
-- ---------------------------------------------------------------------------
-- The accept page has to say "you have been invited to St Paul's as an
-- Educator" to somebody who is not signed in. It returns the school NAME and
-- the role — never the email, never the id, and never anything that would let
-- a guessed token enumerate a school's staff.
create or replace function public.peek_invitation(p_token_hash text)
returns table (school_name text, role public.user_role, email text, expired boolean)
language sql
security definer
set search_path = public
as $$
  select s.name,
         i.role,
         i.email,
         (i.expires_at < now()) as expired
  from public.invitations i
  join public.schools s on s.id = i.school_id
  where i.token_hash = p_token_hash
    and i.accepted_at is null
    and i.revoked_at is null;
$$;

revoke all on function public.peek_invitation(text) from public, anon, authenticated;
grant execute on function public.peek_invitation(text) to service_role;


-- ---------------------------------------------------------------------------
-- Redeeming
-- ---------------------------------------------------------------------------
-- Everything that makes the account real happens here, in one transaction:
-- the invitation is spent, and the profile gets its school, its role and its
-- verification. Doing it in three separate calls from the server would leave a
-- window where an account exists with a role and no school.
create or replace function public.redeem_invitation(
  p_token_hash text,
  p_profile_id uuid
)
returns table (school_id uuid, role public.user_role)
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
begin
  select * into inv
    from public.invitations
   where token_hash = p_token_hash
     for update;

  if not found then
    raise exception 'That invitation is not valid.' using errcode = '22023';
  end if;
  if inv.revoked_at is not null then
    raise exception 'That invitation has been withdrawn.' using errcode = '22023';
  end if;
  if inv.accepted_at is not null then
    raise exception 'That invitation has already been used.' using errcode = '22023';
  end if;
  if inv.expires_at < now() then
    raise exception 'That invitation has expired. Ask for a new one.'
      using errcode = '22023';
  end if;

  update public.invitations
     set accepted_at = now(), accepted_by = p_profile_id
   where id = inv.id;

  -- VERIFIED ON ACCEPTANCE, and this is the whole point of an invitation. The
  -- administrator already said this person works here. Making them wait in a
  -- pending queue afterwards would be asking the same question twice.
  update public.profiles
     set school_id   = inv.school_id,
         role        = inv.role,
         is_verified = true
   where id = p_profile_id;

  return query select inv.school_id, inv.role;
end;
$$;

revoke all on function public.redeem_invitation(text, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_invitation(text, uuid) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
--   select count(*) from public.invitations;                    -- 0
--   select policyname from pg_policies
--    where tablename = 'invitations';                           -- select, revoke
--
-- And that the browser cannot issue one. From the CONSOLE as a school admin:
--   await supabase.rpc('issue_invitation', {...})               -- must fail
--   await supabase.from('invitations').insert({...})            -- must fail
--
-- Both are refused: there is no insert policy, and the function is granted to
-- service_role alone.
-- ---------------------------------------------------------------------------
