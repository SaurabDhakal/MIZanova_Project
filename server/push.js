import webpush from 'web-push'

/**
 * Sending a device a notification — the other half of db/081.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE, ENFORCED HERE RATHER THAN REMEMBERED
 * ---------------------------------------------------------------------------
 * A notification is drawn on a locked screen, to whoever is holding or walking
 * past the device. vite.config.ts refuses to cache any Supabase response
 * because "these laptops are shared between classrooms"; a notification is the
 * same exposure without even a password in front of it.
 *
 * So the payload is a COUNT and a PLACE. Never a child's name, never what
 * happened, never why. `sendToProfile` below takes exactly those fields and
 * has no parameter a name could travel in — the shape of the function is the
 * rule. The service worker composes the words and ignores anything else it is
 * sent, so the guarantee holds at both ends.
 *
 * ---------------------------------------------------------------------------
 * VAPID
 * ---------------------------------------------------------------------------
 * Web Push needs a key pair identifying this server to the push services. It
 * is a credential, so it lives in the environment like every other one:
 *
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (a mailto: or https:)
 *
 * Generate a pair with:  npx web-push generate-vapid-keys
 *
 * With no keys the module stays quiet and `pushConfigured()` answers false, the
 * same shape `mailConfigured()` uses — so an unconfigured deployment declines
 * to offer notifications rather than failing when somebody enables them.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? ''
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? ''
const SUBJECT = process.env.VAPID_SUBJECT ?? ''

let ready = false

if (PUBLIC_KEY && PRIVATE_KEY && SUBJECT) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
  ready = true
}

export function pushConfigured() {
  return ready
}

/** The browser needs this to subscribe. Public by definition — it is the half
 *  of the key pair that identifies the server, not the half that signs. */
export function vapidPublicKey() {
  return PUBLIC_KEY
}

/**
 * Notify every browser one person has enabled.
 *
 * Takes the service-role client rather than creating one, so this module holds
 * no credentials of its own and cannot be called from a request that has not
 * already earned them.
 *
 * Returns what happened rather than throwing: a person's phone having an
 * expired subscription is not a reason for the thing that triggered the
 * notification to fail.
 */
export async function sendToProfile(admin, profileId, { count, where, url }) {
  if (!ready) return { sent: 0, removed: 0, skipped: 'not configured' }

  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', profileId)

  if (error) return { sent: 0, removed: 0, error: error.message }
  if (!subscriptions?.length) return { sent: 0, removed: 0 }

  /* Composed here so nothing else can put anything else in it. */
  const payload = JSON.stringify({
    count: typeof count === 'number' ? count : 0,
    where: where ?? null,
    url: url ?? '/',
  })

  let sent = 0
  const dead = []

  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
        )
        sent += 1
      } catch (err) {
        /*
         * 404 and 410 mean the push service has forgotten this subscription —
         * the browser profile was deleted, or notifications were revoked in the
         * browser rather than in MiZanova. Those rows are dead and keeping them
         * means retrying them forever.
         *
         * Anything else (a timeout, a 500 from the push service) is left alone:
         * deleting a subscription because a push service had a bad afternoon
         * would silently switch somebody's notifications off.
         */
        if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(row.id)
      }
    }),
  )

  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('id', dead)
  }

  if (sent > 0) {
    await admin
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('profile_id', profileId)
  }

  return { sent, removed: dead.length }
}
