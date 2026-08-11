import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { titleFor } from '../lib/pageTitles'

/**
 * Keeps <title> in step with the current screen — WCAG 2.4.2, Level A.
 *
 * A single-page app changes the URL without reloading, so the title written in
 * index.html sticks forever: every screen in MiZanova announced itself as
 * "MiZanova". That is the first thing a screen reader says on arrival, the
 * label on a browser tab, and the text in the history menu. With eight tabs
 * open, all of them saying the same word, none of that helps anyone.
 *
 * Done in ONE place rather than a hook called from forty components. A title
 * that only exists where somebody remembered to add it is a title that will be
 * missing from the next screen.
 */

export default function DocumentTitle() {
  const { pathname } = useLocation()
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

    const main =
      document.getElementById('main-content') ?? document.getElementById('main')
    main?.focus()
  }, [pathname])

  return null
}
