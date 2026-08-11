/**
 * Which accounts exist, can they receive email, and is 2FA on?
 *
 *   node --env-file=.env.local scripts/list-test-accounts.mjs
 *
 * Read-only. Prints no secrets — recovery codes are only ever stored hashed,
 * so this can show how many remain but never what they are.
 */
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const { data: profiles, error } = await admin
  .from('profiles')
  .select('id, email, role')
  .order('role')

if (error) {
  console.error(error.message)
  process.exit(1)
}

// getUserById, one call each, NOT listUsers.
//
// listUsers() omits `factors` entirely. Using it here reported "2FA off" for
// an account that was correctly enrolled, and very nearly had a working
// feature declared broken. A diagnostic that quietly returns a wrong answer is
// worse than no diagnostic.
const factorsByUser = new Map()
for (const profile of profiles ?? []) {
  const { data } = await admin.auth.admin.getUserById(profile.id)
  factorsByUser.set(profile.id, data?.user?.factors ?? [])
}

const { data: codes } = await admin
  .from('mfa_recovery_codes')
  .select('user_id, used_at')

console.log('Account                              Role             2FA   Codes')
console.log('-'.repeat(72))

for (const profile of profiles ?? []) {
  const factors = factorsByUser.get(profile.id) ?? []
  const verified = factors.some(
    (f) => f.factor_type === 'totp' && f.status === 'verified',
  )
  const unverified = factors.some((f) => f.status !== 'verified')

  const mine = (codes ?? []).filter((c) => c.user_id === profile.id)
  const unused = mine.filter((c) => c.used_at === null).length

  const state = verified ? 'ON ' : unverified ? '…  ' : 'off'
  console.log(
    `${(profile.email ?? '?').padEnd(36)} ${(profile.role ?? '?').padEnd(16)} ${state}   ${
      mine.length === 0 ? '-' : `${unused}/${mine.length}`
    }`,
  )
}

console.log(
  '\n2FA: ON = an authenticator is enrolled and verified. "…" = an enrolment\n' +
    'was started and never finished; it protects nothing and is cleared the\n' +
    'next time that person starts setup.\n' +
    '\nCodes: unused / total. Only hashes are stored, so the codes themselves\n' +
    'cannot be listed here or anywhere else.',
)
