import { useEffect, useRef, type RefObject } from 'react'
import type { Page } from '../lib/api'

/**
 * Moving through a list, and saying how big it really is.
 *
 * THE COUNT IS THE POINT, not the buttons. Before this existed, a list showed
 * the first thousand rows PostgREST was willing to return and looked complete;
 * two screens showed a hard-coded first fifty of an unbounded table. Neither
 * said so. Somebody reading "Record access" saw fifty entries and could
 * reasonably conclude that was all the access there had been.
 *
 * So the sentence comes first and the buttons second: "Showing 51–100 of
 * 13,204" is the fact a person needs. The controls are how they act on it.
 *
 * Renders nothing when everything fits on one page, which is most lists in a
 * single school — a pager under eleven rows is furniture.
 */
export default function Pagination<T>({
  page,
  onChange,
  label,
  anchor,
  busy = false,
}: {
  page: Page<T>
  onChange: (next: number) => void
  /** Plural noun for the thing being listed: "staff", "entries", "schools". */
  label: string
  /** A ref on the heading above the list, so paging returns you to it. */
  anchor?: RefObject<HTMLElement | null>
  /** True while the next page is in flight, so the buttons stop taking clicks. */
  busy?: boolean
}) {
  /**
   * Back to the start of the list, AFTER the new rows are on screen.
   *
   * The first version scrolled inside the click handler, which runs before
   * React has swapped anything in — the browser began scrolling toward an
   * element that was about to be replaced, and the result was that nothing
   * appeared to happen at all.
   *
   * An effect keyed on the page number runs after the DOM is updated, which is
   * the only moment the target is the thing the reader wants to see.
   */
  /*
   * REMEMBER THE PAGE, NOT WHETHER WE HAVE RUN.
   *
   * This was a boolean — "have I run once?" — and StrictMode defeated it. In
   * development React deliberately runs an effect, cleans it up, and runs it
   * again. The first run set the flag and returned; the second saw the flag
   * already set and scrolled. So arriving on any paginated screen smoothly
   * dragged the reader ~900px down, past the heading and the explanation, to a
   * table they had not been introduced to — the exact thing the guard existed
   * to prevent. Measured on Billing: `scrollY` 0 → 940 over 800ms, with the h1
   * ending up 851px above the viewport.
   *
   * Storing the page number instead makes the guard describe the actual
   * condition: scroll when the reader CHANGED page, never when the same page
   * merely rendered again. A second run with an unchanged page number is not a
   * page change, whether it comes from StrictMode, a remount, or a parent
   * re-render — so all three are handled by saying what we mean.
   */
  const lastPage = useRef<number | null>(null)

  useEffect(() => {
    // First sight of this list: arriving on a screen should not yank you past
    // its heading to a table you have not been introduced to.
    if (lastPage.current === null) {
      lastPage.current = page.page
      return
    }
    if (lastPage.current === page.page) return

    lastPage.current = page.page
    anchor?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [page.page, anchor])

  if (page.total <= page.pageSize) return null

  const first = page.page * page.pageSize + 1
  const last = Math.min(first + page.rows.length - 1, page.total)

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <p
        className="text-sm text-muted-foreground"
        // Announced when the page changes, so a screen reader user is told
        // where they now are rather than having to go looking.
        role="status"
      >
        Showing{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {first.toLocaleString('en-AU')}–{last.toLocaleString('en-AU')}
        </span>{' '}
        of{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {page.total.toLocaleString('en-AU')}
        </span>{' '}
        {label}
      </p>

      <div className="ml-auto flex items-center gap-2">
        {busy && (
          <span className="text-sm text-muted-foreground" role="status">
            Loading…
          </span>
        )}
        <button
          type="button"
          disabled={page.page === 0 || busy}
          onClick={() => onChange(page.page - 1)}
          className="rounded-btn border border-border px-3 py-1.5 text-sm font-semibold text-foreground disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!page.hasMore || busy}
          onClick={() => onChange(page.page + 1)}
          className="rounded-btn border border-border px-3 py-1.5 text-sm font-semibold text-foreground disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}
