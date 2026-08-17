import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAppointments,
  fetchMySessions,
  fetchStudents,
  queryKeys,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import StatTile from '../../components/StatTile'
import WeekCalendar from '../../components/WeekCalendar'
import BookAppointmentForm from '../../components/BookAppointmentForm'
import AppointmentPanel from '../../components/AppointmentPanel'
import { addDays, startOfWeek } from '../../lib/week'

/**
 * Specialist schedule — what is booked, and what was delivered.
 *
 * TWO HALVES, AND THEY ARE DIFFERENT KINDS OF THING. The calendar shows
 * appointments (db/059), which are plans. The list underneath shows sessions
 * (db/028), which are facts. Completing an appointment is what writes a
 * session, so the delivered figures at the top can only move when something is
 * actually recorded — they cannot be inflated by booking.
 *
 * STILL NOT BUILT: availability, invitations and reminders. Working hours are
 * recorded nowhere, so this screen cannot say a slot is free — only that
 * nothing is booked in it, which is a weaker claim. The note at the bottom says
 * so to the person using it rather than leaving them to assume.
 */
export default function Schedule() {
  const { profile } = useAuth()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [booking, setBooking] = useState(false)
  const [now] = useState(() => Date.now())

  const sessions = useQuery({
    queryKey: queryKeys.mySessions,
    queryFn: fetchMySessions,
  })
  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })
  const appointments = useQuery({
    queryKey: queryKeys.appointments,
    queryFn: fetchAppointments,
  })

  if (sessions.isPending) return <LoadingCards count={2} />
  if (sessions.isError) return <ErrorState message={sessions.error.message} />

  const nameOf = (id: string) => {
    const student = students.data?.find((s) => s.id === id)
    return student ? `${student.first_name} ${student.last_name}` : 'Unknown student'
  }

  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthSessions = sessions.data.filter((s) =>
    s.session_date.startsWith(thisMonth),
  )
  const minutesThisMonth = monthSessions.reduce(
    (sum, s) => sum + s.duration_minutes,
    0,
  )

  /*
   * `caseloadKnown` matters more than it looks. If the roster fails to load,
   * `students.data` is undefined and this list is empty — which would render
   * "0 not seen this month" and read as reassurance. Not knowing must not look
   * like good news on a screen somebody uses to check nobody is being missed.
   */
  const caseloadKnown = students.isSuccess
  const seenThisMonth = new Set(monthSessions.map((s) => s.student_id))
  const notSeen = caseloadKnown
    ? students.data.filter((s) => !seenThisMonth.has(s.id))
    : []

  // Frozen at mount rather than read during render: the past/upcoming boundary
  // does not need to be to-the-second, and reading the clock while rendering is
  // what makes a component non-idempotent.
  const upcoming = (appointments.data ?? []).filter(
    (a) => a.status === 'scheduled' && new Date(a.starts_at).getTime() >= now,
  )
  const selected =
    (appointments.data ?? []).find((a) => a.id === selectedId) ?? null

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Schedule</h1>
        <p className="mt-1 text-muted-foreground">
          What is booked, and what you have delivered.
        </p>
      </header>

      <div className="mb-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Booked ahead"
          value={appointments.isSuccess ? upcoming.length : undefined}
          icon="schedule"
          hint="Still to happen"
        />
        <StatTile
          label="Sessions this month"
          value={monthSessions.length}
          icon="observations"
          hint="Recorded, not planned"
        />
        <StatTile
          label="Minutes delivered"
          value={minutesThisMonth}
          icon="progress"
          hint={`${Math.floor(minutesThisMonth / 60)}h ${minutesThisMonth % 60}m this month`}
        />
        <StatTile
          label="Not seen this month"
          value={caseloadKnown ? notSeen.length : undefined}
          icon="caseload"
          tone={caseloadKnown && notSeen.length > 0 ? 'warning' : 'default'}
          hint={
            caseloadKnown ? `of ${students.data.length} on your caseload` : undefined
          }
        />
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

      {/* --- The week ------------------------------------------------------- */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          {weekStart.toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
          })}
          {' – '}
          {addDays(weekStart, 6).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
          })}
        </h2>

        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground"
          >
            ← Previous
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground"
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground"
          >
            Next →
          </button>
          <button
            type="button"
            onClick={() => setBooking((v) => !v)}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {booking ? 'Close' : '+ Book'}
          </button>
        </div>
      </div>

      {booking && (
        <div className="mb-5">
          <BookAppointmentForm
            students={students.data ?? []}
            defaultStart={weekStart}
            onBooked={() => setBooking(false)}
          />
        </div>
      )}

      {/* A failed appointments query must not render as an empty week — an
          unbooked day and an unknown one look identical otherwise. */}
      {appointments.isError ? (
        <ErrorState
          message="Your appointments could not be loaded, so this week is unknown rather than empty. Nothing has been cancelled."
          onRetry={() => void appointments.refetch()}
        />
      ) : (
        <WeekCalendar
          weekStart={weekStart}
          appointments={appointments.data ?? []}
          nameOf={nameOf}
          currentUserId={profile?.id ?? null}
          selectedId={selectedId}
          onSelect={(a) => setSelectedId((id) => (id === a.id ? null : a.id))}
        />
      )}

      {selected && (
        <div className="mt-5">
          <AppointmentPanel
            appointment={selected}
            studentName={nameOf(selected.student_id)}
            mine={selected.specialist_id === profile?.id}
            onDone={() => setSelectedId(null)}
          />
        </div>
      )}

      {/* --- Delivered ------------------------------------------------------ */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Sessions delivered
      </h2>

      {sessions.data.length === 0 ? (
        <EmptyState
          title="No sessions recorded yet"
          detail="Book an appointment above, then use Record session once it has happened. What you record is what appears here and in the figures at the top."
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
          An empty slot here means nothing is booked in it, not that you are
          free — working hours are recorded nowhere in MiZanova, so availability
          is a claim this screen cannot make. Nobody is told about an
          appointment either: there is no email in this product, so a booking, a
          move and a cancellation reach the family and the teacher only if you
          tell them yourself. Both are said here rather than implied, because a
          calendar that looks complete is one people stop double-checking.
        </p>
      </section>
    </div>
  )
}
