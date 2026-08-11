import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The observation timer on the behaviour logging screen.
 *
 * ---------------------------------------------------------------------------
 * IT NO LONGER STARTS BY ITSELF, AND THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------
 * It used to begin the instant the modal opened, which meant `duration_seconds`
 * on a child's behaviour record was "how long the form was open". That equals
 * the length of the incident only when somebody logs as it happens. Log it at
 * lunch — which is most logs, because you deal with the child first — and the
 * record claimed the incident lasted as long as the write-up.
 *
 * db/005 says of that column: "started_at is when the teacher pressed start;
 * ended_at when they pressed stop." Nobody ever pressed start. The schema
 * described a control that did not exist, and the number underneath it was
 * measuring something else.
 *
 * So there is now a Start button, and until it is pressed this reports no
 * duration at all. `started()` false means the caller must send `ended_at:
 * null`, which makes the generated `duration_seconds` null — the honest answer
 * to "how long did it last?" when nobody timed it.
 *
 * IT COSTS THE TWENTY-SECOND PATH NOTHING (NFR1). Duration was never required
 * to save a log; behaviour and intensity are. Making the timer opt-in removes a
 * field from the fast path rather than adding one to it.
 *
 * Elapsed time is derived from a start TIMESTAMP rather than by counting
 * interval ticks. Counting ticks drifts — a background tab throttles timers to
 * roughly once a second at best, and a teacher who logs while switching apps
 * would end up with a duration that quietly disagrees with reality. Reading the
 * clock each tick means the display can lag, but the number is always right.
 */
export function useTimer() {
  /** Null until somebody presses Start. */
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const frozenAt = useRef<number | null>(null)

  useEffect(() => {
    if (!running || startedAt === null) return
    const tick = () =>
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [running, startedAt])

  const start = useCallback(() => {
    frozenAt.current = null
    setStartedAt(new Date())
    setElapsed(0)
    setRunning(true)
  }, [])

  const stop = useCallback(() => {
    frozenAt.current = Date.now()
    setRunning(false)
  }, [])

  const resume = useCallback(() => setRunning(true), [])

  /** Back to untimed, not back to zero-and-running. */
  const reset = useCallback(() => {
    frozenAt.current = null
    setStartedAt(null)
    setElapsed(0)
    setRunning(false)
  }, [])

  /** Whether anybody actually timed this observation. */
  const started = startedAt !== null

  /**
   * When the observation finished, or null if it was never timed.
   *
   * Returning `now` for an untimed log would recreate the bug this hook was
   * rewritten to remove: a duration measured from an arbitrary moment.
   */
  const endedAt = useCallback(
    () => (startedAt === null ? null : new Date(frozenAt.current ?? Date.now())),
    [startedAt],
  )

  return { startedAt, started, elapsed, running, start, stop, resume, reset, endedAt }
}

/** 252 seconds → "04:12", matching the design. */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
