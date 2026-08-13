import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchMySessions, fetchStudents, queryKeys } from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'

/**
 * Specialist schedule — what has been delivered, and when.
 *
 * THE DESIGN IS A CALENDAR. This is a list, and the difference is honest
 * rather than lazy: `Master Caseload Scheduler` shows drag-and-drop booking
 * across a week, and nothing in MiZanova can book anything. There are no
 * appointment slots, no availability, no invitations and no reminders. A
 * calendar grid with nothing bookable in it would be a picture of a feature.
 *
 * What DOES exist is a record of sessions that happened, which is the half a
 * specialist needs to answer "how much have I actually delivered for this
 * child this term?" — the question behind service-minute reporting.
 *
 * Booking is its own milestone and needs its own tables. The note at the
 * bottom says so.
 */
export default function Schedule() {
  const sessions = useQuery({
    queryKey: queryKeys.mySessions,
    queryFn: fetchMySessions,
  })
  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })

  if (sessions.isPending) return <LoadingCards count={2} />
  if (sessions.isError) return <ErrorState message={sessions.error.message} />

  const nameOf = (id: string) => {
    const student = students.data?.find((s) => s.id === id)
    return student ? `${student.first_name} ${student.last_name}` : 'Unknown student'
  }

  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)

  const monthSessions = sessions.data.filter((s) =>
    s.session_date.startsWith(thisMonth),
  )
  const minutesThisMonth = monthSessions.reduce(
    (sum, s) => sum + s.duration_minutes,
    0,
  )

  // Children seen this month, which is a different number from sessions and
  // the one that reveals somebody being missed.
  //
  // `caseloadKnown` matters more than it looks. If the roster fails to load,
  // `students.data` is undefined and this list is empty — which would render
  // "0 not seen this month" and read as reassurance. Not knowing must not look
  // like good news on a screen somebody uses to check nobody is being missed.
  const caseloadKnown = students.isSuccess
  const seenThisMonth = new Set(monthSessions.map((s) => s.student_id))
  const notSeen = caseloadKnown
    ? students.data.filter((s) => !seenThisMonth.has(s.id))
    : []

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Schedule</h1>
        <p className="mt-1 text-muted-foreground">
          Sessions you have delivered, most recent first.
        </p>
      </header>

      <div className="mb-6 grid gap-5 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Sessions this month
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {monthSessions.length}
          </p>
        </div>
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Minutes delivered
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {minutesThisMonth}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {Math.floor(minutesThisMonth / 60)}h {minutesThisMonth % 60}m
          </p>
        </div>
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Not seen this month
          </p>
          <p
            className={`mt-2 text-4xl font-bold ${
              notSeen.length > 0 ? 'text-warning-foreground' : 'text-foreground'
            }`}
          >
            {caseloadKnown ? notSeen.length : '—'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {caseloadKnown
              ? `of ${students.data.length} on your caseload`
              : 'Caseload did not load — this is unknown, not zero.'}
          </p>
        </div>
      </div>

      {notSeen.length > 0 && (
        <div className="mb-6 rounded-card border border-warning bg-warning-subtle p-4">
          <p className="font-semibold text-warning-foreground">
            No session recorded this month for:
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {notSeen.map((student) => (
              <li key={student.id}>
                <Link
                  to={`/specialist/students/${student.id}`}
                  className="text-sm font-medium text-warning-foreground underline"
                >
                  {student.first_name} {student.last_name}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-warning-foreground">
            This counts what has been logged here, not what happened. A session
            you have not recorded looks the same as one that did not occur.
          </p>
        </div>
      )}

      {sessions.data.length === 0 ? (
        <EmptyState
          title="No sessions recorded yet"
          detail="Open a student from your caseload and use Log session. What you record here is what appears on this page."
        />
      ) : (
        <ul className="space-y-3">
          {sessions.data.map((session) => (
            <li
              key={session.id}
              className="rounded-card border border-border bg-card shadow-raised p-4 sm:flex sm:items-center sm:gap-4"
            >
              <div className="min-w-0">
                <Link
                  to={`/specialist/students/${session.student_id}`}
                  className="font-semibold text-primary hover:underline"
                >
                  {nameOf(session.student_id)}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {new Date(session.session_date).toLocaleDateString('en-AU', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                  {' · '}
                  {session.duration_minutes} minutes
                  {session.trials_total !== null &&
                    session.trials_successful !== null &&
                    ` · ${session.trials_successful}/${session.trials_total}`}
                </p>
              </div>

              <div className="mt-2 flex gap-2 text-xs sm:mt-0 sm:ml-auto">
                {session.shared_with_teacher && (
                  <span className="rounded-btn bg-success-subtle px-2 py-1 font-semibold text-success-foreground">
                    Teacher
                  </span>
                )}
                {session.shared_with_parents && (
                  <span className="rounded-btn bg-success-subtle px-2 py-1 font-semibold text-success-foreground">
                    Family
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8 rounded-card border border-border bg-background p-6">
        <h2 className="font-semibold text-foreground">Not built yet</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          The design for this screen is a week calendar with drag-and-drop
          booking. Nothing in MiZanova can book anything — there are no
          appointment slots, no availability, no invitations and no reminders —
          so a calendar grid would be a picture of a feature rather than one.
          Booking needs its own tables and is its own piece of work. This page
          records what was delivered, which is what the sessions you log
          actually support.
        </p>
      </section>
    </div>
  )
}
