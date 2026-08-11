import {
  createBehaviourLog,
  type BehaviourIntensity,
  type BehaviourType,
} from './api'

/**
 * Behaviour logs written while the network was unavailable — NFR2.
 *
 * The promise the product makes is that a teacher can record an incident in
 * twenty seconds without looking away from the class. School wifi does not
 * cooperate with that. Before this file, a dropped connection produced a red
 * error and the observation was lost the moment the modal closed: the teacher
 * had done the work and the software threw it away.
 *
 * The database has been ready for this since db/005. `client_ref` is generated
 * in the browser before the first attempt and carries a unique constraint, so
 * re-sending the same queued log can never create a second row — and
 * `createBehaviourLog` already treats that collision as success.
 *
 * WHY localStorage AND NOT IndexedDB. A behaviour log is well under a
 * kilobyte, and a queue that survives a reload and a closed laptop is all this
 * needs. localStorage is synchronous and about 5 MB, which is thousands of
 * logs. IndexedDB would be the right answer if we ever queue photos or audio —
 * at that point this module changes and nothing else has to.
 *
 * WHAT IS DELIBERATELY NOT QUEUED: anything the server actually answered. A
 * permission refusal, an expired session or a validation error will fail
 * identically forever, so queueing it would hide a real problem behind a
 * "saved" message. Only a request that never reached the server is kept.
 */

const KEY = 'mizanova.pending-logs.v1'

export type QueuedLog = {
  clientRef: string
  studentId: string
  /** Kept so the queue can be described without another database read. */
  studentName: string
  loggedBy: string
  behaviourType: BehaviourType
  intensity: BehaviourIntensity
  notes: string
  notesSource: 'typed' | 'voice'
  /** ISO strings: a Date does not survive JSON. */
  startedAt: string
  /** Null when the observation was never timed. */
  endedAt: string | null
  riskFlagged: boolean
  riskNote: string
  queuedAt: string
  /**
   * Set when the server considered this log and refused it — which will not
   * change by trying again. It stays in the queue so the teacher can read
   * their own words back and decide what to do; it is never silently dropped,
   * because losing an observation is the exact failure this file exists to
   * prevent.
   */
  failedReason?: string
}

/** Fires whenever the queue changes, so the UI can show an honest count. */
const CHANGED = 'mizanova:queue-changed'

function emitChange(): void {
  window.dispatchEvent(new Event(CHANGED))
}

export function subscribeToQueue(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener)
  // `storage` fires when ANOTHER tab writes. A teacher with two tabs open
  // should not see two different pending counts.
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(CHANGED, listener)
    window.removeEventListener('storage', listener)
  }
}

export function readQueue(): QueuedLog[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueuedLog[]) : []
  } catch {
    // Corrupt or unavailable storage (private browsing can throw). An empty
    // queue is the safe reading — it never invents a log that was not written.
    return []
  }
}

function writeQueue(logs: QueuedLog[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(logs))
    emitChange()
  } catch {
    // Storage full or blocked. Nothing useful to do here, and throwing would
    // turn "your log is queued" into a second failure on top of the first.
  }
}

export function enqueue(log: QueuedLog): void {
  const queue = readQueue()
  // Same observation, retried. Replace rather than add.
  const without = queue.filter((q) => q.clientRef !== log.clientRef)
  writeQueue([...without, log])
}

export function removeFromQueue(clientRef: string): void {
  writeQueue(readQueue().filter((q) => q.clientRef !== clientRef))
}

/**
 * Did this failure mean "the request never arrived", as opposed to "the server
 * considered it and said no"?
 *
 * `navigator.onLine === false` is trustworthy in one direction only: false
 * really does mean there is no network. True can mean "connected to a wifi
 * access point that goes nowhere", which is exactly what a school hallway
 * produces — so the message patterns below carry most of the weight.
 */
export function isOfflineFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out/i.test(
    message,
  )
}

