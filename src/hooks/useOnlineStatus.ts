import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

function getSnapshot(): boolean {
  return navigator.onLine
}

/**
 * Whether the browser currently believes it has a network.
 *
 * Trustworthy in one direction only. `false` genuinely means there is no
 * connection; `true` can mean "attached to an access point that goes nowhere",
 * which is what a school corridor produces. Use it to EXPLAIN a failure, never
 * to decide whether to attempt one — that decision belongs to the code that
 * makes the request, which finds out for certain.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
