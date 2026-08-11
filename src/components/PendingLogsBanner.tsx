import { usePendingLogs } from '../hooks/usePendingLogs'
import { discardFromQueue } from '../lib/offlineQueue'

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Behaviour logs still sitting on this device.
 *
 * Shown on every screen, not just the one where the log was written, because a
 * teacher who queued something during period 3 and closed the tab has no other
 * way of knowing it never arrived. Silence would read as success.
 *
 * Renders nothing when the queue is empty, which is almost always.
 */
export default function PendingLogsBanner() {
  const { waiting, failed, isSyncing, sync } = usePendingLogs()

  if (waiting.length === 0 && failed.length === 0) return null

  return (
    <div className="mb-6 space-y-3">
      {waiting.length > 0 && (
        <div
          role="status"
          className="rounded-card border border-warning bg-warning-subtle p-4"
        >
          <p className="font-semibold text-warning-foreground">
            {waiting.length} behaviour log{waiting.length === 1 ? '' : 's'} saved
            on this device, not yet sent
          </p>
          <ul className="mt-2 space-y-1">
            {waiting.map((log) => (
              <li key={log.clientRef} className="text-sm text-warning-foreground">
                {log.studentName} · {log.behaviourType} · {log.intensity} ·
                written {when(log.queuedAt)}
              </li>
            ))}
          </ul>
          <p className="mt-2 max-w-prose text-sm text-warning-foreground">
            These upload by themselves once you are back online. They are not in
            the school&rsquo;s records until they do, and clearing your browser
            data would lose them.
          </p>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={isSyncing}
            className="mt-3 rounded-btn bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {isSyncing ? 'Sending…' : 'Try sending now'}
          </button>
        </div>
      )}

      {/* Refused by the server, so retrying is pointless. Kept anyway: the
          teacher's own words are shown back to them so the observation can be
          rewritten or reported, rather than vanishing. */}
      {failed.length > 0 && (
        <div
          role="alert"
          className="rounded-card border border-danger bg-danger-subtle p-4"
        >
          <p className="font-semibold text-danger-foreground">
            {failed.length} log{failed.length === 1 ? '' : 's'} could not be
            saved
          </p>
          <ul className="mt-2 space-y-3">
            {failed.map((log) => (
              <li key={log.clientRef} className="text-sm text-danger-foreground">
                <p className="font-medium">
                  {log.studentName} · {log.behaviourType} · {log.intensity} ·
                  written {when(log.queuedAt)}
                </p>
                <p>The server said: {log.failedReason}</p>
                {log.notes && <p className="mt-1 italic">“{log.notes}”</p>}
                <button
                  type="button"
                  onClick={() => discardFromQueue(log.clientRef)}
                  className="mt-1 rounded-btn border border-danger px-3 py-1.5 text-sm font-semibold text-danger-foreground"
                >
                  Discard this log
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 max-w-prose text-sm text-danger-foreground">
            Usually this means your account no longer has access to that
            student. Copy anything you need before discarding.
          </p>
        </div>
      )}
    </div>
  )
}
