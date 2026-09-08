/**
 * Brief confirmations — "your log was saved".
 *
 * Why this exists: a screen that does something and says nothing forces the
 * person to guess. The offline queue made that obvious — the pending banner
 * simply disappeared once the logs uploaded, which reads exactly the same as
 * the software quietly giving up on them.
 *
 * An external store rather than React context, for the same reason the pending
 * queue uses one: any module can call `showToast` without being inside a
 * provider, including plain functions that are not components.
 *
 * These are confirmations, never the only place something important is said.
 * A toast disappears and cannot be recovered, so anything a teacher may need
 * later — a queued log, a rejected suggestion — also lives somewhere permanent.
 */

export type ToastTone = 'success' | 'error'

export type Toast = {
  id: string
  message: string
  tone: ToastTone
  /**
   * One thing the person can do about what just happened.
   *
   * ---------------------------------------------------------------------------
   * FOR WORK THAT COMES IN BATCHES, UNDO BEATS "ARE YOU SURE".
   * ---------------------------------------------------------------------------
   * A specialist works through a review queue twenty items at a time. Putting a
   * confirmation on each decision doubles the clicks on the one task the screen
   * exists for, and a prompt answered twenty times in a row stops being read by
   * about the fourth. It trains the reflex it is meant to interrupt.
   *
   * Acting immediately and offering a way back costs nothing on the common path
   * and is the only thing that helps on the rare one. The note above still
   * holds — a toast disappears, so the thing it undoes must also be recoverable
   * somewhere permanent, which for a review decision it is: the strategy row
   * keeps its status and can be set back.
   */
  action?: { label: string; run: () => void }
}

/** How long a toast stays. Long enough to read a sentence twice. */
const LIFETIME_MS = 5000

let toasts: Toast[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function subscribeToToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The snapshot must keep the SAME array reference until something actually
 * changes — useSyncExternalStore compares by identity, and a fresh array on
 * every render is an infinite loop.
 */
export function getToasts(): Toast[] {
  return toasts
}

export function dismissToast(id: string): void {
  const next = toasts.filter((t) => t.id !== id)
  if (next.length === toasts.length) return
  toasts = next
  emit()
}

export function showToast(
  message: string,
  tone: ToastTone = 'success',
  action?: Toast['action'],
): void {
  const id = crypto.randomUUID()
  toasts = [...toasts, { id, message, tone, action }]
  emit()
  /* An action needs longer than a sentence takes to read — you have to notice
     the mistake first. Twelve seconds is about the time it takes to look back
     at a list and realise the wrong row went. */
  setTimeout(() => dismissToast(id), action ? 12_000 : LIFETIME_MS)
}
