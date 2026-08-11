-- ===========================================================================
-- 047_specialist_applications.sql — Gate 1, admission to the network
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- `09-Onboarding-and-Tenancy.md` §5 and `12-Who-Lets-Whom-In.md` §4 both settle
-- the model and neither is built. A specialist passes TWO gates, and they are
-- not in competition:
--
--   GATE 1  admission to the network        Special Miles vets the person
--   GATE 2  engagement by a school          the school engages the relationship
--
-- This is gate 1. Vetting is a statement about a person; engagement is a
-- statement about a relationship, and being vetted grants access to no child
-- anywhere.
--
-- ---------------------------------------------------------------------------
-- AN APPLICANT IS NOT A USER. THEY ARE A LEAD.
-- ---------------------------------------------------------------------------
-- No account is created on submission, and this is the whole reason the table
-- exists rather than a `pending` flag on profiles. An account created here
-- would be an unapproved stranger holding a login to a children's records
-- platform, and every screen in the product would then have to defend against
-- them. A row with no `auth.users` behind it cannot sign in to anything.
--
-- Same shape as db/045, deliberately, because it is the same problem: a public
-- form, written by somebody with no account, through the API server, with no
-- insert policy and platform-admin triage. That file has the full reasoning on
-- why an `anon` insert policy is not the same thing with fewer steps.
--
-- ---------------------------------------------------------------------------
-- WHAT APPROVAL PRODUCES — A DEPARTURE FROM DOC 09, STATED PLAINLY
-- ---------------------------------------------------------------------------
-- Doc 09 §5 says approval emails an invitation and the account is created on
-- acceptance. It should not, yet, and the reason is db/039.
--
-- Since memberships, `my_role()` answers only when a live membership backs it.
-- A network-approved specialist belongs to NO organisation, so they would sign
-- in to a specialist dashboard where every number is zero and every list is
-- empty — not because anything failed, but because that is the honest state of
-- an account with no school. Building that screen is real work, and it is work
-- in service of a state with nothing in it.
--
-- So approval RECORDS THE DECISION and tells them. The account arrives with
-- engagement, through the invitation flow that already exists and already
-- works. `approved_at` is what makes a school admin's invitation to that
-- address show "vetted by Special Miles" rather than "this school's word" —
-- which is the labelling `12-Who-Lets-Whom-In.md` §4 asks for, and the next
-- thing to build on this table.
--
-- The upgrade path is open: when there is something for an unengaged
-- specialist to DO — a profile to complete, a directory to appear in — approval
-- can start issuing an invitation, and nothing here has to change.
--
-- ---------------------------------------------------------------------------
-- NO UPLOADED DOCUMENTS, AND THAT IS THE STRONGER DESIGN
-- ---------------------------------------------------------------------------
-- Doc 09 lists a CV, proof of registration and a WWCC among the fields. This
-- table takes NUMBERS and no files, for three reasons:
--
--   1. The NSW Working With Children Check is an online system with no
--      physical card or certificate. An employer verifies it at the source,
--      with a name, a date of birth and the number. A scan of something would
--      be weaker evidence than the check the reviewer must do anyway, and it
--      would look like stronger evidence, which is worse.
--   2. Registration with AHPRA is likewise a public register, checked by
--      number at the source.
--   3. A file upload from an unauthenticated stranger is a far larger surface
--      than a text field, and it would be the first one in this product.
--
-- Documents are requested by email where a reviewer wants them. The date of
-- birth is here ONLY because the WWCC check cannot be performed without it —
-- see the column comment.
-- ===========================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'application_status') then
    create type public.application_status as enum (
      'new',          -- nobody has looked yet
      'in_review',    -- somebody is checking registration and WWCC
      'more_needed',  -- asked the applicant for something; still open
      'approved',     -- admitted to the network
      'declined'      -- not admitted
    );
  end if;
end $$;

