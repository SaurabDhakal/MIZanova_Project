import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  disablePush,
  enablePush,
  pushAvailability,
  pushSubscribedHere,
} from '../lib/api'
import { showToast } from '../lib/toast'

/**
 * Notifications, for this browser — db/081.
 *
 * ---------------------------------------------------------------------------
 * "THIS DEVICE", NOT "YOUR ACCOUNT"
 * ---------------------------------------------------------------------------
 * A push subscription belongs to a browser. Turning notifications on at a
 * classroom desktop says nothing about the phone in somebody's pocket, and a
 * switch labelled as an account setting would be a lie the first time they
 * wondered why their phone stayed silent. Every word here says device.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROMISES, WHICH IS DELIBERATELY LITTLE
 * ---------------------------------------------------------------------------
 * The copy says a notification will never name a child, because that is a
 * promise the product has to keep and somebody deciding whether to switch this
 * on deserves to know it before they do. It is kept in two places that do not
 * depend on this screen: server/push.js composes only a count and a school,
 * and src/sw.ts ignores anything else it is handed.
 *
 * ---------------------------------------------------------------------------
 * THREE WAYS THIS CANNOT WORK, EACH SAID PLAINLY
 * ---------------------------------------------------------------------------
 * The browser cannot do Web Push; the deployment has no VAPID keys; or the
 * person has blocked notifications for this site in the browser itself. None
 * of them is a bug and all three look identical from a dead switch, so each
 * gets its own sentence. The third is the one worth naming precisely: a
 * denial is sticky, the browser will not ask again, and the only way back is
 * the browser's own site settings.
 */
export default function PushNotificationsSection() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const availability = useQuery({
    queryKey: ['push-availability'],
    queryFn: pushAvailability,
  })

  const subscribed = useQuery({
    queryKey: ['push-subscribed-here'],
    queryFn: pushSubscribedHere,
  })

  /*
   * Read in the initialiser rather than an effect. `Notification.permission`
   * is available synchronously and does not change on its own, so an effect
   * would only render once with the wrong answer and again with the right one
   * — which is what `react-hooks/set-state-in-effect` objects to. It is still
   * state because the mutations below refresh it after a prompt.
   *
   * Only used to explain a BLOCKED browser. The switch itself reads whether a
   * subscription exists, because permission can be granted while none has been
   * made.
   */
  const [permission, setPermission] = useState<NotificationPermission | null>(
    () => ('Notification' in window ? Notification.permission : null),
  )

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['push-subscribed-here'] })

  const turnOn = useMutation({
    mutationFn: async () => {
      if (availability.data?.state !== 'ready') return
      await enablePush(availability.data.key)
    },
    onSuccess: async () => {
      await refresh()
      setError(null)
      if ('Notification' in window) setPermission(Notification.permission)
      showToast('Notifications are on for this device.')
    },
    onError: (e) => {
      if ('Notification' in window) setPermission(Notification.permission)
      setError(e.message)
    },
  })

  const turnOff = useMutation({
    mutationFn: disablePush,
    onSuccess: async () => {
      await refresh()
      setError(null)
      showToast('Notifications are off for this device.')
    },
    onError: (e) => setError(e.message),
  })

  const state = availability.data?.state
  const isOn = subscribed.data === true
  const busy = turnOn.isPending || turnOff.isPending

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-raised">
      <h2 className="text-lg font-bold text-foreground">
        Notifications on this device
      </h2>

      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        A notification tells you <b>how many</b> things need you and{' '}
        <b>which school</b>. It never names a child or says what happened —
        these screens are open on shared classroom machines, and a notification
        can be read without signing in.
      </p>

      {availability.isPending && (
        <p className="mt-4 text-sm text-muted-foreground">Checking…</p>
      )}

      {availability.isError && (
        <p className="mt-4 text-sm text-muted-foreground">
          Whether this device can receive notifications could not be checked, so
          this is unknown rather than unavailable.
        </p>
      )}

      {state === 'unsupported' && (
        <p className="mt-4 rounded-btn border border-border bg-background p-3 text-sm text-muted-foreground">
          This browser cannot receive notifications from a website. On an
          iPhone, that is every browser unless the site has been added to the
          home screen.
        </p>
      )}

      {state === 'unconfigured' && (
        <p className="mt-4 rounded-btn border border-border bg-background p-3 text-sm text-muted-foreground">
          Notifications are not switched on for this deployment yet. Special
          Miles has to add the keys that let the server send them.
        </p>
      )}

      {state === 'ready' && (
        <>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
            >
              {error}
            </p>
          )}

          {permission === 'denied' && !isOn ? (
            <p className="mt-4 rounded-btn border border-warning bg-warning-subtle p-3 text-sm text-warning-foreground">
              This browser is blocking notifications from MiZanova. Turning them
              on here cannot override that — it has to be changed in the
              browser&rsquo;s own settings for this site, usually behind the
              padlock in the address bar.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy || subscribed.isPending}
                onClick={() => (isOn ? turnOff.mutate() : turnOn.mutate())}
                className={`rounded-btn px-4 py-2.5 font-semibold disabled:opacity-60 ${
                  isOn
                    ? 'border border-border bg-card text-foreground'
                    : 'bg-primary text-primary-foreground'
                }`}
              >
                {busy
                  ? 'Just a moment…'
                  : isOn
                    ? 'Turn off on this device'
                    : 'Turn on for this device'}
              </button>

              <span className="text-sm text-muted-foreground">
                {subscribed.isPending
                  ? ''
                  : isOn
                    ? 'On for this device.'
                    : 'Off for this device.'}
              </span>
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            {/* Said because the alternative is somebody turning it off on one
                machine and assuming it is off everywhere. */}
            Each browser is separate. Turning this on at school does not turn it
            on at home.
          </p>
        </>
      )}
    </section>
  )
}
