import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { titleFor } from '../lib/pageTitles'

/**
 * Everything that has to happen when the URL changes: the title, focus, and
 * the scroll position.
 *
 * Done in ONE place rather than a hook called from forty components. A title
 * that only exists where somebody remembered to add it is a title that will be
 * missing from the next screen — and the same is true of the other two. They
 * also have to agree with each other, which is the real reason they are not
 * three separate components: see the note on `preventScroll` below.
 *
 * ---------------------------------------------------------------------------
 * THE TITLE — WCAG 2.4.2, Level A
 * ---------------------------------------------------------------------------
 * A single-page app changes the URL without reloading, so the title written in
 * index.html sticks forever: every screen in MiZanova announced itself as
 * "MiZanova". That is the first thing a screen reader says on arrival, the
 * label on a browser tab, and the text in the history menu. With eight tabs
 * open, all of them saying the same word, none of that helps anyone.
 */

export default function DocumentTitle() {
  const { pathname } = useLocation()
  /*
   * PUSH, REPLACE or POP. Back and forward are POP, and they are the one case
   * where jumping to the top is wrong: somebody pressing Back is returning to
   * a page they were already reading, and moving them to the top of it throws
   * away the position they came back for.
   */
  const navigationType = useNavigationType()
  const firstRender = useRef(true)

  useEffect(() => {
    // Writing to the document IS the point — this is React talking to an
    // external system, which is what an effect is for.
    document.title = `${titleFor(pathname)} · MiZanova`

    /*
     * MOVING FOCUS ON A ROUTE CHANGE — WCAG 2.4.3, and the gap part one left.
     *
     * In a single-page app the URL changes and the DOM is replaced, but focus
     * stays exactly where it was: on a sidebar link that no longer describes
     * where you are. Two things follow, and both are worse for a keyboard user
     * than for anybody else:
     *
     *   - The next Tab carries on from the old link, so reaching the new
     *     content means tabbing back through the whole sidebar every time.
     *   - Nothing is announced. The title changes, and a title change alone
     *     is not reliably read by screen readers.
     *
     * Focus moves to <main>, which carries an aria-label naming the page (see
     * AppShell and PublicLayout), so landing there says where you are. That is
     * one announcement rather than a live region competing with it.
     *
     * NOT ON FIRST RENDER. Somebody who has just loaded a URL is already at
     * the top of it, and stealing focus would only interrupt a screen reader
     * that had started reading the page.
     */
    if (firstRender.current) {
      firstRender.current = false
      return
    }

    /*
     * BACK TO THE TOP OF THE NEW PAGE.
     *
     * React Router does not do this, and nothing else did either: the client
     * pressed a button half way down a long roster and arrived half way down
     * the next screen, past its own heading. Every screen in the product
     * behaved this way.
     *
     * IT IS NOT ENOUGH TO MOVE FOCUS, which is what the code below already
     * did and why this went unnoticed for so long. Focusing an element scrolls
     * it into view only when it is NOT already visible, and <main> is the whole
     * content area — taller than the viewport, so some part of it is always on
     * screen. The browser concluded there was nothing to do, every time.
     *
     * `window` is the right thing to scroll: both shells lay out with
     * `min-h-screen` and neither <main> carries `overflow-y-auto`, so the
     * document scrolls rather than a panel inside it. The sidebar scrolls
     * separately and is deliberately left where it was — it does not change
     * between pages, and resetting it would lose the reader's place in a long
     * navigation list.
     *
     * Instant, not smooth: this is not a movement anybody asked to watch, and
     * animating it would mean the heading arrives after the person has already
     * started reading.
     */
    if (navigationType !== 'POP') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }

    const main =
      document.getElementById('main-content') ?? document.getElementById('main')
    /*
     * `preventScroll` so focus cannot argue with the line above. Without it the
     * two are racing to decide the scroll position — harmless while <main> sits
     * at the top of the document, and exactly the kind of thing that starts
     * failing the day a banner appears above it.
     */
    main?.focus({ preventScroll: true })
  }, [pathname, navigationType])

  return null
}
