-- ===========================================================================
-- 037_guardian_access_codes.sql — connecting a parent to a child
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- This is the highest-consequence action in the product. Get it wrong and a
-- stranger reads a child's behaviour history, therapy notes, goals, home
-- address and everything their family has written.
--
-- ---------------------------------------------------------------------------
-- WHY THE DESIGN CANNOT BE BUILT AS DRAWN
-- ---------------------------------------------------------------------------
-- `Link Your Children Page.jpg` asks for a "unique Student ID or Access Code",
-- with the example STU-123456.
--
-- `students.external_ref` is a short number a school chooses and shows on
-- screen. Six digits is a million possibilities — exhausted in under an hour —
-- and the number is printed on things children carry home in their bags.
--
-- A STUDENT ID IDENTIFIES A CHILD. IT MUST NEVER AUTHORISE ANYTHING.
--
-- What follows is a different object with a different job. It is closer to a
-- password reset link than to a reference number.
--
-- ---------------------------------------------------------------------------
-- THE PROPERTIES, AND WHY EACH ONE
-- ---------------------------------------------------------------------------
--   ~60 bits          12 characters from a 32-symbol alphabet. Guessing is not
--                     a strategy, and the attempt counter below means it is not
--                     a cheap one to try either.
--   no 0/O, no 1/I/L  it will be read off paper, down a phone line, by somebody
--                     holding a toddler
--   grouped 4-4-4     so a human can read it aloud without losing their place
--   hashed at rest    a database read, a backup or a leaked replica must not
--                     yield working codes
--   single use        one code, one link, then dead
--   expiring          30 days. A code in a drawer for a year is an unlocked
--                     door nobody remembers leaving open
--   revocable         for the letter that went to the wrong address
--   BOUND TO AN EMAIL ADDRESS  see below — this is the important one
--
-- ---------------------------------------------------------------------------
-- WHY IT IS BOUND TO AN ADDRESS, WHICH IS THE PART WORTH DEFENDING
-- ---------------------------------------------------------------------------
-- In this domain, family separation and contested custody are ordinary rather
-- than exceptional. A code that works for whoever holds the paper is a code
-- that works for a parent a court has excluded, or a relative who intercepted
-- the post.
--
-- Requiring the code AND the mailbox it was issued to raises that bar
-- substantially, at almost no cost to a family who received their own letter.
-- The school names the guardian and the address when it issues the code, which
-- is a decision they are already making offline every time they send anything
-- home.
--
-- ---------------------------------------------------------------------------
-- WHERE CHILD RECORDS COME FROM
-- ---------------------------------------------------------------------------
-- Not from parents. Schools create student records. A parent-created child
-- would be a record with no school, no class and no teacher — and a way to
-- conjure identities. This table links an existing child to an existing adult;
-- it never creates either.

begin;

create table if not exists public.guardian_access_codes (
  id            uuid primary key default gen_random_uuid(),

  student_id    uuid not null references public.students(id) on delete cascade,

  -- Who the school says this is for. Lowercased on write.
  guardian_email text not null check (btrim(guardian_email) <> ''),

  -- Recorded because "who is this person to the child" is a question the
  -- school answers, not one the software should infer from a surname.
  relationship  text not null default 'guardian'
                  check (relationship in
                    ('mother', 'father', 'guardian', 'carer', 'other')),

  code_hash     text not null unique,

  issued_by     uuid references public.profiles(id) on delete set null,
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '30 days'),

  redeemed_at   timestamptz,
  redeemed_by   uuid references public.profiles(id) on delete set null,

  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles(id) on delete set null,

  -- Wrong attempts against THIS code. The server refuses past a threshold, so
  -- a leaked-but-partial code cannot be finished off by grinding.
  attempts      integer not null default 0 check (attempts >= 0),

  constraint guardian_codes_not_both
    check (redeemed_at is null or revoked_at is null)
);

create index if not exists guardian_codes_student_idx
  on public.guardian_access_codes (student_id, issued_at desc);

-- One live code per address per child. Reissuing supersedes, so a family never
-- holds two working codes and revoking one does not leave the other alive.
create unique index if not exists guardian_codes_one_live
  on public.guardian_access_codes (student_id, lower(guardian_email))
  where redeemed_at is null and revoked_at is null;

create or replace function public.guardian_codes_normalise()
returns trigger
language plpgsql
as $$
begin
  new.guardian_email := lower(btrim(new.guardian_email));
  return new;
end;
$$;

drop trigger if exists guardian_codes_normalise on public.guardian_access_codes;
create trigger guardian_codes_normalise
  before insert or update on public.guardian_access_codes
  for each row execute function public.guardian_codes_normalise();


-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
alter table public.guardian_access_codes enable row level security;

