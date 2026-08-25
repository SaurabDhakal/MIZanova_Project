import { useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchAllStaff,
  fetchSchools,
  fetchStudentAccessEvents,
  fetchStudents,
  queryKeys,
} from '../../lib/api'
import { ROLE_CONFIG } from '../../lib/roles'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import Pagination from '../../components/Pagination'
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
export default function RecordAccess() {
  const [page, setPage] = useState(0)
  const listTop = useRef<HTMLHeadingElement>(null)

  const events = useQuery({
    // The page belongs in the key. Without it React Query serves page 0 from
    // cache for ever and the Next button appears to do nothing.
    queryKey: [...queryKeys.studentAccess, page],
    queryFn: () => fetchStudentAccessEvents(page),
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

  return (
    <div>
      <PageHeader
        title="Record access"
        lead="Who has opened children's records, across every school."
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
