-- ---------------------------------------------------------------------------
-- 127 — What a school knows before anything happens
-- ---------------------------------------------------------------------------
-- docs/19 §5. Everything the AI knows about a child today it learned from an
-- incident. Nothing in this product records that she loves horses, that he is
-- the best reader in the room, or that transitions have been hard since March —
-- so the first suggestion for a new child is written from a behaviour category
-- and a year level, and every suggestion afterwards is written as though the
-- only thing worth knowing about a child is what went wrong.
--
-- ---------------------------------------------------------------------------
-- NOT COLUMNS ON `students`
-- ---------------------------------------------------------------------------
-- `src/lib/rosterCache.ts` writes `students` selects into localStorage so the
-- roster survives offline. Widening that table would put a child's profile on
-- the local disk of every teacher's laptop and every shared ECEC tablet, for a
-- feature that has nothing to do with being offline.
--
-- A separate table also lets the read gate differ later: docs/17 §3.2 has a
-- clinical tier that must sit behind something narrower than "may see this
-- child's name", and that is impossible once it is all one row.
--
-- ---------------------------------------------------------------------------
-- TWO FREE-TEXT FIELDS, TWO CODED ONES, AND THE REASON FOR EACH
-- ---------------------------------------------------------------------------
-- ENUM WHAT YOU WANT TO COUNT; FREE-TEXT WHAT IS UNIQUE TO THE CHILD.
--
-- `interests` and `strengths` are prose because they cannot be anything else.
-- "Obsessed with the bin lorry" is not a member of any list, and a dropdown
-- that tried would be an insult to the child and useless to the model.
--
-- `helps` and `triggers` reuse the EXACT vocabularies from db/122 — the same
-- values a teacher taps when they log. Not tidiness: it makes belief and
-- evidence comparable. A teacher writes down that transitions are hard; the
-- logs then say the most common antecedent is a demand, 6 of 9. Because both
-- sides are the same coded value, a screen can put those two sentences next to
-- each other, and the gap between what a school believes about a child and what
-- it has actually recorded is one of the more useful things anybody will say at
-- a review meeting. With free text on one side that comparison cannot exist.
--
-- It also lets the profile seed the suggestion ranking before a single incident
-- has been logged, so a new child does not start from nothing.
--
-- ---------------------------------------------------------------------------
-- "WHAT THEY FIND HARD", NOT "WEAKNESSES"
-- ---------------------------------------------------------------------------
-- Saurab asked for weaknesses and the data is the same. The word is not: this
-- is a record a parent can open, and "weaknesses" reads as a verdict on their
-- child where "what they find hard" is what a teacher would actually say in the
-- meeting. Nothing is lost and the family relationship is not spent.
--
-- ---------------------------------------------------------------------------
-- THE FREE TEXT IS THE PRIVACY SURFACE, AND IT IS MORE EXPOSED THAN A LOG NOTE
-- ---------------------------------------------------------------------------
-- "Great with her brother Toby", "best friends with Maya", "settles when Mrs
-- Patel is on duty". A profile invites exactly the sentences an incident note
-- does not, so these go through redact() and findLeaks() before the model like
-- any other prose — and the caps below keep them a paragraph rather than a case
-- file.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.student_profiles (
  -- One row per child, and the child IS the key. A surrogate id would allow two
  -- profiles for one student, which is not a state anything here could resolve.
  student_id  uuid primary key references public.students(id) on delete cascade,

  /* Prose. Short on purpose: this is the sentence a teacher would say handing
     the class over, not a report. */
  interests   text check (coalesce(length(interests), 0)  <= 600),
  strengths   text check (coalesce(length(strengths), 0)  <= 600),
  finds_hard  text check (coalesce(length(finds_hard), 0) <= 600),

  /* db/122's vocabularies, exactly. 'other' and 'unknown' are deliberately NOT
     accepted: a standing profile has no incident to be uncertain about, and
     "something else" with no note attached is not a fact about a child. */
  helps       text[] not null default '{}'
    check (helps <@ array[
      'quiet_space', 'familiar_adult', 'movement', 'choice_offered',
      'demand_reduced', 'waited_quietly', 'sensory_item', 'redirected'
    ]::text[]),

  triggers    text[] not null default '{}'
    check (triggers <@ array[
      'transition', 'demand', 'denied', 'waiting', 'peer',
      'sensory', 'change', 'correction', 'discomfort'
    ]::text[]),

  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists student_profiles_set_updated_at on public.student_profiles;
create trigger student_profiles_set_updated_at
  before update on public.student_profiles
  for each row execute function public.set_updated_at();

comment on table public.student_profiles is
  'docs/19 §5. What a school knows about a child before anything goes wrong. '
  '`helps` and `triggers` use db/122''s vocabularies so a school''s belief and '
  'its recorded evidence can be compared.';


-- ---------------------------------------------------------------------------
-- Who may read it, and who may write it
-- ---------------------------------------------------------------------------
-- READ: anybody already entitled to the child's record. A profile is less
-- sensitive than a behaviour log, not more — it is the good news about a child
-- as much as the difficult part — so a narrower gate than `can_view_student`
-- would be theatre.
--
-- A GUARDIAN READS IT. What the school believes about their child's strengths
-- and triggers is exactly the sort of thing families discover at a meeting and
-- wish they had known in September. `can_view_student` already admits them.
--
-- WRITE: staff only, for now. docs/19 §5.1 puts the parent's slice — home
-- routine, what works at home — in its own place, and letting a guardian write
-- these columns would mean a family and a school silently overwriting each
-- other with no record of who said what. That needs the per-fact provenance
-- docs/17 §3.3 designs, and it is not this migration.
alter table public.student_profiles enable row level security;

drop policy if exists student_profiles_select on public.student_profiles;
create policy student_profiles_select
  on public.student_profiles for select to authenticated
  using (public.can_view_student(student_id));

drop policy if exists student_profiles_insert on public.student_profiles;
create policy student_profiles_insert
  on public.student_profiles for insert to authenticated
  with check (
    updated_by = auth.uid()
    and public.can_staff_view_student(student_id)
  );

drop policy if exists student_profiles_update on public.student_profiles;
create policy student_profiles_update
  on public.student_profiles for update to authenticated
  using (public.can_staff_view_student(student_id))
  with check (
    updated_by = auth.uid()
    and public.can_staff_view_student(student_id)
  );

/*
 * NO DELETE POLICY. Clearing every field is an edit and leaves a row saying
 * "somebody looked at this and had nothing to add", which is different from a
 * child nobody has ever filled in. The row goes when the student does, by
 * cascade.
 */
revoke all on public.student_profiles from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it. As an educator assigned to the child:
--
--   insert into public.student_profiles
--     (student_id, interests, triggers, helps, updated_by)
--   values ('<student>', 'Trains, and anything with a timetable.',
--           '{transition}', '{movement}', auth.uid());          -- 1 row
--
--   update public.student_profiles set triggers = '{lunchtime}';
--   -- refused: not in db/122's vocabulary
--
--   update public.student_profiles set interests = repeat('x', 601);
--   -- refused: this is a handover sentence, not a report
--
-- As that child's guardian: the select returns the row, the update is refused.
-- As an educator at another school: nothing at all.
--
-- db/verify.sql: tables gains student_profiles; policies increases by three.
-- ---------------------------------------------------------------------------
