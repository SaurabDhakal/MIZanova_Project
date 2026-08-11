import { registerSW } from 'virtual:pwa-register'

/**
 * Service worker registration, and the "a new version is ready" flag.
 *
 * REGISTERED AT APP START, NOT FROM A COMPONENT. The first version of this
 * called `useRegisterSW` inside `UpdatePrompt`, which `AppShell` renders — so
 * it only ran for a signed-in user already inside a role section. Anyone who
 * landed on /login registered nothing at all, which is most first visits, and
 * the sign-in page itself could never work offline. The DevTools Service
 * Workers panel was simply empty.
 *
 * Registration is a page-lifetime concern, not a screen's. It belongs here.
 *
 * The update flag is an external store for the same reason the offline queue
 * is one: the thing that learns about the update is a callback outside React.
 */

let needRefresh = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function subscribeToSwUpdate(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getNeedRefresh(): boolean {
  return needRefresh
}

export function dismissUpdate(): void {
  if (!needRefresh) return
  needRefresh = false
  emit()
}

/**
 * Activate the waiting worker, then reload. Only ever called by a person.
 *
 * Done explicitly rather than through the plugin's own `updateSW(true)`, which
 * reloads from inside a `controlling` listener — and if that event never
 * fires, the button silently does nothing at all. That is exactly what
 * happened: DevTools showed "#1943 activated and is running" alongside "#1945
 * waiting to activate", the page reloaded under the OLD worker, and the user
 * saw the previous build come back with no explanation.
 *
 * A plain reload cannot fix it. A waiting worker does not take over just
 * because the page reloads — the old one keeps control until every tab closes
 * — so the waiting worker has to be told to skip waiting first. The generated
 * service worker listens for exactly this message.
 *
 * The timeout matters: whatever happens, we reload. A button that does nothing
 * is worse than one that reloads without having updated, because at least the
 * second is visible.
 */
export async function applyUpdate(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    const waiting = registration?.waiting

    if (waiting) {
      const tookOver = new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => resolve(),
          { once: true },
        )
      })
      const gaveUp = new Promise<void>((resolve) => setTimeout(resolve, 3000))

      waiting.postMessage({ type: 'SKIP_WAITING' })
      await Promise.race([tookOver, gaveUp])
    }
  } catch (error) {
    console.error('Could not activate the waiting service worker:', error)
  }

  window.location.reload()
}

/**
 * Call once, before rendering. Safe in dev: with `devOptions.enabled: false`
 * the plugin supplies a no-op, so this does nothing and hot reload is
 * untouched.
 */
/** How often an already-open tab looks for a new version. */
const UPDATE_CHECK_MS = 60 * 60 * 1000

export function initServiceWorker(): void {
  // The returned updater is deliberately discarded — `applyUpdate` above does
  // the activation itself, for the reason documented there.
  registerSW({
    immediate: true,

    onNeedRefresh() {
      needRefresh = true
      emit()
    },

    /**
     * Look again every hour.
     *
     * Without this, a new version is only noticed when the page loads. A
     * teacher who opens MiZanova on Monday and leaves the tab open all week
     * would never be offered one — which is how a fixed bug fails to reach the
     * person it was fixed for.
     */
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      setInterval(() => {
        // Pointless offline, and it would log a failure every hour.
        if (navigator.onLine === false) return
        void registration.update()
      }, UPDATE_CHECK_MS)
    },

    onRegisterError(error) {
      // Worth seeing. A failed registration means no offline support at all,
      // and it is otherwise completely silent.
      console.error('Service worker registration failed:', error)
    },
  })

  /**
   * A lazily-loaded screen failed to download — offer the update instead of
   * showing nothing.
   *
   * This became possible the moment the bundle was split. Every screen is now
   * a separate file whose name contains a content hash, so after a deploy the
   * old page asks for a chunk that no longer exists on the server. React would
   * suspend forever and the person would sit on "Loading this screen…" with no
   * idea why.
   *
   * Vite raises `vite:preloadError` for exactly this. Treating it as "a new
   * version is available" is not a guess — a missing chunk means the build
   * changed underneath us, which is precisely what the banner is for.
   */
  window.addEventListener('vite:preloadError', () => {
    console.warn('A lazy chunk failed to load — the build has probably moved.')
    needRefresh = true
    emit()
  })
}
