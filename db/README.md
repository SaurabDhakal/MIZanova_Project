# Database scripts

SQL for the MiZanova database, in the order it must be run.

## How to run one

1. Supabase dashboard → **SQL Editor** → **New query**
2. Paste the whole file
3. **Run**
4. Expect `Success. No rows returned`

## Why these live in `db/` and not `supabase/migrations/`

The GitHub integration on this project watches `supabase/migrations/` and can
apply anything it finds there automatically on push. We keep scripts out of
that folder on purpose: the Supabase SQL editor does **not** wrap a script in a
transaction, so a script that fails halfway leaves the earlier half committed.
That is survivable when you run it by hand and read the error; it is nasty when
a `git push` triggers it silently.

Run them yourself, read the output, then commit.

## Every script is safe to run twice

Each uses `create table if not exists`, `create or replace function`,
`drop trigger if exists` before `create trigger`, and guarded `do $$` blocks for
types. If a run fails partway, fix the error and run the whole file again — it
will skip what already exists rather than erroring on it.

## Backups

Free-tier Supabase projects get no automated backups. **These files are the
backup.** Commit a script before you run it.

## Order

| File | What it creates |
|---|---|
| `001_foundation.sql` | Role type, `schools`, `profiles`, signup trigger, RLS locked on |
| `002_students.sql` | `students` (with the first-name-plus-initial generated column), `student_guardians`, `student_educators`, `consents` |
| `003_rls_helpers.sql` | Security-definer helper functions the policies are built from |
| `004_rls_policies.sql` | The access control system: 17 row-level security policies plus column grants |
| `005_behaviour_logs.sql` | `behaviour_logs` with its own policies. Parent visibility off by default. |
| `006_ai_strategies.sql` | `ai_controls` (kill switch, threshold), `ai_strategies`, `strategy_feedback` |
| `007_home_observations.sql` | `home_observations` — what parents contribute, visible to assigned staff by default |
| `008_goals.sql` | `goals`, `goal_milestones` (progress computed by trigger), `iep_documents`, `iep_acknowledgements` |
| `verify.sql` | Read-only. Run any time to see the real state of the schema. |
| `admin_tasks.sql` | Copy one block at a time. School assignment, verification, admin promotion, guardian linking. |
| `seed_test_data.sql` | One test school and four students to develop against. Not production data. |
