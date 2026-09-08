import { useEffect, useRef } from 'react'

/**
 * A native <dialog> opened as a modal, whose Escape key the component notices.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS ACTUALLY WRONG
 * ---------------------------------------------------------------------------
 * All three dialogs in this product did the same thing: `showModal()` in a
 * mount-only effect. Two of them carry a comment saying the native element
 * gives "focus trapping, Escape to close, and inert background content for
 * free".
 *
 * Two thirds of that is true. Focus is trapped, the background is inert, and
 * focus returns to the trigger on close — all verified. But Escape closes the
 * ELEMENT without telling React, so the component stays mounted believing it
 * is open, and the effect that calls `showModal()` only ever ran on mount.
 *
 * The result is worse than Escape not working. The dialog vanishes, the state
 * that opened it stays true, and pressing the trigger again does nothing at
 * all — a keyboard user who dismisses the dialog loses that control until they
 * reload the page. Somebody using a mouse never sees it, because they close
 * with the Cancel button, which does set the state.
 *
 * ---------------------------------------------------------------------------
 * WHY A LISTENER AND NOT `onClose`
 * ---------------------------------------------------------------------------
 * `<dialog onClose={...}>` looks like it should be enough. The `close` event
 * does not bubble, so whether it reaches a React handler depends on how React
 * attaches non-delegated events — and it did not fire here, which is precisely
 * the kind of detail nobody should have to remember at each call site. An
 * explicit listener on the element is unambiguous.
 *
 * Pass the same function you would pass to a Cancel button; it runs for both.
 */
export function useModalDialog(onDismiss: () => void) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    /*
     * GUARDED, because `onDismiss` is a new closure on most renders and this
     * effect depends on it. Calling showModal() on an already-open dialog
     * throws InvalidStateError, so the guard is what lets the dependency be
     * honest rather than holding the handler in a ref and mutating it during
     * render — which is what `react-hooks/refs` rightly refuses.
     */
    if (!dialog.open) dialog.showModal()

    const handleClose = () => onDismiss()
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onDismiss])

  return ref
}
