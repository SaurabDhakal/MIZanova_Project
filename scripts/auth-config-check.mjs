/**
 * The auth settings that are not in this repository.
 *
 *   npm run auth-config-check
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Everything else under scripts/ checks something the repository controls: a
 * policy in db/, a bundle, a contrast ratio. The settings below live in the
 * Supabase dashboard, so no diff shows them changing, no review catches them,
 * and the code goes on describing behaviour the project no longer has.
 *
 * That has already happened once here. AuthProvider's `changeEmail` says
 * Supabase "mails the NEW address and changes nothing until that link is
 * opened" — which is true only while Confirm email is ON. CONTRIBUTING §6
 * records that it is deliberately OFF so the test suite can create throwaway
 * accounts at a domain that can never receive mail, and that it "must go back
 * ON before this is used by real people".
 *
 * Two documents, both correct, describing opposite behaviour. This turns that
 * into something that fails.
 *
 * ---------------------------------------------------------------------------
 * WHY CONFIRM EMAIL IS MORE THAN A SIGNUP SETTING
 * ---------------------------------------------------------------------------
 * docs/12 records the risk it knows about: anyone can register an address they
 * do not own. The second consequence is not written down anywhere and is worse.
 *
 * With confirmation off, changing the address on an EXISTING account can take
 * effect with no link opened by anybody. The address on the account is the
 * address every future password reset goes to, so whoever changes it owns the
 * account permanently — and the real owner cannot even start a recovery,
 * because the address they would type is no longer on it.
 *
 * The only thing standing in front of that is the current-password prompt in
 * `changeEmail`, and that prompt is enforced in the browser. It stops somebody
 * using the settings page. It does not stop anybody who opens DevTools on an
 * unattended signed-in laptop and calls updateUser directly, and these are
 * shared classroom machines.
 *
 * So: this is a pre-release gate, not a style preference.
 */
import { loadEnv } from './lib/env.mjs'

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY

if (!url || !key || key.includes('PASTE_YOUR')) {
  console.error('.env.local is not configured — cannot check the auth settings.')
  process.exit(1)
}

let failures = 0
const fail = (message) => {
  console.log(`  FAIL  ${message}`)
  failures += 1
}
const ok = (message) => console.log(`  ok    ${message}`)
const note = (message) => console.log(`  note  ${message}`)

const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
if (!res.ok) {
  console.error(`Could not read auth settings: HTTP ${res.status}`)
  process.exit(1)
}
const settings = await res.json()

console.log('\nAuth settings on the live project\n')

/*
 * `mailer_autoconfirm` is the API's name for the dashboard's "Confirm email",
 * inverted: autoconfirm TRUE means confirmation is OFF.
 */
if (settings.mailer_autoconfirm === true) {
  fail(
    'Confirm email is OFF (mailer_autoconfirm: true).\n' +
      '        Signup: anyone can register an address they do not own.\n' +
      '        Email change: an address change can take effect with no link opened,\n' +
      '        which makes an unattended signed-in laptop a permanent account takeover.\n' +
      '        Turn it ON at Authentication → Sign In / Providers → Email before real\n' +
      '        users. The test suite signs up at a domain that cannot receive mail, so\n' +
      '        expect tests/rls to need reworking at the same time — CONTRIBUTING §6.',
  )
} else {
  ok('Confirm email is ON — an address must be proved before it is used.')
}

if (settings.external?.anonymous_users === true) {
  fail('Anonymous sign-ins are enabled. Nothing here expects unauthenticated users.')
} else {
  ok('Anonymous sign-ins are off.')
}

if (settings.external?.email !== true) {
  fail('Email sign-in is disabled — every account here signs in with an address.')
} else {
  ok('Email sign-in is on.')
}

if (settings.disable_signup === true) {
  note('Signup is disabled project-wide. /signup will fail for parents and individuals.')
} else {
  ok('Signup is open, as the parent and individual flows require.')
}

/*
 * Not exposed by /auth/v1/settings at any version checked, so it cannot be
 * asserted from here. Said out loud rather than skipped, because a check that
 * silently omits a setting reads as that setting having passed.
 */
note(
  'Secure email change is NOT reported by this endpoint and has to be read by hand:\n' +
    '        Authentication → Emails → "Secure email change".\n' +
    '        On, it mails the OLD address too, so a change made behind somebody’s\n' +
    '        back is at least visible to them. AuthProvider.changeEmail assumes it.',
)

console.log(
  failures === 0
    ? '\nPASS — the auth settings match what the code assumes.'
    : `\nFAIL — ${failures} setting(s) above. Not safe for real users.`,
)
/*
 * `exitCode`, not `process.exit()`. Calling exit here while undici still holds
 * the keep-alive socket from the fetch above crashes Node on Windows with a
 * libuv assertion — and it crashes AFTER this report has printed, so the check
 * appears to say its piece and then dies with status 127 regardless of whether
 * it passed. Closing the dispatcher lets the loop drain and the real status
 * survive, which is the only reason the exit status here is worth anything.
 */
await globalThis[Symbol.for('undici.globalDispatcher.1')]?.close?.()
process.exitCode = failures === 0 ? 0 : 1
