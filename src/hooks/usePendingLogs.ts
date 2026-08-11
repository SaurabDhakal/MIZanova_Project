import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  flushQueue,
  readQueue,
  subscribeToQueue,
  type QueuedLog,
} from '../lib/offlineQueue'
import { queryKeys } from '../lib/api'
import { showToast } from '../lib/toast'

/**
 * The behaviour logs waiting on this device, and the machinery that sends them.
 *
 * `useSyncExternalStore` rather than a `useEffect` that copies into state:
 * localStorage is the source of truth and React subscribes to it. That also
 * means a second tab writing to the queue updates this one, instead of two
 * tabs disagreeing about how many logs are unsent.
 *
 * A cached snapshot is required because `readQueue()` parses JSON and so
 * returns a new array every call — returning a fresh object from
 * `getSnapshot` on every render is an infinite loop.
 */
let snapshot: QueuedLog[] = readQueue()

function getSnapshot(): QueuedLog[] {
  return snapshot
}

function subscribe(onChange: () => void): () => void {
  return subscribeToQueue(() => {
    snapshot = readQueue()
    onChange()
  })
}

export function usePendingLogs(): {
  pending: QueuedLog[]
  /** Waiting to be sent — excludes the ones the server has already refused. */
  waiting: QueuedLog[]
  failed: QueuedLog[]
  isSyncing: boolean
  sync: () => Promise<void>
} {
  const queryClient = useQueryClient()
  const pending = useSyncExternalStore(subscribe, getSnapshot)
  const [isSyncing, setIsSyncing] = useState(false)

  const sync = useCallback(async () => {
    if (readQueue().length === 0) return
    setIsSyncing(true)
    try {
      const result = await flushQueue()
      if (result.sent > 0) {
        // The dashboard tiles and lists are now wrong by exactly the number of
        // logs that just arrived. Not awaited: if the connection drops again
        // mid-refetch, awaiting would strand `isSyncing` on true forever. The
        // same trap that stuck the Save button on "Saving…".
        void queryClient.invalidateQueries({ queryKey: queryKeys.classroomStats })
        void queryClient.invalidateQueries({ queryKey: queryKeys.recentLogs })
        void queryClient.invalidateQueries({ queryKey: ['student-logs'] })

        // Without this the pending banner simply vanishes, which reads exactly
        // the same as the software having given up on those logs.
        showToast(
          result.sent === 1
            ? 'Your saved log has been uploaded.'
            : `${result.sent} saved logs have been uploaded.`,
        )
      }
    } finally {
      setIsSyncing(false)
    }
  }, [queryClient])

  // Send on reconnect, and once on mount in case the browser was closed while
  // offline and reopened somewhere with a signal — `online` never fires then.
  //
  // The mount send is deferred to a microtask rather than called in the effect
  // body. Calling it directly sets `isSyncing` synchronously during the effect,
  // which is the cascading-render pattern react-hooks/set-state-in-effect
  // exists to catch. Deferring it makes it what it actually is: work kicked
  // off after render, not state being copied around.
  useEffect(() => {
    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    queueMicrotask(() => void sync())
    return () => window.removeEventListener('online', onOnline)
  }, [sync])

  return {
    pending,
    waiting: pending.filter((p) => !p.failedReason),
    failed: pending.filter((p) => p.failedReason),
    isSyncing,
    sync,
  }
}
