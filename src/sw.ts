/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

/**
 * The service worker, written out rather than generated.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * vite.config.ts used to run the plugin in `generateSW` mode, which writes the
 * worker for us and gives no way to add a `push` listener to it. The usual
 * workaround is `workbox.importScripts`, and it is exactly wrong here: the
 * config's own note explains that a worker restarted while offline cannot
 * fetch a second script, so `importScripts` throws and the worker dies before
 * serving a single cached file. That is the bug `inlineWorkboxRuntime: true`
 * was set to fix, and importing a push handler at startup would reintroduce it.
 *
 * `injectManifest` bundles this file, so everything the worker needs is in one
 * script that is already on disk. Nothing is fetched at startup.
 *
 * Everything below other than the push handlers is what the generated worker
 * did, kept deliberately identical:
 *   - precache the shell from the injected manifest
 *   - fall back to index.html so deep links open offline
 *   - NO runtime caching, so no Supabase response ever reaches the disk
 *   - wait to activate until the page says so
 */

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// The shell: JS, CSS, HTML, fonts, svg and png, exactly as globPatterns lists.
precacheAndRoute(self.__WB_MANIFEST)

/*
 * Deep links must work offline. Without this /educator/students/<id> asks the
 * network for a URL only React Router knows about, and fails while
 * /educator/students opens from cache.
 */
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

/*
 * PROMPTED, NOT AUTOMATIC. The worker waits until UpdatePrompt asks, because
 * swapping the code under somebody midway through logging an incident is not
 * acceptable. `applyUpdate` in src/lib/swUpdate.ts posts this message and then
 * waits for controllerchange.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

/**
 * ---------------------------------------------------------------------------
 * PUSH — AND WHAT A NOTIFICATION IS NOT ALLOWED TO SAY
 * ---------------------------------------------------------------------------
 * A notification is drawn on a locked screen and in a tray, to whoever is
 * looking at the device. These laptops are shared between classrooms — that is
 * the reason this worker caches no Supabase response at all — and a
 * notification is the same exposure with a wider audience, because it needs no
 * password to read.
 *
 * So the payload carries a COUNT and a PLACE and nothing else. Never a child's
 * name, never a behaviour, never why. "3 things need you at Willow Creek" is
 * the entire message; the detail is behind the sign-in, where it belongs.
 *
 * This handler enforces that rather than trusting the sender: it reads only
 * `count`, `where` and `url`, and composes the text itself. A server that one
 * day sends a child's name in a `body` field will find it ignored.
 */
type PushPayload = { count?: number; where?: string; url?: string }

function describe(payload: PushPayload): { title: string; body: string } {
  const count = typeof payload.count === 'number' ? payload.count : 0
  const thing = count === 1 ? 'thing needs' : 'things need'

  return {
    title: count > 0 ? `${count} ${thing} you` : 'Something needs you',
    /* The place is a school, not a person, and is included because somebody
       working across two schools cannot otherwise tell which one is asking. */
    body: payload.where
      ? `At ${payload.where}. Open MiZanova to see what.`
      : 'Open MiZanova to see what.',
  }
}

self.addEventListener('push', (event) => {
  /*
   * A push with no data still shows something. Browsers may deliver an empty
   * push to keep a subscription alive, and a handler that returns without
   * calling showNotification can have the subscription revoked for it.
   */
  let payload: PushPayload
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {}
  } catch {
    payload = {}
  }

  const { title, body } = describe(payload)

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      /* A shipped, precached asset — globPatterns includes png, so this is
         on disk and the notification still has a mark with the wifi off. */
      icon: '/logo-mark.png',
      badge: '/logo-mark.png',
      /*
       * One notification, replaced each time. Without a tag, six things
       * happening in a morning stack six identical notifications, which is how
       * somebody turns them off for good.
       */
      tag: 'mizanova-work-queue',
      renotify: true,
      data: { url: typeof payload.url === 'string' ? payload.url : '/' },
    } as NotificationOptions),
  )
})

/**
 * Clicking it focuses the tab that is already open rather than opening a
 * seventh one. A teacher with MiZanova open in a pinned tab should land there.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data?.url as string) ?? '/'

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      for (const client of clients) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(target)
          return
        }
      }

      await self.clients.openWindow(target)
    })(),
  )
})
