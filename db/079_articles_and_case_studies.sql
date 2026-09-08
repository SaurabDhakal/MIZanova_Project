-- ===========================================================================
-- 079_articles_and_case_studies.sql
-- ===========================================================================
-- Run in the Supabase SQL editor. Safe to run twice. Commit first.
--
-- ---------------------------------------------------------------------------
-- WHY: THE OTHER HALF OF REQUIREMENT 4
-- ---------------------------------------------------------------------------
-- Joe Abboud's requirement 4: "Content & resource management (CMS) — scalable
-- CRUD functionality for courses, articles, case studies, and media uploads."
--
-- db/075 built courses. Articles and case studies did not exist at all, and
-- they are not the same thing as a course: a course is a sequence somebody
-- works THROUGH and gets counted for, an article is a page somebody READS.
-- Modelling a one-page article as a one-module course would put it in the
-- Academy with an enrolment, a progress bar and a "Mark as done" button, which
-- is furniture for something nobody is completing.
--
-- ---------------------------------------------------------------------------
-- ONE TABLE, TWO KINDS
-- ---------------------------------------------------------------------------
-- An article and a case study differ in what they are FOR, not in what they
-- are made of: both are a title, a body and an audience. A case study is
-- written about a real school or family, which is why it gets a field for the
-- consent position rather than a separate table.
--
-- ---------------------------------------------------------------------------
-- A CASE STUDY IS ABOUT REAL PEOPLE, AND THAT IS THE WHOLE RISK
-- ---------------------------------------------------------------------------
-- Special Miles' own material describes work with named schools and families.
-- A CMS that lets somebody publish "how we supported a Year 3 student with
-- selective mutism at Parramatta West" is a CMS that can identify a child, and
-- nothing about the writing tool would stop it.
--
-- So a case study cannot be published without `consent_confirmed` — an explicit
-- statement that whoever it is about agreed to it. It is a checkbox against
-- carelessness rather than a security boundary, the same argument db/047 makes
-- about approving a specialist with no screening number: the thing being
-- prevented is a tired person at the end of a queue.
--
-- The audiences on an article are the same `user_role` list db/075 uses, for
-- the same reason: they are the same people, and a second vocabulary would
-- drift.
-- ===========================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'article_kind') then
    create type public.article_kind as enum ('article', 'case_study');
  end if;
end $$;

create table if not exists public.articles (
  id          uuid primary key default gen_random_uuid(),

  kind        public.article_kind not null default 'article',

  title       text not null check (btrim(title) <> ''),
  -- Shown in a list. The thing somebody decides from.
  summary     text not null check (btrim(summary) <> ''),
  -- Plain text, as db/075's modules are, and for the same reason: this is
  -- written by staff and rendered to families, and storing markup pasted out of
  -- Word is how a content field becomes an injection surface. The brief names
  -- input validation by name.
  body        text not null default '' check (length(body) <= 40000),

  audiences   public.user_role[] not null
                check (array_length(audiences, 1) >= 1),

  -- ONLY MEANINGFUL FOR A CASE STUDY, and false is the honest default: nobody
  -- has confirmed anything until they say so.
  consent_confirmed boolean not null default false,

  is_published boolean not null default false,
  published_at timestamptz,

  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint articles_published_has_timestamp
    check (is_published = (published_at is not null)),

  -- THE ONE THAT MATTERS. A case study about real people cannot reach an
  -- audience until somebody has said the people in it agreed. An article is
  -- about nobody in particular, so it is unaffected.
  constraint articles_case_study_needs_consent
    check (
      kind <> 'case_study'
      or is_published = false
      or consent_confirmed = true
    )
);

create index if not exists articles_published_idx
  on public.articles (is_published, kind, created_at desc);

drop trigger if exists articles_touch on public.articles;
create trigger articles_touch
  before update on public.articles
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- Who may read and write
-- ---------------------------------------------------------------------------
alter table public.articles enable row level security;

drop policy if exists articles_select on public.articles;
drop policy if exists articles_write on public.articles;

create policy articles_select on public.articles
  for select to authenticated
  using (
    public.is_platform_admin()
    or (is_published and public.my_role() = any (audiences))
  );

-- Special Miles writes its own material. A school publishing to other schools'
-- families through this product is a different thing entirely, and one where
-- "who checked this" stops having an answer.
create policy articles_write on public.articles
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on public.articles from anon;

commit;

-- ---------------------------------------------------------------------------
-- Check it worked
-- ---------------------------------------------------------------------------
--   select tablename, rowsecurity from pg_tables where tablename = 'articles';
--   -- true
--
-- The constraint that exists for the children in these stories. This must FAIL:
--
--   insert into public.articles
--     (kind, title, summary, audiences, is_published, published_at)
--   values ('case_study', 'A student at Parramatta West', 's', '{parent}',
--           true, now());
--   -- articles_case_study_needs_consent
--
-- And the same row with consent_confirmed = true must succeed. An ARTICLE
-- publishes either way, because it is about nobody in particular.
--
-- STILL NOT HERE: media inside an article. db/030's `resources` is
-- school-scoped (`school_id not null`) and cannot hold Special Miles' own
-- files, so images and downloads wait for a platform-level bucket — the same
-- omission db/075 records for course toolkits, and the same fix will serve
-- both.
-- ---------------------------------------------------------------------------
