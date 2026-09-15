import { useEffect } from 'react'

/**
 * Take the reader to the top when a screen replaces itself in place.
 *
 * ---------------------------------------------------------------------------
 * WHY `DocumentTitle` DOES NOT ALREADY COVER THIS
 * ---------------------------------------------------------------------------
 * `components/DocumentTitle` scrolls to the top and moves focus into `<main>`
 * on every navigation, and its comment explains why that was needed: "the
 * client pressed a button half way down a long roster and arrived half way down
 * the next screen, past its own heading."
 *
 * It is keyed on `pathname`. Submitting a form is not a navigation — the URL
 * does not change, React simply returns a different tree — so nothing fires.
 *
 * The result is the same fault in a worse place. The enquiry form and the
 * specialist application are both long enough that their submit button sits
 * well below the fold. Press it, and the page swaps to a short "Thank you — we
 * have it" card at the top while the viewport stays where it was: the reader is
 * left looking at the footer, or at blank space where the form used to be, with
 * no sign that anything happened. On a phone it reads as a form that did
 * nothing, which is the one impression a first contact with the product must
 * not give.
 *
 * ---------------------------------------------------------------------------
 * IT SCROLLS **AND** MOVES FOCUS, FOR THE REASON DocumentTitle GIVES
 * ---------------------------------------------------------------------------
 * Focusing an element scrolls it into view only when it is not already visible,
 * and `<main>` is the whole content area — taller than the viewport, so some
 * part of it is always on screen. Focus alone concludes there is nothing to do.
 * So the window is scrolled first, and focus follows with `preventScroll` so the
 * two cannot argue about the final position.
 *
 * Moving focus is not decoration here: without it a screen-reader user is told
 * nothing at all. The heading of the new panel is what they need, and it is
 * inside `<main>`.
 *
 * Instant, not smooth — nobody asked to watch this, and animating it means the
 * confirmation arrives after the reader has started looking for it.
 */
export function useScrollToTopWhen(when: boolean): void {
  useEffect(() => {
    if (!when) return

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })

    /* `main-content` is the signed-in shell's id, `main` the public one. Both
       are looked up so this works wherever it is used. */
    const main =
      document.getElementById('main-content') ?? document.getElementById('main')
    main?.focus({ preventScroll: true })
  }, [when])
}
