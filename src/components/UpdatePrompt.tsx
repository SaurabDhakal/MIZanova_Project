import { useSyncExternalStore } from 'react'
import {
  applyUpdate,
  dismissUpdate,
  getNeedRefresh,
  subscribeToSwUpdate,
} from '../lib/swUpdate'

/**
 * Offers a new version rather than forcing one.
 *
 * Registration itself happens in src/lib/swUpdate.ts at app start — this
 * component only shows the result. It used to do both, which meant the worker
 * was never registered for anyone who had not signed in yet.
 *
 * It ASKS rather than reloading by itself: an automatic refresh mid-incident
 * would discard whatever a teacher had typed into the logging modal, which is
 * worse than running yesterday's build for another hour.
 *
 * Not a toast. Toasts disappear, and an update nobody has acted on should stay
 * on screen until they do.
 */
export default function UpdatePrompt() {
  const needRefresh = useSyncExternalStore(
    subscribeToSwUpdate,
    getNeedRefresh,
    () => false,
  )

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="mb-6 rounded-card border border-primary bg-primary-subtle p-4 sm:flex sm:items-center sm:gap-4"
    >
      <div className="min-w-0">
        <p className="font-semibold text-foreground">
          A new version of MiZanova is ready
        </p>
        {/* Accurate about "Later", which previously implied the update would
            apply by itself. It will not: a waiting service worker keeps
            waiting until every tab of the app is closed. */}
        <p className="mt-1 text-sm text-muted-foreground">
          Reloading takes a second — finish anything you are in the middle of
          first, as unsaved text in an open form will be lost. Choosing Later
          keeps this version until you close every MiZanova tab.
        </p>
      </div>
      <div className="mt-3 flex gap-2 sm:mt-0 sm:ml-auto sm:shrink-0">
        <button
          type="button"
          onClick={() => void applyUpdate()}
          className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
        >
          Reload now
        </button>
        <button
          type="button"
          onClick={dismissUpdate}
          className="rounded-btn border border-border bg-card px-4 py-2.5 font-semibold text-foreground"
        >
          Later
        </button>
      </div>
    </div>
  )
}
