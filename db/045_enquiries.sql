-- ===========================================================================
-- 045_enquiries.sql — the way in for people who have nobody to invite them
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- db/044 and the /signup signpost settled how a person gets an account: an
-- invitation, a code, or a purchase. Every one of those starts with somebody
-- who is ALREADY in the system. That leaves the one person the whole business
-- depends on with nowhere to go — the principal who has just read the pricing
-- page and wants to buy.
--
-- Pricing offered them "Start for small schools", which sent them to /signup,
-- which now sends them back to Pricing. A loop. Before the signpost it was
-- worse: they got a parent account, which is not a school and cannot become
-- one.
--
-- A school cannot set itself up, and that is not a gap to be closed. Creating a
-- school account means creating the thing every other account in that school
-- hangs off — its administrator, its roster, its invitations. Letting a
-- stranger do that by typing a school name means anyone can create "St Paul's
-- Primary" and start inviting people to it.
--
-- So the enquiry is the first step of a conversation, not a sign-up. It records
-- that somebody asked. A human at Special Miles reads it, talks to them, and
-- creates the school. That is the only step in the product where the answer is
-- deliberately "a person will get back to you", and it is deliberate.
--
-- ---------------------------------------------------------------------------
-- THIS IS THE FIRST TABLE AN ANONYMOUS STRANGER CAN CAUSE A ROW IN
-- ---------------------------------------------------------------------------
-- Every other write in this product comes from somebody who signed in. That
-- makes this the one place where "who did this?" has no answer, and it changes
-- what the protections have to be:
--
--   NO INSERT POLICY        the server writes with the service key, as with
--                           invitations in db/035. An insert policy for `anon`
--                           would let anyone holding the publishable key — which
--                           ships inside the JavaScript bundle, by design —
--                           write unlimited rows straight to this table. RLS
--                           cannot express "twenty a minute"; a server can.
--
--   NO EMAIL IS SENT HERE   a confirmation to the address typed in the form
--                           would make this an open relay: submit with somebody
--                           else's address, and MiZanova sends them mail they
--                           did not ask for. Special Miles gets the
--                           notification, the visitor gets a screen. Only an
--                           address the sender has proved they hold — an
--                           invitation, a guardian code — gets email from us.
--
--   PLATFORM ADMIN ONLY     these rows hold names, work emails and phone
--                           numbers of people at organisations that are not
--                           customers yet. No school admin has any business
--                           reading another school's enquiry, and there is no
--                           school to attach it to in any case.
--
--   WHAT THEY SAID IS FIXED an administrator may record what they did about an
--                           enquiry. They may not edit what the enquirer wrote.
--                           A record that can be rewritten is not a record, and
--                           this one is the evidence of what a customer was
--                           promised. Enforced by trigger below, because RLS
--                           cannot compare a new row to the old one.
-- ===========================================================================

begin;

-- Two kinds, and they are genuinely different conversations. A school enquiry
-- leads to an account being created by hand. A family enquiry leads nowhere
-- yet, because the thing they want to buy does not exist — see the note on
-- `plan_key` below.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'enquiry_kind') then
    create type public.enquiry_kind as enum (
      'school',  -- an organisation wanting to buy: becomes a real school
      'family'   -- an individual wanting a subscription: waiting on the Academy
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'enquiry_status') then
    create type public.enquiry_status as enum (
      'new',        -- nobody has looked yet
      'contacted',  -- somebody has replied to them
      'onboarded',  -- became a customer; for a school, the account now exists
      'declined'    -- not proceeding, either side
    );
  end if;
end $$;

