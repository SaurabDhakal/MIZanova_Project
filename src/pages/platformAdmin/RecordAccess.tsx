import { useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchAllStaff,
  fetchSchools,
  fetchStudentAccessEvents,
  fetchAllStudentAccessEvents,
  type AccessFilters,
  fetchStudents,
  queryKeys,
} from '../../lib/api'
import { ROLE_CONFIG } from '../../lib/roles'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import Pagination from '../../components/Pagination'
import { showToast } from '../../lib/toast'
import PageHeader from '../../components/PageHeader'

/**
 * Record access across every school — the oversight layer.
 *
 * WHY THIS SCREEN EXISTS. db/023 gave school administrators a view of who
 * opened which child's record. That answered the question for a school and
 * left an obvious one unanswered: the log was shown to the school, so how
 * would Special Miles ever know?
 *
 * It could not. Platform admins were permitted to read every row and had
 * nowhere to read them. db/024 goes further and stops a school admin seeing
 * their OWN accesses, so the chain is real: staff are visible to their school,
 * and the school is visible to here.
 *
 * The honest limit, stated because it should be: a platform admin can see
 * their own accesses. Somebody is at the top. What constrains them is that
 * their administrative actions are written to admin_audit_events by functions
 * they cannot bypass — not that another layer is watching.
 *
 * NO SCORING, NO ALERTS. Nothing on this page decides what is suspicious. A
 * system that flags "unusual access" without knowing why a teacher opened a
 * file would accuse people, and on this subject that is a serious thing to get
 * wrong. It shows what happened, in order, and leaves judgement to a person.
 */
/** Bounded questions only. "Everything, ever" is a scroll, not an answer. */
const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'Everything recorded' },
] as const

