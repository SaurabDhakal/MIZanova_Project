/**
 * Delete operational data that has outlived its purpose.
 *
 *   npm run purge            show what WOULD go, delete nothing
 *   npm run purge -- --yes   actually delete
 *
 * Australian Privacy Principle 11.2 requires personal information to be
 * destroyed once it is no longer needed. This is the mechanism for the parts
 * of MiZanova where a period has actually been agreed — see db/025 for what
 * is covered and, more importantly, what deliberately is not.
 *
 * DRY RUN BY DEFAULT. A script whose whole job is deleting rows should not do
 * it because somebody pressed up-arrow and enter.
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './lib/env.mjs'

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error(
    'Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The purge functions\n' +
      'are granted to service_role only, deliberately.',
  )
  process.exit(1)
}

const commit = process.argv.includes('--yes')
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const ACCESS_KEEP_DAYS = 365
const CODES_KEEP_DAYS = 90

const cutoff = (days) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

console.log(commit ? 'PURGING\n' : 'DRY RUN — nothing will be deleted\n')

// --- What would go ---------------------------------------------------------
const { count: oldAccess } = await admin
  .from('student_access_events')
  .select('id', { count: 'exact', head: true })
  .lt('occurred_at', cutoff(ACCESS_KEEP_DAYS))

const { count: totalAccess } = await admin
  .from('student_access_events')
  .select('id', { count: 'exact', head: true })

const { count: spentCodes } = await admin
  .from('mfa_recovery_codes')
  .select('id', { count: 'exact', head: true })
  .not('used_at', 'is', null)
  .lt('used_at', cutoff(CODES_KEEP_DAYS))

console.log(
  `  record access      ${String(oldAccess ?? 0).padStart(6)} of ${totalAccess ?? 0} older than ${ACCESS_KEEP_DAYS} days`,
)
console.log(
  `  spent 2FA codes    ${String(spentCodes ?? 0).padStart(6)} used more than ${CODES_KEEP_DAYS} days ago`,
)

if (!commit) {
  console.log('\nRun `npm run purge -- --yes` to delete these.')
  process.exit(0)
}

// --- Do it -----------------------------------------------------------------
const { data: accessDeleted, error: accessError } = await admin.rpc(
  'purge_access_events',
  { p_keep_days: ACCESS_KEEP_DAYS },
)
if (accessError) {
  console.error('\nAccess event purge failed:', accessError.message)
  process.exit(1)
}

const { data: codesDeleted, error: codesError } = await admin.rpc(
  'purge_spent_recovery_codes',
  { p_keep_days: CODES_KEEP_DAYS },
)
if (codesError) {
  console.error('\nRecovery code purge failed:', codesError.message)
  process.exit(1)
}

console.log(`\n  deleted ${accessDeleted} access event(s)`)
console.log(`  deleted ${codesDeleted} spent recovery code(s)`)
console.log(
  '\nNothing about any child was touched. Retention for student records is a\n' +
    'decision for the school — see the note at the end of db/025_retention.sql.',
)
