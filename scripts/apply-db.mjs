/**
 * Load db/*.sql into an empty Supabase project, in order, stopping dead at the
 * first failure.
 *
 *   npm run apply-db
 *
 * WHY THIS EXISTS. The 57 numbered files in db/ ARE the database. Applying them
 * by hand is 57 copy-pastes into the SQL editor in exactly the right order, and
 * one file out of sequence fails complaining about a missing table rather than
 * about the ordering — which is the part that costs an hour to work out. Every
 * developer who ever needs a fresh database has to do it again.
 *
 * IT RESUMES. Each file that succeeds is recorded in schema_history. Run it
 * again after fixing a failure and it starts from the file that broke, not from
 * 001. That matters: re-running 001 against a half-built database produces a
 * wall of "already exists" errors that bury the real one.
 *
 * IT DOES NOT WRAP FILES IN A TRANSACTION. 38 of them open their own with
 * `begin;` … `commit;`, and a second BEGIN around those would nest — the inner
 * commit would end the outer transaction early. Postgres already gives a
 * multi-statement query an implicit transaction, so the files that do NOT
 * manage their own are still all-or-nothing.
 *
 * NOT RUN: admin_tasks.sql, seed_test_data.sql, verify.sql. They are not part
 * of the sequence — they are run deliberately, one block at a time.
 *
 * It reports the table and policy counts at the end. A script that says
 * "57 applied" having created nothing is exactly the fault this project keeps
 * producing, so the last thing it does is go and look.
 */
import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'
import { loadEnv } from './lib/env.mjs'

const env = loadEnv()
const connectionString = env.DATABASE_URL

if (!connectionString) {
  console.error(`
DATABASE_URL is not set.

  Supabase dashboard → Connect → Session pooler → copy the URI,
  put it in .env.local as DATABASE_URL, and replace [YOUR-PASSWORD]
  with the database password you saved when you created the project.
`)
  process.exit(1)
}

// The transaction pooler multiplexes statements across connections, so a
// session-level thing like `begin` may not still be yours by the time the next
// statement runs. It fails in ways that look like broken SQL rather than a
// broken connection choice.
if (connectionString.includes(':6543')) {
  console.error(`
DATABASE_URL points at the TRANSACTION pooler (port 6543). Schema changes
need the SESSION pooler (port 5432).

  Supabase dashboard → Connect → Session pooler
`)
  process.exit(1)
}

const dir = new URL('../db/', import.meta.url)
const files = readdirSync(dir)
  .filter((f) => /^\d{3}_.*\.sql$/.test(f))
  .sort()

if (files.length === 0) {
  console.error('No numbered .sql files found in db/.')
  process.exit(1)
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()

// RLS on with NO policies denies everyone; the service_role this script uses
// bypasses it. Without this the table is reachable through the Data API by
// anyone holding the publishable key, because the project creates new tables
// exposed by default. It holds only filenames — but an unprotected table in
// public is the shape of fault this project keeps producing, and a bookkeeping
// table is no more entitled to be open than any other.
await client.query(`
  create table if not exists schema_history (
    filename text primary key,
    applied_at timestamptz not null default now()
  );
  alter table schema_history enable row level security;
  revoke all on schema_history from anon, authenticated;
`)

const { rows: history } = await client.query('select filename from schema_history')
const done = new Set(history.map((r) => r.filename))

console.log(`\n${files.length} files in db/, ${done.size} already applied\n`)

let applied = 0
let skipped = 0

for (const [i, file] of files.entries()) {
  const label = `${String(i + 1).padStart(2)}/${files.length}  ${file.padEnd(52)}`

  if (done.has(file)) {
    console.log(`${label}skipped`)
    skipped++
    continue
  }

  // Recording the filename in the SAME query as the file means the two cannot
  // disagree for the 19 files that have no transaction of their own.
  const body = readFileSync(new URL(file, dir), 'utf8').trim().replace(/;?$/, ';')
  const record = `insert into schema_history (filename) values ('${file.replace(/'/g, "''")}');`
  const started = Date.now()

  try {
    await client.query(`${body}\n${record}`)
  } catch (err) {
    console.error(`${label}FAILED\n`)
    console.error(`  ${err.message}`)
    if (err.detail) console.error(`  detail: ${err.detail}`)
    if (err.hint) console.error(`  hint:   ${err.hint}`)
    console.error(`
Nothing after this file was run. Fix db/${file}, then run this again — it
resumes from this file rather than starting over.
`)
    await client.end()
    process.exit(1)
  }

  console.log(`${label}ok   ${((Date.now() - started) / 1000).toFixed(1)}s`)
  applied++
}

const { rows: [counts] } = await client.query(`
  select
    (select count(*)::int from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE') as tables,
    (select count(*)::int from pg_policies where schemaname = 'public') as policies
`)

await client.end()

console.log(`
${applied} applied, ${skipped} already there.

The database now holds ${counts.tables} tables and ${counts.policies} row-level
security policies. Both should be well above zero — if either is 0 the files
ran but built nothing, and that is worth stopping for.
`)