create table if not exists public.specialist_applications (
  id uuid primary key default gen_random_uuid(),

  -- --- who they are ------------------------------------------------------
  full_name text not null check (btrim(full_name) <> ''),

  -- Lowercased on write, as in db/045: the same person applying twice must be
  -- visibly the same person, and this address is later matched against an
  -- invitation to decide whether that invitation is network-vetted.
  email text not null
    check (email = lower(email))
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  phone text,

  /*
   * REQUIRED, AND ONLY FOR THE WWCC CHECK.
   *
   * The NSW Office of the Children's Guardian verifies a check from a name, a
   * date of birth and the number, together. Without this the reviewer cannot
   * complete the one check this whole table exists to support.
   *
   * It is the most sensitive field here and it is treated that way: platform
   * admin only, never shown to a school, and never returned to any other role.
   * If the screening fields ever move to a separate table with tighter access,
   * this is the column that justifies the work.
   */
  date_of_birth date not null check (
    date_of_birth < current_date - interval '16 years'
    and date_of_birth > current_date - interval '100 years'
  ),

  -- --- what they practise ------------------------------------------------
  -- A fixed list because it decides which register the reviewer checks, and
  -- 'other' because a list of professions written by a developer will be wrong.
  profession text not null check (
    profession in (
      'speech_pathologist',
      'occupational_therapist',
      'psychologist',
      'behaviour_support',
      'physiotherapist',
      'counsellor',
      'special_education_teacher',
      'other'
    )
  ),
  -- Only meaningful when profession is 'other'; required then, because
  -- "other" on its own tells a reviewer nothing.
  profession_other text,

  registration_body   text,  -- AHPRA, Speech Pathology Australia, …
  registration_number text,

  years_experience int check (years_experience >= 0 and years_experience <= 70),

  -- Where they can actually work. Free text: a specialist covers "Western
  -- Sydney and the Blue Mountains", which no dropdown of suburbs captures.
  regions text check (length(regions) <= 500),

  about text check (length(about) <= 4000),

  -- --- screening ---------------------------------------------------------
  -- Verified by the reviewer at the source. Stored so the organisation has the
  -- record that Child Safe Standards require it to keep.
  wwcc_state  text check (
    wwcc_state in ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')
  ),
  wwcc_number text,
  wwcc_expiry date,

  -- Separate from the WWCC and national. Optional: not every specialist works
  -- with NDIS participants.
  ndis_screening_number text,

  created_at timestamptz not null default now(),

  -- --- the decision ------------------------------------------------------
  status       public.application_status not null default 'new',
  reviewed_at  timestamptz,
  reviewed_by  uuid references public.profiles(id) on delete set null,
  review_note  text check (length(review_note) <= 4000),

  /*
   * Set once, when they are admitted, and never cleared by a later status.
   *
   * "Is this person network-vetted?" and "what is the state of their
   * application?" are different questions. A specialist admitted in March whose
   * row is later moved to `declined` because their registration lapsed has
   * still been vetted, and a school that engaged them in April deserves an
   * accurate history rather than a rewritten one.
   */
  approved_at timestamptz,

  -- 'other' must say what it is. A reviewer cannot check a register they have
  -- not been told the name of.
  constraint specialist_applications_other_is_named
    check (profession <> 'other' or btrim(coalesce(profession_other, '')) <> ''),

  -- A decision must say something. Declining somebody's livelihood without a
  -- reason is not a decision anybody can stand behind later.
  constraint specialist_applications_decisions_have_reasons
    check (
      status not in ('declined', 'more_needed')
      or btrim(coalesce(review_note, '')) <> ''
    )
);

-- The queue reads oldest-first within a status: somebody who applied three
-- weeks ago should not sit behind this morning's arrival.
create index if not exists specialist_applications_queue_idx
  on public.specialist_applications (status, created_at);

-- "Has this person applied before?", and the lookup that decides whether an
-- invitation to this address is network-vetted.
create index if not exists specialist_applications_email_idx
  on public.specialist_applications (email);

-- One live application per address. Somebody may reapply after a decision —
-- people do get registered, and a decline should not be permanent — but two
-- open applications is two reviewers doing the same work.
create unique index if not exists specialist_applications_one_open
  on public.specialist_applications (email)
  where status in ('new', 'in_review', 'more_needed');

comment on table public.specialist_applications is
  'Gate 1: somebody asking to join the Special Miles network. No account '
  'exists for these people — an applicant is a lead, not a user.';

comment on column public.specialist_applications.date_of_birth is
  'Required solely to verify the WWCC at the source, which needs name + DOB + '
  'number together. Platform admin only. Never shown to a school.';


-- ---------------------------------------------------------------------------
-- What they wrote cannot be edited. The decision is stamped, not typed.
-- ---------------------------------------------------------------------------
-- Same rule and same reasoning as db/045: an application is evidence of what
-- somebody claimed about their own registration and screening. If a reviewer
-- can edit the number, the record no longer says what was checked.
create or replace function public.specialist_applications_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.full_name, new.email, new.phone, new.date_of_birth, new.profession,
      new.profession_other, new.registration_body, new.registration_number,
      new.years_experience, new.regions, new.about, new.wwcc_state,
      new.wwcc_number, new.wwcc_expiry, new.ndis_screening_number,
      new.created_at)
     is distinct from
     (old.full_name, old.email, old.phone, old.date_of_birth, old.profession,
      old.profession_other, old.registration_body, old.registration_number,
      old.years_experience, old.regions, old.about, old.wwcc_state,
      old.wwcc_number, old.wwcc_expiry, old.ndis_screening_number,
      old.created_at)
  then
    raise exception
      'An application records what somebody claimed. Only its status and '
      'review note can change.'
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'new' then
      new.reviewed_at := null;
      new.reviewed_by := null;
    else
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
    end if;

    -- Set on first approval and never moved afterwards. See the column note.
    if new.status = 'approved' and old.approved_at is null then
      new.approved_at := now();
    else
      new.approved_at := old.approved_at;
    end if;
  else
    new.approved_at := old.approved_at;
  end if;

  return new;
end $$;

drop trigger if exists specialist_applications_guard_update
  on public.specialist_applications;
create trigger specialist_applications_guard_update
  before update on public.specialist_applications
  for each row execute function public.specialist_applications_guard_update();


-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.specialist_applications enable row level security;

-- Special Miles alone. These rows carry a date of birth, a WWCC number and a
-- registration number belonging to somebody who is not a customer, not a user,
-- and has no relationship with any school on the platform.
drop policy if exists specialist_applications_select
  on public.specialist_applications;
create policy specialist_applications_select
  on public.specialist_applications for select to authenticated
  using (public.is_platform_admin());

drop policy if exists specialist_applications_update
  on public.specialist_applications;
create policy specialist_applications_update
  on public.specialist_applications for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- NO INSERT POLICY. The API server writes these — db/045 has the reasoning.
-- No delete policy: a declined application is the record of a decision about a
-- real person, and is exactly what somebody asks about later.

revoke all on public.specialist_applications from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select count(*) from public.specialist_applications;   -- 0, as anybody
--   update public.specialist_applications set wwcc_number = 'x';  -- must fail