/**
 * How long to wait for the server before treating the attempt as offline.
 *
 * A dropped connection does NOT reliably produce a fast "Failed to fetch".
 * supabase-js refreshes the auth token before a write and retries that refresh
 * with backoff, so an offline save can sit there for a long time — long enough
 * that the first version of this file left the teacher watching "Saving…"
 * forever, which is worse than the error it replaced.
 *
 * Six seconds, because the product promises a log in twenty. A slow but
 * working connection may be cut off early and queued unnecessarily; that is
 * harmless, and the next paragraph is why.
 */
const SAVE_TIMEOUT_MS = 6000

class TimeoutError extends Error {
  constructor() {
    super('The request timed out.')
    this.name = 'TimeoutError'
  }
}

/**
 * Run the insert, but stop waiting after SAVE_TIMEOUT_MS.
 *
 * Abandoning a request we cannot cancel is only safe because of `client_ref`.
 * If the insert we walked away from does land, the queued copy carries the
 * same client_ref, the unique constraint in db/005 rejects it, and
 * `createBehaviourLog` treats that collision as success. Worst case is one
 * redundant request — never a duplicate observation in a child's record.
 */
async function attemptSave(log: QueuedLog): Promise<void> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), SAVE_TIMEOUT_MS)
  })

  try {
    await Promise.race([
      createBehaviourLog({
        studentId: log.studentId,
        loggedBy: log.loggedBy,
        behaviourType: log.behaviourType,
        intensity: log.intensity,
        notes: log.notes,
        notesSource: log.notesSource,
        startedAt: new Date(log.startedAt),
        endedAt: log.endedAt === null ? null : new Date(log.endedAt),
        clientRef: log.clientRef,
        riskFlagged: log.riskFlagged,
        riskNote: log.riskNote,
      }),
      timeout,
    ])
  } finally {
    clearTimeout(timer!)
  }
}

/**
 * Try to save one behaviour log, keeping it on the device if the network is
 * unavailable.
 *
 * Returns how it ended so the modal can tell the truth — "Saved" and "Saved on
 * this device, it will upload later" are different promises and a teacher
 * deciding whether to write it on paper needs to know which one they got.
 */
export async function saveBehaviourLog(
  log: QueuedLog,
): Promise<'saved' | 'queued'> {
  // The browser is certain there is no network. Do not spend six seconds
  // proving it — queue immediately and let the teacher get back to the class.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueue(log)
    return 'queued'
  }

  try {
    await attemptSave(log)
    removeFromQueue(log.clientRef)
    return 'saved'
  } catch (error) {
    if (isOfflineFailure(error)) {
      enqueue(log)
      return 'queued'
    }
    // A real refusal. Let it reach the teacher.
    throw error
  }
}

/** Give up on a log the server refuses. Only ever called by a person. */
export function discardFromQueue(clientRef: string): void {
  removeFromQueue(clientRef)
}

function markFailed(clientRef: string, reason: string): void {
  writeQueue(
    readQueue().map((q) =>
      q.clientRef === clientRef ? { ...q, failedReason: reason } : q,
    ),
  )
}

export type FlushResult = { sent: number; remaining: number }

/**
 * Send everything waiting. Safe to call at any time, including when already
 * online and empty.
 *
 * Stops at the first offline failure rather than grinding through the whole
 * queue: if one request could not reach the server, the next will not either,
 * and each attempt costs a teacher's battery.
 */
export async function flushQueue(): Promise<FlushResult> {
  let sent = 0

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, remaining: readQueue().length }
  }

  for (const log of readQueue()) {
    // Already refused once by the server. Retrying changes nothing, and it
    // must not block the logs behind it.
    if (log.failedReason) continue

    try {
      await attemptSave(log)
      removeFromQueue(log.clientRef)
      sent++
    } catch (error) {
      if (isOfflineFailure(error)) break
      // The server refused this one and always will — written before the
      // teacher lost access to that student, for example. Keep it, flag it,
      // and let the banner show the teacher their own words plus the reason.
      markFailed(
        log.clientRef,
        error instanceof Error ? error.message : 'The server refused this log.',
      )
    }
  }

  return { sent, remaining: readQueue().length }
}
