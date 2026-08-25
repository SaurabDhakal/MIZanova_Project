import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchAllAuditTimeline,
  fetchAuditTimeline,
  fetchSchools,
  queryKeys,
  type AuditFilters,
} from '../../lib/api'
import { AUDIT_ACTION_CODES, auditAction } from '../../lib/auditActions'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import PageHeader, { PageNote } from '../../components/PageHeader'
import Pagination from '../../components/Pagination'
import { showToast } from '../../lib/toast'

/**
 * Who did what, when, and why — across both tables that record it.
 *
 * ---------------------------------------------------------------------------
 * A TABLE, BECAUSE THIS IS THE SCREEN PEOPLE SCAN RATHER THAN READ
 * ---------------------------------------------------------------------------
 * It was a stack of cards, one per entry, with the time and the actor pushed to
 * the right of a pill. That reads well for three rows and badly for two
 * hundred: nothing lines up, so answering "who reset two-factor last month" or
 * "did anybody touch this before the complaint" means reading every card
 * instead of running an eye down a column.
 *
 * An audit trail is consulted with a question already in mind. Columns are what
 * make that quick.
 *
 * ---------------------------------------------------------------------------
 * THE SCREEN USED TO BE THE WINDOW — db/068
 * ---------------------------------------------------------------------------
 * This page read the newest 200 administrative events and the newest 50 AI
 * events, merged them here, and then filtered, counted and exported that array.
 * So the fetch limit WAS the data. By the time it was noticed there were 520
 * events in the trail and the screen could see 200 of them.
 *
 * That is not "a bit of the list is missing". Three things followed, and the
 * last is the one that matters:
 *
 *   - Filtering by action searched only what had been downloaded.
 *   - The Where dropdown was assembled from the schools present in those rows,
 *     so a school whose last event fell outside the window was not offered at
 *     all — the screen stopped admitting it existed rather than saying "none".
 *   - The export took what was on screen, and truncated in silence. That is the
 *     file somebody attaches to an email about an incident.
 *
 * Every filter now runs in the database against the whole trail, the count is
 * exact, and the export is capped with the cap REPORTED. An audit log that
 * answers "nothing happened" to a question it never asked is worse than no
 * audit log, because it still looks like an answer.
 *
 * ---------------------------------------------------------------------------
 * SECONDS, NOT "2 HOURS AGO"
 * ---------------------------------------------------------------------------
 * Everywhere else in this product a friendly relative time is right. Here it is
 * not. The questions this screen answers are ordering questions — did the reset
 * come before or after the sign-in that worried somebody — and "2 hours ago"
 * cannot answer them. The full timestamp to the second is the point of the
 * record.
 */

/** Bounded questions by default. "Everything, ever" is a scroll, not an answer. */
const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'Everything recorded' },
] as const

