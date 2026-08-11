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

export function showToast(message: string, tone: ToastTone = 'success'): void {
  const id = crypto.randomUUID()
  toasts = [...toasts, { id, message, tone }]
  emit()
  setTimeout(() => dismissToast(id), LIFETIME_MS)
}
