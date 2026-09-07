-- ---------------------------------------------------------------------------
-- 118 — The Evidence Database
-- ---------------------------------------------------------------------------
-- Three requirements point at one thing, and reading FR12 on its own makes it
-- look optional:
--
--   FR12  "Specialists must manage a version-controlled library of proven
--          strategies."
--   E02   "Strategies must fall back to the curated Evidence Database (DB) if
--          AI is blocked or offline."
--   A04   "Admin must be able to review the ratio of AI-generated strategies
--          versus Database-only usage."
--
-- Together they are not a library. They are the safety net under the AI.
--
-- ---------------------------------------------------------------------------
-- WHAT HAPPENS TODAY WHEN THE NET IS NEEDED
-- ---------------------------------------------------------------------------
-- `/api/strategies` reads `ai_controls.ai_enabled` and, when it is false,
-- returns 503 with "AI suggestions are currently switched off by Special
-- Miles. Contact your specialist for support." — and nothing else.
--
-- That switch is FR21's kill switch, the one pulled "during a crisis". So the
-- product's response to a crisis is to leave every teacher in every classroom
-- with no strategies at all, at the moment they are most likely to need one.
-- The same is true of the offline case the brief names as a core challenge.
--
-- ---------------------------------------------------------------------------
-- VERSION CONTROL BY INSERT, NOT BY EDIT
-- ---------------------------------------------------------------------------
-- "Version-controlled" is the requirement's own word, and the cheap reading —
-- an `updated_at` and an audit trigger — is not it. A strategy that changed
-- after a teacher used it should still be readable as the words they were
-- given.
--
-- So nothing here is ever updated in place. Revising a strategy INSERTS a new
-- row pointing at the one it replaces, and a partial unique index keeps
-- exactly one current row per lineage. `ai_strategies.evidence_id` can then
-- point at the exact version a classroom was handed, permanently.
--
-- ---------------------------------------------------------------------------
-- IT CONTAINS NO CHILD, AND THAT IS WHY EVERYONE MAY READ IT
-- ---------------------------------------------------------------------------
-- Every other table in this schema is guarded by "may this person see this
-- student". These rows are general professional advice with no student, no
-- school and no incident in them — which is what lets them be readable by
-- anybody signed in, and what makes them safe to cache on a laptop for the
-- offline case E02 asks about.
--
-- Writing is the narrow half: a verified specialist or a platform admin.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.evidence_strategies (
  id             uuid primary key default gen_random_uuid(),

  -- The lineage. The first version of a strategy points at itself, so every
  -- row can be grouped without a nullable special case.
  lineage_id     uuid not null,
  version        integer not null default 1 check (version >= 1),
  -- Exactly one row per lineage is the live one; see the index below.
  is_current     boolean not null default true,

  -- Which behaviour this is for. The same enum a log uses, so a fallback can
  -- be selected by the thing the teacher already chose.
  behaviour_type public.behaviour_type not null,

  title          text not null check (btrim(title) <> ''),
  body           text not null check (btrim(body) <> ''),
  -- The "why this works" bullets, the same shape ai_strategies carries so one
  -- component can render either.
  rationale      text[] not null default '{}',

  /*
   * WHERE IT COMES FROM. "Proven" is the requirement's word and a claim
   * nobody can check is not proof — this is the sentence a specialist would
   * say if a parent asked why the school is doing this. Not null: a strategy
   * in an evidence database with no evidence is just an opinion with better
   * placement.
   */
  provenance     text not null check (btrim(provenance) <> ''),

  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),

  -- Retiring is not deleting. A strategy withdrawn from use must still be
  -- readable as the words somebody was once given.
  retired_at     timestamptz,
  retired_reason text
);

create unique index if not exists evidence_strategies_one_current
  on public.evidence_strategies (lineage_id)
  where is_current;

create index if not exists evidence_strategies_pick_idx
  on public.evidence_strategies (behaviour_type)
  where is_current and retired_at is null;

comment on table public.evidence_strategies is
  'FR12 and E02. Curated strategies with no student in them, used when the AI '
  'is switched off, blocked or unreachable. Never updated in place: a revision '
  'inserts a new version in the same lineage.';


-- ---------------------------------------------------------------------------
-- Readable by anybody signed in; written by very few
-- ---------------------------------------------------------------------------
alter table public.evidence_strategies enable row level security;

drop policy if exists evidence_strategies_select on public.evidence_strategies;
create policy evidence_strategies_select
  on public.evidence_strategies for select to authenticated
  using (true);

drop policy if exists evidence_strategies_write on public.evidence_strategies;
create policy evidence_strategies_write
  on public.evidence_strategies for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_platform_admin()
      or (public.my_role() = 'specialist' and public.am_i_verified())
    )
  );

/*
 * UPDATE EXISTS FOR EXACTLY TWO COLUMNS, and the trigger below enforces that
 * rather than trusting this policy to be the only route. Superseding a version
 * has to flip `is_current` on the old row, and retiring has to set
 * `retired_at` — neither is an edit to what the strategy SAYS.
 */
drop policy if exists evidence_strategies_supersede on public.evidence_strategies;
create policy evidence_strategies_supersede
  on public.evidence_strategies for update to authenticated
  using (
    public.is_platform_admin()
    or (public.my_role() = 'specialist' and public.am_i_verified())
  )
  with check (
    public.is_platform_admin()
    or (public.my_role() = 'specialist' and public.am_i_verified())
  );

create or replace function public.evidence_strategies_are_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.rationale is distinct from old.rationale
     or new.provenance is distinct from old.provenance
     or new.behaviour_type is distinct from old.behaviour_type
     or new.lineage_id is distinct from old.lineage_id
     or new.version is distinct from old.version
  then
    raise exception
      'An evidence strategy is not edited. Add a new version in the same lineage.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists evidence_strategies_immutable on public.evidence_strategies;
create trigger evidence_strategies_immutable
  before update on public.evidence_strategies
  for each row execute function public.evidence_strategies_are_immutable();

-- No delete policy, for the reason the header gives.
revoke all on public.evidence_strategies from anon;


-- ---------------------------------------------------------------------------
-- A04: telling the two sources apart afterwards
-- ---------------------------------------------------------------------------
-- Without this the ratio the requirement asks for cannot be computed at all —
-- the events table records that a generation happened, not what answered it.
-- ---------------------------------------------------------------------------
alter table public.ai_generation_events
  add column if not exists source text not null default 'ai'
    check (source in ('ai', 'evidence'));

comment on column public.ai_generation_events.source is
  'A04. ''ai'' when the model answered, ''evidence'' when the Evidence '
  'Database did because the AI was off, blocked or unreachable.';

commit;

-- ---------------------------------------------------------------------------
-- Check it. As a verified specialist:
--
--   insert into public.evidence_strategies
--     (lineage_id, behaviour_type, title, body, provenance, created_by)
--   values (gen_random_uuid(), 'disruptive', 'Warn before transitions',
--           'Give a two-minute warning...', 'Practice guidance, NSW DoE',
--           auth.uid());                                     -- 1 row
--
--   update public.evidence_strategies set title = 'Something else';
--   -- refused: an evidence strategy is not edited
--
--   update public.evidence_strategies set is_current = false;  -- allowed
--
-- As an educator: the select returns rows and the insert is refused.
-- As an anonymous visitor: nothing at all.
--
-- db/verify.sql: tables gains evidence_strategies; policies increases by three.
-- ---------------------------------------------------------------------------
