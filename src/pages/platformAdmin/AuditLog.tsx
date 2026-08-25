import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAdminAuditEvents,
  fetchAiControlEvents,
  queryKeys,
} from '../../lib/api'
import { auditAction } from '../../lib/auditActions'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import PageHeader, { PageNote } from '../../components/PageHeader'

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
 * SECONDS, NOT "2 HOURS AGO"
 * ---------------------------------------------------------------------------
 * Everywhere else in this product a friendly relative time is right. Here it is
 * not. The questions this screen answers are ordering questions — did the reset
 * come before or after the sign-in that worried somebody — and "2 hours ago"
 * cannot answer them. The full timestamp to the second is the point of the
 * record.
 */

type Entry = {
  key: string
  when: string
  action: string
  label: string
  className: string
  actor: string
  subject: string | null
  detail: string
  /** Which table it came from. Two sources merge here; saying which is honest. */
  source: 'Administration' | 'AI controls'
  /*
   * db/065. Where it happened. Null for a Special Miles act that belongs to no
   * school, which is most administrative decisions and is a real answer rather
   * than a gap — so it renders as "Special Miles" rather than an em-dash.
   */
  school: string | null
}

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
  const [action, setAction] = useState('all')
  const [search, setSearch] = useState('')
  const [school, setSchool] = useState('all')

  const admin = useQuery({
    queryKey: queryKeys.adminAudit,
    queryFn: fetchAdminAuditEvents,
  })
  const ai = useQuery({
    queryKey: queryKeys.aiControlEvents,
    queryFn: fetchAiControlEvents,
  })

  const entries: Entry[] = useMemo(() => {
    const rows: Entry[] = [
      ...(admin.data ?? []).map((e) => {
        const style = auditAction(e.action)
        return {
          key: e.id,
          when: e.occurred_at,
          action: style.label,
          label: style.label,
          className: style.className,
          actor: e.profiles?.full_name || 'Unknown',
          subject: e.subject_label,
          detail: e.detail ?? '',
          source: 'Administration' as const,
          school: e.organisations?.name ?? null,
        }
      }),
      ...(ai.data ?? []).map((e) => {
        const switched = e.was_enabled !== e.now_enabled
        const label = switched
          ? e.now_enabled
            ? 'AI turned ON'
            : 'AI turned OFF'
          : 'Routing threshold changed'
        return {
          key: e.id,
          when: e.changed_at,
          action: label,
          label,
          className:
            switched && !e.now_enabled
              ? 'bg-danger-subtle text-danger-foreground'
              : 'bg-primary-subtle text-primary',
          actor: e.profiles?.full_name || 'Unknown',
          subject: switched
            ? null
            : `${Math.round((e.was_threshold ?? 0) * 100)}% → ${Math.round((e.now_threshold ?? 0) * 100)}%`,
          detail: e.reason,
          source: 'AI controls' as const,
          school: null,
        }
      }),
    ]
    return rows.sort((a, b) => (a.when < b.when ? 1 : -1))
  }, [admin.data, ai.data])

  /** Every school present, plus the acts that belong to none. */
  const schools = useMemo(
    () => [...new Set(entries.map((e) => e.school ?? 'Special Miles'))].sort(),
    [entries],
  )

  /** Every action present, so the filter offers what the data actually holds. */
  const actions = useMemo(
    () => [...new Set(entries.map((e) => e.action))].sort(),
    [entries],
  )

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (action !== 'all' && e.action !== action) return false
      if (school !== 'all' && (e.school ?? 'Special Miles') !== school) return false
      if (!q) return true
      // Everything a person might half-remember: a name, a phrase from the
      // reason, the thing it happened to.
      return `${e.actor} ${e.subject ?? ''} ${e.detail} ${e.action}`
        .toLowerCase()
        .includes(q)
    })
  }, [entries, action, school, search])

  /*
   * WHAT LEAVES IS WHAT IS ON SCREEN, filters and all. An export that quietly
   * returned everything would be a different document from the one somebody
   * just looked at, and this is the screen where that matters most — it is the
   * file that gets attached to an email about an incident.
   */
  function exportCsv() {
    const esc = (v: string) => `"${String(v).replaceAll('"', '""')}"`
    const csv = [
      ['When', 'Action', 'Who', 'Subject', 'School', 'Detail', 'Source'].join(','),
      ...shown.map((e) =>
        [
          stamp(e.when),
          e.action,
          e.actor,
          e.subject ?? '',
          e.school ?? 'Special Miles',
          e.detail,
          e.source,
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
  }

  if (admin.isPending || ai.isPending) return <LoadingCards count={3} />
  if (admin.isError) return <ErrorState message={admin.error.message} />

  return (
    <div>
      <PageHeader
        title="Audit log"
        lead="Every governance decision, who made it, and why."
        actions={
          <button
            type="button"
            onClick={exportCsv}
            disabled={shown.length === 0}
            className="rounded-btn border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
          >
            Export {shown.length === entries.length ? 'all' : 'these'} as CSV
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

      {/* --- Filters ------------------------------------------------------- */}
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
            onChange={(e) => setAction(e.target.value)}
            className="mt-1 rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          >
            <option value="all">Every action</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
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
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className="mt-1 rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          >
            <option value="all">Everywhere</option>
            {schools.map((sc) => (
              <option key={sc} value={sc}>
                {sc}
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="A name, or a phrase from the reason"
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Announced, because filtering with a keyboard otherwise changes the
            table silently. */}
        <p role="status" className="py-2 text-sm text-muted-foreground">
          {shown.length === entries.length
            ? `${entries.length} entries`
            : `${shown.length} of ${entries.length} entries`}
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          detail="Verifying a staff member or changing the AI controls will appear here."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          title="No entry matches that"
          detail="Try a different action, or clear the search."
        />
      ) : (
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

              With `table-auto` the columns were sized by their content and the
              result was upside down: "Where" carried whitespace-nowrap so it
              demanded 254px — the widest column on the table for a school name
              — while "To whom", which holds the longest text on the row
              ("Ava W. — Join group work for a full session"), was squeezed into
              90px and wrapped every row to 165px tall.

              The share each column gets should follow how much it has to say,
              not which one refused to wrap. Timestamps and the source label are
              fixed-length; the subject and the reason are the ones that need
              room.
            */}
            <colgroup>
              {/* When: the widest fixed-length value on the row. The timestamp
                  carries seconds and must not wrap, so it needs room for
                  "26 Aug 2026, 00:55:30" plus its padding — measured, not
                  guessed, after a first pass left it at 154px and clipping. */}
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
              {shown.map((e) => (
                <tr key={e.key} className="border-b border-border last:border-0">
                  {/* tabular-nums so the timestamps form a column the eye can
                      run down rather than a ragged edge. */}
                  <td className="px-4 py-3 align-top tabular-nums whitespace-nowrap text-muted-foreground">
                    {stamp(e.when)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-block rounded-btn px-2 py-1 text-xs leading-tight font-semibold ${e.className}`}
                    >
                      {e.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top break-words font-medium text-foreground">
                    {e.actor}
                  </td>
                  <td className="px-4 py-3 align-top break-words text-foreground">
                    {e.subject ?? '—'}
                  </td>
                  {/* "Special Miles" rather than an em-dash: an act that
                      belongs to no school is a real answer, not a gap. */}
                  <td className="px-4 py-3 align-top text-xs leading-snug text-muted-foreground">
                    {e.school ?? 'Special Miles'}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {e.detail || '—'}
                  </td>
                  {/* Abbreviated on screen, spelled out in the CSV. This
                      column holds one of two values and says the same thing in
                      196 rows of 200, so widening it to fit "Administration"
                      would take space from the subject and the reason — the two
                      columns somebody is actually reading. The export has no
                      width limit and keeps the full word. */}
                  <td className="px-4 py-3 align-top whitespace-nowrap text-xs text-muted-foreground">
                    {e.source === 'Administration' ? 'Admin' : 'AI'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PageNote>
        Showing the most recent 200 administrative entries. Recorded here:
        staff verification and its withdrawal, two-factor resets, staff moving
        school, every change to the AI controls, and — since db/064 — schools
        being created or having their status changed, invoices voided,
        specialist applications decided and enquiries triaged. Each is written
        by a database trigger rather than by this application, so no screen can
        forget to record one. Who opened a child&rsquo;s record is a separate
        trail on Record Access: that is generated by ordinary work rather than
        by an administrative decision, and would otherwise bury everything
        here.
      </PageNote>
    </div>
  )
}