create table if not exists public.enquiries (
  id      uuid primary key default gen_random_uuid(),
  kind    public.enquiry_kind not null,

  /*
   * Which card they pressed, so a reply can start from what they were looking
   * at rather than asking them to say it again.
   *
   * A FIXED LIST, not free text. The value arrives from a query string, and a
   * query string is typed by whoever is holding the browser. Constraining it
   * means a forged request cannot store a paragraph of somebody else's markup
   * in a field a member of staff will later read on a screen.
   *
   * Null is allowed: somebody can arrive at the form without choosing a plan,
   * and refusing them because of that would be absurd.
   */
  plan_key text check (
    plan_key in (
      'small_school', 'mid_school', 'large_school',  -- kind = 'school'
      'essential', 'premium'                         -- kind = 'family'
    )
  ),

  -- Named for what db/039 renamed schools to. A Montessori centre is not a
  -- school, and the client intends to sell to those too.
  organisation_name text check (btrim(organisation_name) <> ''),

  contact_name  text not null check (btrim(contact_name) <> ''),

  /*
   * Lowercased on write so the same person enquiring twice is visibly the same
   * person, and so a search for their address finds them however they typed it.
   *
   * The format check is deliberately loose. Its job is to keep obvious rubbish
   * out of a table staff will work from, not to decide what a valid address is
   * — the only real test of that is sending mail to it.
   */
  contact_email text not null
    check (contact_email = lower(contact_email))
    check (contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  contact_phone text,
  contact_role  text,  -- "Principal", "Head of Wellbeing". Their words.

  -- Bounded because it decides the price band, and because a number typed into
  -- a public form should never be able to be anything at all.
  student_count int check (student_count > 0 and student_count <= 100000),

  -- Bounded for the same reason the server caps its request body: a text area
  -- on a public form is otherwise a way to fill a database.
  message text check (length(message) <= 4000),

  created_at timestamptz not null default now(),

  status       public.enquiry_status not null default 'new',
  handled_at   timestamptz,
  handled_by   uuid references public.profiles(id) on delete set null,
  handled_note text check (length(handled_note) <= 4000),

  -- A school enquiry with no school named is not answerable. A family enquiry
  -- has no organisation, and inventing one for them would be a lie in a field
  -- somebody later reports on.
  constraint enquiries_school_names_a_school
    check (kind <> 'school' or organisation_name is not null)
);

-- The order the triage screen reads them in: newest unhandled first.
create index if not exists enquiries_triage_idx
  on public.enquiries (status, created_at desc);

-- "Has this person written to us before?" — asked every time one arrives.
create index if not exists enquiries_email_idx
  on public.enquiries (contact_email);

comment on table public.enquiries is
  'Someone asking to become a customer. Written only by the API server; read '
  'and triaged only by platform admins. Nobody here has an account yet.';


-- ---------------------------------------------------------------------------
-- What they wrote cannot be edited. What we did about it is stamped, not typed.
-- ---------------------------------------------------------------------------
-- Two jobs, one trigger, because they are the same rule seen from both sides:
-- the enquirer's half of the row is evidence, and our half is an audit trail.
--
-- Stamping `handled_by` from auth.uid() rather than trusting the screen to send
-- it is the same reasoning as everywhere else in this schema — a value the
-- browser chooses is a value the browser can get wrong, and this one answers
-- "who decided?".
create or replace function public.enquiries_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.kind, new.plan_key, new.organisation_name, new.contact_name,
      new.contact_email, new.contact_phone, new.contact_role,
      new.student_count, new.message, new.created_at)
     is distinct from
     (old.kind, old.plan_key, old.organisation_name, old.contact_name,
      old.contact_email, old.contact_phone, old.contact_role,
      old.student_count, old.message, old.created_at)
  then
    raise exception
      'An enquiry records what somebody asked for. Only its status and note '
      'can change.'
      using errcode = 'check_violation';
  end if;

  -- Moving off 'new' is an action by a person, and the record says who and
  -- when. Moving back to 'new' clears it, so the screen cannot show a handler
  -- for something nobody has handled.
  if new.status is distinct from old.status then
    if new.status = 'new' then
      new.handled_at := null;
      new.handled_by := null;
    else
      new.handled_at := now();
      new.handled_by := auth.uid();
    end if;
  end if;

  return new;
end $$;

drop trigger if exists enquiries_guard_update on public.enquiries;
create trigger enquiries_guard_update
  before update on public.enquiries
  for each row execute function public.enquiries_guard_update();


-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.enquiries enable row level security;

-- Special Miles only. See the header: there is no school these belong to.
drop policy if exists enquiries_select on public.enquiries;
create policy enquiries_select
  on public.enquiries for select to authenticated
  using (public.is_platform_admin());

-- Triage. The trigger above decides what an update is allowed to change; this
-- decides who may attempt one.
drop policy if exists enquiries_update on public.enquiries;
create policy enquiries_update
  on public.enquiries for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- NO INSERT POLICY. The server writes these. See the header for why an `anon`
-- insert policy is not the same thing with fewer steps.

-- No delete policy either. "We decided not to pursue that school" is exactly
-- the kind of thing somebody asks about a year later, and `declined` says it
-- without losing the row.

revoke all on public.enquiries from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
-- Signed in as anybody who is not a platform admin, this must return 0 rows
-- rather than an error — RLS filters, it does not complain:
--
--   select count(*) from public.enquiries;
--
-- And this must fail, from the SQL editor or anywhere else:
--
--   update public.enquiries set contact_email = 'someone@else.example';