export default function RecordAccess() {
  const [page, setPage] = useState(0)
  const [actorId, setActorId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['value']>('30')
  const listTop = useRef<HTMLHeadingElement>(null)

  /*
   * BUILT WHEN IT IS USED, NOT WHILE RENDERING. `Date.now()` during render is
   * impure — the lint rule caught it — and it is also wrong here for a reason
   * worth keeping: a "last 30 days" window computed at render time is frozen at
   * whatever second the component happened to mount, so a screen left open
   * overnight quietly asks yesterday's question. Computed at fetch time and at
   * export time, it always means thirty days from now.
   */
  const buildFilters = (): AccessFilters => ({
    actorId: actorId || undefined,
    studentId: studentId || undefined,
    since:
      period === 'all'
        ? undefined
        : new Date(Date.now() - Number(period) * 86_400_000).toISOString(),
  })

  const events = useQuery({
    // The page AND the filters belong in the key. Without the page, React Query
    // serves page 0 for ever and Next appears to do nothing; without the
    // filters, changing one shows the previous answer to a different question.
    queryKey: [...queryKeys.studentAccess, page, actorId, studentId, period],
    queryFn: () => fetchStudentAccessEvents(page, buildFilters()),
    placeholderData: keepPreviousData,
  })
  const staff = useQuery({ queryKey: queryKeys.allStaff, queryFn: fetchAllStaff })
  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })
  const schools = useQuery({ queryKey: queryKeys.schools, queryFn: fetchSchools })

  if (events.isPending) return <LoadingCards count={2} />
  if (events.isError) return <ErrorState message={events.error.message} />

  const describe = (actorId: string) => {
    const person = staff.data?.find((p) => p.id === actorId)
    if (!person) return { name: 'Unknown account', role: '—', schoolId: null }
    return {
      name: person.full_name || person.email || 'Unnamed',
      role: ROLE_CONFIG[person.role].label,
      schoolId: person.school_id,
    }
  }

  /**
   * The child, in the abbreviated form — "Ethan M." — not the full name.
   *
   * This is a real choice rather than an oversight, and it is worth being
   * straight about what it is and is not. A platform admin can already read
   * every student row: RLS permits it, so withholding the surname here is data
   * minimisation in the interface, not a security boundary. What it buys is
   * that a screen listing every access across every school does not become a
   * roster of full names for anybody glancing at it.
   *
   * Enough to tell two children apart and follow a pattern; less than a
   * directory.
   */
  const childOf = (studentId: string) =>
    students.data?.find((s) => s.id === studentId)?.display_name ??
    'Removed or unavailable'

  const schoolOf = (schoolId: string | null) =>
    schoolId
      ? (schools.data?.find((s) => s.id === schoolId)?.name ?? 'Unknown school')
      : 'No school'

  // How much each person looked at, and at how many different children.
  // COUNTED FROM THIS PAGE ONLY, since pagination landed — the heading below
  // says so. A total that silently covered the most recent fifty entries while
  // looking like an all-time figure would be exactly the kind of number this
  // screen exists to avoid producing.
  const byActor = new Map<string, { views: number; children: Set<string> }>()
  for (const event of events.data.rows) {
    const entry = byActor.get(event.actor_id) ?? { views: 0, children: new Set() }
    entry.views++
    entry.children.add(event.student_id)
    byActor.set(event.actor_id, entry)
  }

  const ranked = [...byActor.entries()].sort(
    (a, b) => b[1].children.size - a[1].children.size,
  )

  /*
   * THE WHOLE RECORD, NOT THE PAGE ON SCREEN.
   *
   * This is the file somebody attaches to an email about a privacy complaint,
   * so exporting the twenty-five rows that happened to be visible would be a
   * partial answer wearing the shape of a complete one. It fetches everything,
   * and if it hits the cap it says so in the toast rather than trimming
   * quietly.
   *
   * Names are resolved here rather than left as ids: a spreadsheet of UUIDs
   * cannot be read by the person who asked for it.
   */
  async function exportCsv() {
    try {
      const all = await fetchAllStudentAccessEvents(buildFilters())
      const esc = (v: string) => `"${String(v).replaceAll('"', '""')}"`
      const csv = [
        ['When', 'Who', 'Role', 'School', 'Child', 'What'].join(','),
        ...all.rows.map((e) => {
          const who = describe(e.actor_id)
          return [
            new Date(e.occurred_at).toLocaleString('en-AU'),
            who.name,
            who.role,
            schools.data?.find((sc) => sc.id === who.schoolId)?.name ?? '',
            childOf(e.student_id),
            e.context ?? '',
          ]
            .map(esc)
            .join(',')
        }),
      ].join('\n')

      const url = URL.createObjectURL(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      )
      const a = document.createElement('a')
      a.href = url
      a.download = `mizanova-record-access-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)

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

  return (
    <div>
      <PageHeader
        title="Record access"
        lead="Who has opened children's records, across every school."
        actions={
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={events.data.total === 0}
            className="rounded-btn border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
          >
            Export the full record
          </button>
        }
      />

      <div
        role="note"
        className="mb-6 rounded-card border border-border bg-card shadow-raised p-4"
      >
        <p className="max-w-prose text-sm text-muted-foreground">
          School administrators see this for their own school, but not their own
          accesses — an audit trail its subject can inspect for gaps is a map of
          where to hide. You can see everyone, including yourself. Nothing here
          judges what is suspicious; it reports what happened.
        </p>
      </div>

        {/*
          THE THREE QUESTIONS THIS PAGE IS ASKED.

          A parent asking who has seen their child's file is the commonest
          reason anybody opens this screen, and until now it could not be
          answered — there was no way to narrow by child, by person, or by
          date, only pages of everything in time order.

          The filters run in the database, not over the rendered rows. This
          list is paginated, so filtering what is on screen would answer a
          question about a child with whatever happened to be on page one.

          Thirty days is the default because these questions are almost always
          bounded — a complaint, an incident, a term. "Everything recorded" is
          available and is not the starting point.
        */}
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="access-child" className="block text-sm font-medium text-muted-foreground">
              Child
            </label>
            <select
              id="access-child"
              value={studentId}
              onChange={(e) => { setStudentId(e.target.value); setPage(0) }}
              className="mt-1 rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            >
              <option value="">Any child</option>
              {(students.data ?? []).map((child) => (
                <option key={child.id} value={child.id}>
                  {child.first_name} {child.last_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="access-who" className="block text-sm font-medium text-muted-foreground">
              Opened by
            </label>
            <select
              id="access-who"
              value={actorId}
              onChange={(e) => { setActorId(e.target.value); setPage(0) }}
              className="mt-1 rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            >
              <option value="">Anybody</option>
              {(staff.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name || person.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="access-period" className="block text-sm font-medium text-muted-foreground">
              Period
            </label>
            <select
              id="access-period"
              value={period}
              onChange={(e) => { setPeriod(e.target.value as typeof period); setPage(0) }}
              className="mt-1 rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Announced, because narrowing with a keyboard otherwise changes
              the table in silence. */}
          <p role="status" className="py-2 text-sm text-muted-foreground">
            {events.data.total === 0
              ? 'No access matches that'
              : `${events.data.total} ${events.data.total === 1 ? 'entry' : 'entries'}`}
          </p>

          {(actorId || studentId || period !== '30') && (
            <button
              type="button"
              onClick={() => { setActorId(''); setStudentId(''); setPeriod('30'); setPage(0) }}
              className="py-2 text-sm font-semibold text-primary hover:underline"
            >
              Clear
            </button>
          )}
        </div>

      {events.data.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing recorded yet. Entries appear as staff open student records.
        </p>
      ) : (
        <>
          {/* SAYS WHICH ROWS IT COUNTED. This summary is built from the page
              on screen, not from every entry ever recorded. Left unlabelled it
              would read as an all-time figure and understate somebody's access
              by however many pages are behind this one — a wrong number on the
              one screen whose job is to be exact about who looked at what. */}
          <h2 className="mb-1 text-lg font-semibold text-foreground">
            By person, on this page
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Counted from the {events.data.rows.length} entries shown below, not
            from all {events.data.total.toLocaleString('en-AU')}.
          </p>
          <div className="mb-8 overflow-x-auto rounded-card border border-border bg-card shadow-raised">
            <table className="w-full min-w-[34rem] text-left">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                    Who
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                    Children opened
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                    Times
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(([actorId, stats]) => {
                  const who = describe(actorId)
                  return (
                    <tr key={actorId} className="border-b border-border last:border-0">
                      <td className="p-4">
                        <span className="font-medium text-foreground">
                          {who.name}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {who.role}
                        </span>
                      </td>
                      <td className="p-4 text-foreground">{stats.children.size}</td>
                      <td className="p-4 text-muted-foreground">{stats.views}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h2
            ref={listTop}
            className="mb-3 scroll-mt-6 text-lg font-semibold text-foreground"
          >
            Entries
          </h2>
          <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
            <table className="w-full min-w-[46rem] text-left">
              <caption className="sr-only">
                Each time a member of staff opened a child&rsquo;s record, most
                recent first
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                    When
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                    Who
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                    School
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                    Opened
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                    What
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.data.rows.map((event) => {
                  const who = describe(event.actor_id)
                  return (
                    <tr
                      key={event.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="p-4 text-sm whitespace-nowrap text-muted-foreground">
                        {new Date(event.occurred_at).toLocaleString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </td>
                      <td className="p-4 text-sm">
                        <span className="font-medium text-foreground">
                          {who.name}
                        </span>
                        <span className="block text-muted-foreground">
                          {who.role}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {schoolOf(who.schoolId)}
                      </td>
                      <td className="p-4 text-sm font-medium text-foreground">
                        {childOf(event.student_id)}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {event.context === 'student_record'
                          ? 'Student record'
                          : event.context}
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

      <p className="mt-6 max-w-prose text-xs text-muted-foreground">
        Children appear in the shortened form, &ldquo;Ethan M.&rdquo; — enough
        to tell two apart and follow a pattern, without turning a screen that
        spans every school into a directory of full names. The
        school&rsquo;s own Record Access page shows them in full, because the
        school already knows them.
      </p>
    </div>
  )
}
