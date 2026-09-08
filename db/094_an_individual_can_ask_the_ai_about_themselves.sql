-- ---------------------------------------------------------------------------
-- 094 — An individual can ask the AI about themselves
-- ---------------------------------------------------------------------------
-- The AI in MiZanova answers one question: "a teacher observed this in a child,
-- what could they try tomorrow?" It needs a behaviour log, a student, a school
-- and a guardian's consent, and an individual has none of those. So the role
-- db/088 built could read courses and nothing else, while the thing the product
-- is actually known for was unreachable to the only people using it for
-- themselves.
--
-- ---------------------------------------------------------------------------
-- THE DIFFERENCE THAT DRIVES EVERY DECISION BELOW
-- ---------------------------------------------------------------------------
-- THERE IS NO SPECIALIST. In the school flow, a suggestion the model is unsure
-- about, or one that could go wrong without oversight, is set to
-- `pending_review` and a specialist decides. That queue is staffed because the
-- school employs those people.
--
-- Nobody is attached to an individual account. A `pending_review` row here
-- would wait forever, and server/index.js already carries a scar from exactly
-- that mistake — the comment about a teacher "permanently unable to get help",
-- waiting on a specialist who had already acted.
--
-- So there is no review state. A suggestion is either shown or it is withheld,
-- the decision is final and made at generation time, and the person is TOLD one
-- was withheld and why. Withheld text is not stored at all: content no human
-- will ever review is a liability to keep, not an asset.
--
-- ---------------------------------------------------------------------------
-- NOBODY IS TOLD, AND THAT IS THE CAREFUL ANSWER RATHER THAN THE LAZY ONE
-- ---------------------------------------------------------------------------
-- When a school observation is risk-flagged, the flow in db/006 marks the log
-- and notifies the school's safeguarding leads, because a flag no human sees is
-- not a safeguard and because the subject is a child.
--
-- This does neither, on purpose. The subject is an adult who came to a page
-- that says, in these words, that nothing they do here is reported to anybody.
-- Quietly mailing Special Miles about a stranger's private writing because a
-- model set a boolean would break that promise at the exact moment the person
-- was most vulnerable, and it would do it invisibly.
--
-- What happens instead is that the SCREEN responds: it shows where to get human
-- help. Support offered to the person, not a report filed about them.
--
-- ---------------------------------------------------------------------------
-- READABLE BY ONE PERSON
-- ---------------------------------------------------------------------------
-- `ai_strategies` admits a platform admin, correctly — those rows are about a
-- child, and Special Miles is accountable for what the model said about them.
--
-- These rows are an adult's private account of their own life. A platform admin
-- has no claim on them, and db/091 already made this argument when it refused
-- to put names on the course engagement view. Governance still works: spend and
-- volume are counted in `ai_generation_events`, which holds no content.
--
-- The delete policy is deliberate too. Somebody who writes something personal
-- and wants it gone should not have to ask us.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. What they asked
-- ---------------------------------------------------------------------------
create table if not exists public.individual_ai_requests (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,

  -- The ANONYMISED text, exactly as it was sent. Stored for the same reason
  -- ai_strategies.anonymised_input is: so the privacy claim can be audited
  -- rather than believed.
  asked             text    not null,
  redaction_count   integer not null default 0 check (redaction_count >= 0),

  -- The model thought this describes something a person should not be left
  -- alone with. Kept so the support message still appears when they come back.
  risk_flagged      boolean not null default false,

  -- How many suggestions were not shown, and the reason in plain words. A
  -- count with no explanation reads as the product losing something.
  withheld_count    integer not null default 0 check (withheld_count >= 0),
  withheld_reason   text,

  model             text,
  prompt_version    text not null,
  created_at        timestamptz not null default now()
);

create index if not exists individual_ai_requests_mine_idx
  on public.individual_ai_requests (profile_id, created_at desc);


-- ---------------------------------------------------------------------------
-- 2. What came back, and was shown
-- ---------------------------------------------------------------------------
-- Only shown suggestions land here. See the header: a withheld one leaves a
-- count on the request and nothing else.
-- ---------------------------------------------------------------------------
create table if not exists public.individual_ai_suggestions (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null
                  references public.individual_ai_requests(id) on delete cascade,

  title         text not null,
  body          text not null,
  rationale     text[] not null default '{}',
  confidence    numeric(3,2) not null check (confidence between 0 and 1),

  created_at    timestamptz not null default now()
);

create index if not exists individual_ai_suggestions_request_idx
  on public.individual_ai_suggestions (request_id);


-- ---------------------------------------------------------------------------
-- 3. Yours, and only yours
-- ---------------------------------------------------------------------------
alter table public.individual_ai_requests    enable row level security;
alter table public.individual_ai_suggestions enable row level security;

drop policy if exists individual_ai_requests_select on public.individual_ai_requests;
create policy individual_ai_requests_select
  on public.individual_ai_requests for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists individual_ai_requests_delete on public.individual_ai_requests;
create policy individual_ai_requests_delete
  on public.individual_ai_requests for delete to authenticated
  using (profile_id = auth.uid());

drop policy if exists individual_ai_suggestions_select on public.individual_ai_suggestions;
create policy individual_ai_suggestions_select
  on public.individual_ai_suggestions for select to authenticated
  using (
    exists (
      select 1 from public.individual_ai_requests r
      where r.id = individual_ai_suggestions.request_id
        and r.profile_id = auth.uid()
    )
  );

-- NO INSERT OR UPDATE POLICY ON EITHER TABLE. The server writes both with the
-- service role after the model has answered, exactly as ai_strategies does — a
-- browser that could insert here could put words in the model's mouth and then
-- read them back as though the AI had said them.
--
-- Deleting a request takes its suggestions with it (on delete cascade), so no
-- delete policy is needed on the child table.
revoke all on public.individual_ai_requests     from anon;
revoke all on public.individual_ai_suggestions  from anon;
grant select, delete on public.individual_ai_requests    to authenticated;
grant select         on public.individual_ai_suggestions to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Check it. Signed in as an individual, all of these must hold:
--
--   select * from public.individual_ai_requests;           -- only your own
--   insert into public.individual_ai_requests (...)         -- refused, no policy
--   delete from public.individual_ai_requests where id=...  -- yours: allowed
--
-- And as a platform admin: zero rows. That is the point of this file.
-- ---------------------------------------------------------------------------