/** Full precision, because ordering is what this screen is asked about. */
function stamp(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export default function AuditLog() {
  const [page, setPage] = useState(0)
  const [action, setAction] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['value']>('30')
  const [term, setTerm] = useState('')
  const [search, setSearch] = useState('')
  const listTop = useRef<HTMLParagraphElement>(null)

  /*
   * 200ms, the same as the global search and for the same reason: every
   * keystroke is now an `ilike` against the whole trail rather than a filter
   * over an array already in memory, so typing "Mitchell" unthrottled is eight
   * scans to answer one question.
   */
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(term)
      setPage(0)
    }, 200)
    return () => clearTimeout(t)
  }, [term])

  /*
   * BUILT WHEN IT IS USED, NOT WHILE RENDERING. `Date.now()` during render is
   * impure — the lint rule catches it — and it is also wrong: a "last 30 days"
   * window computed at render time is frozen at whatever second the component
   * mounted, so a screen left open overnight quietly asks yesterday's question.
   */
  const buildFilters = (): AuditFilters => ({
    action: action || undefined,
    schoolId: schoolId || undefined,
    search: search.trim() || undefined,
    since:
      period === 'all'
        ? undefined
        : new Date(Date.now() - Number(period) * 86_400_000).toISOString(),
  })

  const events = useQuery({
    // The page AND the filters belong in the key. Without the page, React Query
    // serves page 0 for ever and Next appears to do nothing; without the
    // filters, changing one shows the previous answer to a different question.
    queryKey: [
      ...queryKeys.auditTimeline,
      page,
      action,
      schoolId,
      period,
      search.trim(),
    ],
    queryFn: () => fetchAuditTimeline(page, buildFilters()),
    placeholderData: keepPreviousData,
  })

  /*
   * EVERY school, not the ones that happen to appear on this page. This is the
   * whole difference: the old dropdown was derived from the fetched rows, which
   * meant a school with no recent activity could not be asked about — and "has
   * anything happened at this school" is exactly the question somebody opens
   * this screen with.
   */
  const schools = useQuery({ queryKey: queryKeys.schools, queryFn: fetchSchools })

  async function exportCsv() {
    try {
      const all = await fetchAllAuditTimeline(buildFilters())
      const esc = (v: string) => `"${String(v).replaceAll('"', '""')}"`
      const csv = [
        ['When', 'Action', 'Who', 'Subject', 'Where', 'Detail', 'Source'].join(','),
        ...all.rows.map((e) =>
          [
            stamp(e.occurred_at),
            auditAction(e.action).label,
            e.actor_name ?? 'Unknown',
            e.subject_label ?? '',
            e.school_name ?? 'Special Miles',
            e.detail ?? '',
            e.source === 'admin' ? 'Administration' : 'AI controls',
          ]
            .map(esc)
            .join(','),
        ),
      ].join('\n')

      const url = URL.createObjectURL(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      )
      const a = document.createElement('a')
      a.href = url
      a.download = `mizanova-audit-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)

      // The cap is said out loud. A truncated export that admits it can be
      // worked with; one that does not is the fault this whole file fixes.
      showToast(
        all.truncated
          ? `Exported the most recent ${all.rows.length} of ${all.total} entries. This file is not the whole record.`
          : `Exported all ${all.rows.length} entries.`,
        all.truncated ? 'error' : undefined,
      )
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not export.',
        'error',
      )
    }
  }

  const filtered =
    Boolean(action) || Boolean(schoolId) || period !== 'all' || Boolean(search.trim())

  if (events.isPending) return <LoadingCards count={3} />
  if (events.isError) return <ErrorState message={events.error.message} />

  const { rows, total } = events.data

  return (
    <div>
      <PageHeader
        title="Audit log"
        lead="Every governance decision, who made it, and why."
        actions={
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={total === 0}
            className="rounded-btn border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
          >
            Export {filtered ? 'these' : 'all'} as CSV
          </button>
        }
      />

      <p className="mb-5 rounded-card border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
        <strong className="font-semibold text-foreground">
          These entries cannot be edited or deleted.
        </strong>{' '}
        Both underlying tables allow reading only, and rows are written by
        database functions rather than by this application — so nobody,
        including you, can alter their own record afterwards.
      </p>

      {/* --- Filters -------------------------------------------------------
          OUTSIDE the empty-state branch, always. Filtering down to nothing and
          then losing the controls that did it leaves no way back except a
          reload. */}
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label
            htmlFor="audit-action"
            className="block text-sm font-medium text-muted-foreground"
          >
            Action
          </label>
          <select
            id="audit-action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(0)
            }}
            className="mt-1 rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          >
            <option value="">Every action</option>
            {AUDIT_ACTION_CODES.map((code) => (
              <option key={code} value={code}>
                {auditAction(code).label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="audit-school"
            className="block text-sm font-medium text-muted-foreground"
          >
            Where
          </label>
          <select
            id="audit-school"
            value={schoolId}
            onChange={(e) => {
              setSchoolId(e.target.value)
              setPage(0)
            }}
            className="mt-1 rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          >
            <option value="">Everywhere</option>
            {/* An act belonging to no school is a real answer rather than a
                gap, so it is a choice rather than an absence. */}
            <option value="none">Special Miles only</option>
            {(schools.data ?? []).map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="audit-period"
            className="block text-sm font-medium text-muted-foreground"
          >
            When
          </label>
          <select
            id="audit-period"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as (typeof PERIODS)[number]['value'])
              setPage(0)
            }}
            className="mt-1 rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-56 flex-1">
          <label
            htmlFor="audit-search"
            className="block text-sm font-medium text-muted-foreground"
          >
            Search
          </label>
          <input
            id="audit-search"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="A name, or a phrase from the reason"
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Announced, because filtering with a keyboard otherwise changes the
          table silently. Anchors the pagination scroll too. */}
      <p
        ref={listTop}
        role="status"
        className="mb-3 text-sm text-muted-foreground"
      >
        {total === 1 ? '1 entry' : `${total.toLocaleString()} entries`}
        {filtered ? ' match these filters' : ' recorded'}
      </p>

      {total === 0 ? (
        <EmptyState
          title={filtered ? 'No entry matches that' : 'Nothing recorded yet'}
          detail={
            filtered
              ? 'Try a wider period, a different action, or clear the search. Nothing matching is a real answer here — it means it did not happen.'
              : 'Verifying a staff member or changing the AI controls will appear here.'
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
            {/*
              A MINIMUM WIDTH, AND THE WRAPPER SCROLLS — the pattern Record
              Access already uses. Percentages alone cannot save seven columns
              in a 650px pane: they only decide who gets starved. Measured at
              that width, four columns were clipping their own contents.

              Below the minimum the table scrolls sideways inside its card
              rather than crushing every column, which is the honest trade for a
              dense record. The page itself never scrolls horizontally.
            */}
            <table className="w-full min-w-[72rem] table-fixed text-left text-sm">
              {/*
                EXPLICIT WIDTHS, BECAUSE THE BROWSER WAS GUESSING BADLY.

                With `table-auto` the columns were sized by their content and
                the result was upside down: "Where" carried whitespace-nowrap so
                it demanded 254px — the widest column on the table for a school
                name — while "To whom", which holds the longest text on the row
                ("Ava W. — Join group work for a full session"), was squeezed
                into 90px and wrapped every row to 165px tall.

                The share each column gets should follow how much it has to say,
                not which one refused to wrap.
              */}
              <colgroup>
                {/* When: the widest fixed-length value on the row. The
                    timestamp carries seconds and must not wrap, so it needs
                    room for "26 Aug 2026, 00:55:30" plus its padding —
                    measured, not guessed. */}
                <col className="w-[17%]" />
                <col className="w-[12%]" />
                <col className="w-[11%]" />
                <col className="w-[17%]" />
                <col className="w-[13%]" />
                <col className="w-[22%]" />
                {/* Source held two values and got 5% in the first pass, which
                    wrapped "Administration" down three lines. */}
                <col className="w-[8%]" />
              </colgroup>
              <thead className="border-b border-border bg-background/60">
                <tr className="text-xs tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    When
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Action
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Who did it
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    To whom
                  </th>
                  {/* db/065 gave the trail a school. Without a column for it,
                      "a behaviour log was edited" does not say whose. */}
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Where
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Why / what changed
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const style = auditAction(e.action)
                  return (
                    <tr
                      key={`${e.source}-${e.id}`}
                      className="border-b border-border last:border-0"
                    >
                      {/* tabular-nums so the timestamps form a column the eye
                          can run down rather than a ragged edge. */}
                      <td className="px-4 py-3 align-top tabular-nums whitespace-nowrap text-muted-foreground">
                        {stamp(e.occurred_at)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-block rounded-btn px-2 py-1 text-xs leading-tight font-semibold ${style.className}`}
                        >
                          {style.label}
                        </span>
                      </td>
                      {/* "Unknown" rather than blank. A row whose actor was
                          deleted still happened, and db/015 sets actor_id to
                          null on delete precisely so the entry survives. */}
                      <td className="px-4 py-3 align-top break-words font-medium text-foreground">
                        {e.actor_name || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 align-top break-words text-foreground">
                        {e.subject_label ?? '—'}
                      </td>
                      {/* "Special Miles" rather than an em-dash: an act that
                          belongs to no school is a real answer, not a gap. */}
                      <td className="px-4 py-3 align-top text-xs leading-snug text-muted-foreground">
                        {e.school_name ?? 'Special Miles'}
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {e.detail || '—'}
                      </td>
                      {/* Abbreviated on screen, spelled out in the CSV. This
                          column holds one of two values and says the same thing
                          in almost every row, so widening it to fit
                          "Administration" would take space from the subject and
                          the reason — the two columns somebody is actually
                          reading. The export has no width limit. */}
                      <td className="px-4 py-3 align-top whitespace-nowrap text-xs text-muted-foreground">
                        {e.source === 'admin' ? 'Admin' : 'AI'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={events.data}
            onChange={setPage}
            label="entries"
            anchor={listTop}
            busy={events.isPlaceholderData}
          />
        </>
      )}

      <PageNote>
        Recorded here: staff verification and its withdrawal, two-factor resets,
        staff moving school, every change to the AI controls, and — since
        db/064 — schools being created or having their status changed, invoices
        voided, specialist applications decided and enquiries triaged. db/065
        added corrections to a child&rsquo;s record, and db/066 a school
        correcting its own details. Each is written by a database trigger rather
        than by this application, so no screen can forget to record one. Who
        opened a child&rsquo;s record is a separate trail on Record Access: that
        is generated by ordinary work rather than by an administrative decision,
        and would otherwise bury everything here.
      </PageNote>
    </div>
  )
}