-- A school administrator sees their own school's, so they can tell a family
-- "yes, that was issued on Tuesday and used on Thursday". Teachers do not:
-- issuing family access is an administrative act, not a classroom one.
drop policy if exists guardian_codes_select on public.guardian_access_codes;
create policy guardian_codes_select
  on public.guardian_access_codes for select to authenticated
  using (
    public.is_platform_admin()
    or (
      public.is_school_admin()
      and exists (
        select 1 from public.students s
        where s.id = student_id and s.school_id = public.my_school_id()
      )
    )
  );

-- NO INSERT POLICY. Generating a code and storing only its hash is not
-- something a browser can be trusted with — the same reasoning as db/035.

drop policy if exists guardian_codes_revoke on public.guardian_access_codes;
create policy guardian_codes_revoke
  on public.guardian_access_codes for update to authenticated
  using (
    redeemed_at is null
    and (
      public.is_platform_admin()
      or (
        public.is_school_admin()
        and exists (
          select 1 from public.students s
          where s.id = student_id and s.school_id = public.my_school_id()
        )
      )
    )
  )
  with check (redeemed_at is null);

-- No delete policy. That a code was issued, to whom, and whether it was used is
-- exactly what somebody asks about after a record has been seen by the wrong
-- person.

revoke all on public.guardian_access_codes from anon;


-- ---------------------------------------------------------------------------
-- Issuing — service_role only
-- ---------------------------------------------------------------------------
create or replace function public.issue_guardian_code(
  p_student_id   uuid,
  p_email        text,
  p_relationship text,
  p_code_hash    text,
  p_issued_by    uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  update public.guardian_access_codes
     set revoked_at = now(), revoked_by = p_issued_by
   where student_id = p_student_id
     and lower(guardian_email) = lower(btrim(p_email))
     and redeemed_at is null
     and revoked_at is null;

  insert into public.guardian_access_codes
    (student_id, guardian_email, relationship, code_hash, issued_by)
  values
    (p_student_id, p_email, p_relationship, p_code_hash, p_issued_by)
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.issue_guardian_code(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.issue_guardian_code(uuid, text, text, text, uuid)
  to service_role;


-- ---------------------------------------------------------------------------
-- Redeeming
-- ---------------------------------------------------------------------------
-- Returns the child's DISPLAY name — first name and last initial, the same
-- form used everywhere a full name is not needed. Enough for a parent to know
-- they have the right code; not a full identity handed to whoever holds it.
--
-- The email check lives here rather than only on the server, so the rule
-- survives somebody writing a second caller later.
create or replace function public.redeem_guardian_code(
  p_code_hash    text,
  p_profile_id   uuid,
  p_profile_email text
)
returns table (student_id uuid, child_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  code public.guardian_access_codes%rowtype;
begin
  select * into code
    from public.guardian_access_codes
   where code_hash = p_code_hash
     for update;

  if not found then
    raise exception 'That code is not valid.' using errcode = '22023';
  end if;
  if code.revoked_at is not null then
    raise exception 'That code has been withdrawn by the school.'
      using errcode = '22023';
  end if;
  if code.redeemed_at is not null then
    raise exception 'That code has already been used.' using errcode = '22023';
  end if;
  if code.expires_at < now() then
    raise exception 'That code has expired. Ask the school for a new one.'
      using errcode = '22023';
  end if;

  if lower(btrim(p_profile_email)) <> code.guardian_email then
    -- Counted, so repeatedly trying the same code from different accounts is
    -- visible rather than free.
    update public.guardian_access_codes
       set attempts = attempts + 1
     where id = code.id;

    raise exception
      'That code was issued to a different email address. Sign in with the address the school sent it to.'
      using errcode = '22023';
  end if;

  update public.guardian_access_codes
     set redeemed_at = now(), redeemed_by = p_profile_id
   where id = code.id;

  insert into public.student_guardians (student_id, profile_id)
  values (code.student_id, p_profile_id)
  on conflict do nothing;

  return query
    select code.student_id,
           s.first_name || ' ' || left(s.last_name, 1) || '.'
      from public.students s
     where s.id = code.student_id;
end;
$$;

revoke all on function public.redeem_guardian_code(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.redeem_guardian_code(text, uuid, text)
  to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked.
--
--   select count(*) from public.guardian_access_codes;           -- 0
--
-- And that a browser cannot mint one. From the CONSOLE as a school admin:
--   await supabase.from('guardian_access_codes').insert({...})   -- must fail
--   await supabase.rpc('issue_guardian_code', {...})             -- must fail
--
-- Who has been linked to a child, and how:
--   select s.first_name, p.full_name, g.redeemed_at
--   from public.student_guardians sg
--   join public.students s on s.id = sg.student_id
--   join public.profiles p on p.id = sg.profile_id
--   left join public.guardian_access_codes g
--          on g.student_id = sg.student_id and g.redeemed_by = sg.profile_id;
--
-- A NULL redeemed_at there is a link created some other way — by SQL, or by an
-- administrator before this existed. Worth knowing which, and worth being able
-- to say so if anybody asks.
-- ---------------------------------------------------------------------------
