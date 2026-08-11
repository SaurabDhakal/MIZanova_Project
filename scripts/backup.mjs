/**
 * Copy every row out of the database into JSON files.
 *
 *   npm run backup
 *
 * WHY THIS EXISTS. The free Supabase tier keeps no backups. If the data were
 * deleted or corrupted — by a wrong DELETE in the SQL editor, or by anything
 * else — it would be gone, and §2.4 of the architecture review has said so
 * since it was written.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT.
 *
 * It is a copy of the DATA. It is not a `pg_dump`: it does not capture the
 * schema, the policies, the functions, the triggers or the indexes.
 *
 * That is a smaller gap than it sounds, because all of those already live in
 * `db/*.sql` in git. Schema in git plus data here is genuinely enough to
 * rebuild: run the numbered scripts into a fresh project, then load these
 * files back.
 *
 * What it does NOT cover, and a real `pg_dump` would:
 *   - auth.users. Accounts and password hashes live in a schema this cannot
 *     read. A rebuild would need everyone to sign up again.
 *   - Exact ordering and sequence state.
 *   - Anything added to the database and not listed below.
 *
 * WHERE THE FILES GO. `backups/`, which is gitignored — they contain real
 * children's records. Treat that folder like the database itself: a copy on a
 * laptop is still a copy of a child's behaviour history.
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv } from './lib/env.mjs'

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Every table, in an order that could be loaded back without breaking a
 * foreign key: parents before children.
 *
 * IF YOU ADD A TABLE, ADD IT HERE. A backup that silently misses a table is
 * the worst kind, because you only discover it while restoring.
 */
const TABLES = [
  'schools',
  'profiles',
  'students',
  'student_guardians',
  'student_educators',
  'consents',
  'behaviour_logs',
  'ai_controls',
  'ai_strategies',
  'strategy_feedback',
  'ai_generation_events',
  'home_observations',
  'goals',
  'goal_milestones',
  'iep_documents',
  'iep_acknowledgements',
  'message_threads',
  'thread_participants',
  'messages',
  'ai_control_events',
  'admin_audit_events',
  'mfa_recovery_codes',
  'invoices',
  'specialist_sessions',
  'specialist_session_notes',
  'student_access_events',
  'system_events',
]

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const dir = join(process.cwd(), 'backups', stamp)
mkdirSync(dir, { recursive: true })

console.log(`Backing up to backups/${stamp}\n`)

let total = 0
let failed = 0

for (const table of TABLES) {
  // Paged, because a single select silently caps at 1000 rows in PostgREST —
  // which would produce a backup that looks complete and is not.
  const rows = []
  let from = 0
  const page = 1000

  for (;;) {
    const { data, error } = await admin
      .from(table)
      .select('*')
      .range(from, from + page - 1)

    if (error) {
      console.log(`  *** ${table.padEnd(24)} FAILED — ${error.message}`)
      failed++
      break
    }

    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < page) break
    from += page
  }

  writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows, null, 2))
  total += rows.length
  console.log(`  ok  ${table.padEnd(24)} ${String(rows.length).padStart(6)} row(s)`)
}

writeFileSync(
  join(dir, 'README.txt'),
  [
    `MiZanova data backup — ${new Date().toISOString()}`,
    '',
    `${total} rows across ${TABLES.length} tables.`,
    '',
    'THIS CONTAINS REAL CHILDREN\'S RECORDS. Store it as carefully as the',
    'database itself. Do not commit it, email it, or leave it in Downloads.',
    '',
    'To rebuild from this:',
    '  1. Create a new Supabase project.',
    '  2. Run db/001_*.sql through to the highest number, in order.',
    '  3. Load these JSON files in the order listed in scripts/backup.mjs.',
    '',
    'NOT included: auth.users. Accounts and passwords live in a schema this',
    'backup cannot read, so everyone would need to sign up again and be',
    're-linked. A pg_dump with the database password would capture them.',
  ].join('\n'),
)

console.log(
  failed === 0
    ? `\nDone. ${total} rows in backups/${stamp}`
    : `\n${failed} table(s) failed. This backup is INCOMPLETE — do not rely on it.`,
)
process.exit(failed === 0 ? 0 : 1)
