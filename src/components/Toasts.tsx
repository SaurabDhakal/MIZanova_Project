import { useSyncExternalStore } from 'react'
import { dismissToast, getToasts, subscribeToToasts } from '../lib/toast'
import Icon from './Icon'

/**
 * Where confirmations appear. Rendered once, by AppShell.
 *
 * Accessibility notes, since this is the kind of component that quietly fails
 * for the people who most need it:
 *
 *  - `aria-live="polite"` on the CONTAINER, which is always in the document.
 *    A live region added to the page at the same moment as its content is
 *    frequently not announced at all; the region has to exist first and be
 *    filled afterwards.
 *  - `polite`, not `assertive`. A saved log is not an emergency and must not
 *    interrupt someone mid-sentence.
 *  - Each toast is dismissible by pointer, and disappears on its own, so a
 *    keyboard user is never required to chase it. Focus is deliberately not
 *    moved here — stealing focus from a teacher typing the next note would be
 *    worse than the problem this solves.
 *  - The entrance animation is skipped entirely under prefers-reduced-motion.
 */
export default function Toasts() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts)

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border p-4 shadow-lg motion-safe:animate-toast-in ${
            toast.tone === 'error'
              ? 'border-danger bg-danger-subtle'
              : 'border-success bg-success-subtle'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-flex leading-none ${
              toast.tone === 'error'
                ? 'text-danger-foreground'
                : 'text-success-foreground'
            }`}
          >
            {/* Drawn icons. '⚠' and '✓' come from whatever the reader's
                font offers, at whatever baseline it chooses — on the one
                component that appears over every screen in the product. */}
            <Icon
              name={toast.tone === 'error' ? 'flag' : 'tick'}
              className="h-4 w-4"
            />
          </span>
          <p
            className={`min-w-0 flex-1 text-sm font-medium ${
              toast.tone === 'error'
                ? 'text-danger-foreground'
                : 'text-success-foreground'
            }`}
          >
            {toast.message}
          </p>
          {/* The action sits before Dismiss, because it is the thing somebody
              is reaching for when they read the toast at all. It dismisses on
              its own — leaving it up after it has been pressed invites a
              second press on something that has already happened. */}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.run()
                dismissToast(toast.id)
              }}
              className={`min-h-11 shrink-0 rounded-btn border px-3 py-1 text-sm font-semibold ${
                toast.tone === 'error'
                  ? 'border-danger text-danger-foreground'
                  : 'border-success text-success-foreground'
              }`}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            className={`min-h-11 shrink-0 rounded-btn px-2 py-1 text-sm font-semibold ${
              toast.tone === 'error'
                ? 'text-danger-foreground'
                : 'text-success-foreground'
            }`}
          >
            <Icon name="cross" aria-hidden className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
