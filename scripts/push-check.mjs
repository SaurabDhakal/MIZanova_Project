/**
 * Does a push notification actually arrive?
 *
 *   npm run push-check your.email@example.com
 *
 * WHY THIS EXISTS. Everything up to the last step can be verified without it:
 * the row lands in `push_subscriptions`, `/api/push/key` reports configured,
 * the built worker contains a `push` listener. None of that proves a
 * notification reaches a screen — the encryption, the VAPID signature and the
 * push service are all between the two, and each fails silently in its own way.
 *
 * It is also the only way to see what the notification LOOKS like, which
 * matters more here than usual: the rule is that it names a count and a school
 * and never a child, and reading it is the check that the rule survived.
 *
 * IT REPORTS WHAT THE PUSH SERVICE SAID. Not "sent", not "queued" — the count
 * of endpoints that accepted it and the count it deleted as dead. A person with
 * notifications switched off on every device gets `0 sent`, and that is a
 * useful answer rather than a failure.
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './lib/env.mjs'

const env = loadEnv()
for (const [name, value] of Object.entries(env)) {
  if (value !== undefined) process.env[name] = value
}

/* Imported AFTER the environment is populated: server/push.js reads its VAPID
   keys at import and decides then whether it is configured at all. */
const { pushConfigured, sendToProfile } = await import('../server/push.js')

const who = process.argv[2]
if (!who) {
  console.error(
    '\nWhose device? Pass the email address of a signed-up account:\n' +
      '  npm run push-check your.email@example.com\n',
  )
  process.exit(1)
}

if (!pushConfigured()) {
  console.error(
    '\nPush is not configured, so nothing can be sent.\n' +
      'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must all be set,\n' +
      'and the subject must be a mailto: or https: URL.\n',
  )
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('\nVITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.\n')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: profile, error } = await admin
  .from('profiles')
  .select('id, full_name, email')
  .eq('email', who)
  .maybeSingle()

if (error) {
  console.error('\nCould not look that account up:', error.message, '\n')
  process.exit(1)
}
if (!profile) {
  console.error(`\nNo account with the address ${who}.\n`)
  process.exit(1)
}

const { count } = await admin
  .from('push_subscriptions')
  .select('id', { count: 'exact', head: true })
  .eq('profile_id', profile.id)

console.log(`\n${profile.full_name ?? who} has ${count ?? 0} device(s) subscribed.`)

if (!count) {
  console.log(
    'Nothing to send to. Turn notifications on for a device first, on\n' +
      'Settings > Profile > Notifications on this device.\n',
  )
  process.exit(0)
}

/*
 * A REAL SEND, through the same function the product uses. A script with its
 * own copy of the sending logic would prove that the copy works.
 *
 * The count is deliberately 1 and the place is named as a test, so nobody
 * seeing this on a screen mistakes it for a real thing needing them.
 */
const result = await sendToProfile(admin, profile.id, {
  count: 1,
  where: 'a test from your own machine',
  url: '/',
})

console.log('\nPush service accepted:', result.sent, 'of', count)
if (result.removed) {
  console.log(
    'Removed:',
    result.removed,
    'subscription(s) the push service no longer recognised.',
  )
}
if (result.error) console.log('Error:', result.error)

console.log(
  result.sent > 0
    ? '\nIf nothing appears within a few seconds, the browser is blocking\n' +
        'notifications at the operating-system level — on Windows, check\n' +
        'Settings > System > Notifications for the browser.\n'
    : '\nNothing was accepted. Every subscription on file was rejected.\n',
)

process.exit(0)
