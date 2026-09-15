import { useQuery } from '@tanstack/react-query'
import { fetchMySchool, queryKeys } from '../lib/api'

/**
 * The two halves of printing a page: the button that starts it, and the
 * heading that only exists on paper.
 *
 * ---------------------------------------------------------------------------
 * WHY A PRINTED PAGE NEEDS ITS OWN HEADING
 * ---------------------------------------------------------------------------
 * On screen the app chrome answers "whose figures are these?" — the sidebar,
 * the account menu, the school in the switcher. `@media print` hides every one
 * of them, so without this a printed compliance record is a table of names and
 * ticks belonging to no school, produced on no date.
 *
 * That matters more here than anywhere else in the product. These two pages are
 * printed to be taken somewhere: an audit, a board meeting, a folder. A sheet
 * of consent figures with no school name on it is not evidence of anything.
 *
 * ---------------------------------------------------------------------------
 * THE BUTTON SAYS "PRINT OR SAVE AS PDF" AND MEANS BOTH
 * ---------------------------------------------------------------------------
 * Every platform's print dialog offers Save as PDF, so this produces a real PDF
 * with selectable text. It is one step rather than none, and a button promising
 * a download that instead opens a dialog would be a small lie. See the note on
 * @media print in index.css for why there is no PDF library here.
 *
 * The button is a <button>, which that stylesheet hides on paper, so it cannot
 * print itself.
 */

export function PrintHeader({ title }: { title: string }) {
  /*
   * Cached across the app — account/School reads the same key — so this is
   * normally free. It is fetched even though the block is invisible on screen
   * because the browser prints what is already in the document; there is no
   * moment between "print pressed" and "page captured" in which to load a name.
   */
  const school = useQuery({
    queryKey: queryKeys.mySchool,
    queryFn: fetchMySchool,
  })

  return (
    <div className="print-only mb-6 border-b border-border pb-4">
      <p className="text-sm font-semibold tracking-wide uppercase">
        MiZanova &mdash; {title}
      </p>
      {/* The school, not the person who pressed print. A record belongs to the
          organisation; who happened to produce it is not the useful fact. */}
      <h1 className="text-title mt-1 text-foreground">
        {school.data?.name ?? 'Your school'}
      </h1>
      <p className="mt-1 text-sm">
        Printed{' '}
        {new Date().toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>
    </div>
  )
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="pressable inline-flex min-h-11 items-center rounded-btn border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground"
    >
      Print or save as PDF
    </button>
  )
}
