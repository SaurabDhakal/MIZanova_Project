-- ---------------------------------------------------------------------------
-- 134 — What the demo says it sent
-- ---------------------------------------------------------------------------
-- Saurab, looking at the review queue: "in the what the ai was told button it
-- is now not showing anything".
--
-- It was not a UI fault. `SentToAi` parses `anonymised_input` as JSON and
-- renders five plain groups from it. The seeded strategies stored a sentence:
--
--     'A student in this year level; withdrawn, high intensity.'
--
-- `JSON.parse` throws, the component falls back to printing the raw string,
-- and a specialist opening the panel on any of 115 seeded suggestions saw one
-- line with nothing in it. 64 of the 68 rows in the review queue are seeds, so
-- in practice the panel looked broken.
--
-- ---------------------------------------------------------------------------
-- THE SEED WAS ALSO CLAIMING A REDACTION THAT NEVER HAPPENED
-- ---------------------------------------------------------------------------
-- `redaction_count` was hardcoded to 2. The panel renders that as "2 names or
-- contact details were taken out of your notes before they were sent" — and
-- not one seeded note contains a name. ("Refused to line up after lunch."
-- "Tore up the worksheet after the second correction.")
--
-- A privacy panel inventing two redactions is worse than one that says none
-- were needed, because the number is the thing a parent would be shown. It is
-- now 0, which is true.
--
-- ---------------------------------------------------------------------------
-- EVERY FIELD BELOW IS TRUE OF THE INCIDENT IT DESCRIBES
-- ---------------------------------------------------------------------------
-- This does not invent a payload. It builds one from the log the suggestion is
-- actually attached to — the behaviour type, the intensity, the duration, the
-- year level and the teacher's own notes, all read from `behaviour_logs`. A
-- specialist reading the panel now sees the same facts the model would have
-- been given.
--
-- `reconstructed: true` is included and the UI says so. These rows are demo
-- data and nothing was ever sent to a model for them; a payload that looked
-- like a genuine capture would be a small forgery in the one panel whose whole
-- job is to tell the truth about what left the building.
--
-- The 90-day window on `student_behaviour_patterns` is chosen to span the demo
-- school's own history — its logs run about ten weeks. The default 42 would
-- return total = 0 for the older half, and a patterns block reading "0
-- observations" is worse than no patterns block, so it is omitted when empty.
-- ---------------------------------------------------------------------------

begin;

update public.ai_strategies a
set
  anonymised_input = (
    select jsonb_strip_nulls(
      jsonb_build_object(
        'behaviourType', l.behaviour_type,
        'intensity',     l.intensity,
        'approximateDurationMinutes',
          case when l.duration_seconds is not null
               then round(l.duration_seconds / 60.0)
          end,
        'yearLevel',     st.year_level,
        'notes',         nullif(l.notes, ''),
        'antecedent',    l.antecedent,
        'whatHelped',    l.what_helped,
        'settingEvents',
          case when cardinality(coalesce(l.setting_events, '{}')) > 0
               then to_jsonb(l.setting_events)
          end,
        -- Only when it actually counted something. See the header.
        'patterns',
          case when (p.value->>'total')::int > 0 then p.value end,
        'redactions',    0,
        'reconstructed', true
      )
    )::text
    from public.behaviour_logs l
    join public.students st on st.id = l.student_id
    cross join lateral (
      select public.student_behaviour_patterns(l.student_id, 90) as value
    ) p
    where l.id = a.behaviour_log_id
  ),
  redaction_count = 0
where a.prompt_version = 'demo-seed';

commit;

-- ---------------------------------------------------------------------------
-- Check it.
--
--   select count(*) from public.ai_strategies
--   where prompt_version = 'demo-seed' and anonymised_input not like '{%';
--   -- 0
--
--   select anonymised_input from public.ai_strategies
--   where prompt_version = 'demo-seed' limit 1;
--   -- parses, and its notes match the log it hangs off
--
--   select distinct redaction_count from public.ai_strategies
--   where prompt_version = 'demo-seed';   -- 0
--
-- db/verify.sql: no schema change. Data only.
-- ---------------------------------------------------------------------------
