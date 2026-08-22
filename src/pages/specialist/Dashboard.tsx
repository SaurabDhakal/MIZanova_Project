import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchPendingStrategies,
  fetchRecentLogs,
  fetchStudents,
  queryKeys,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import StatTile from '../../components/StatTile'

/**
 * Specialist command centre.
 *
 * Ordered by what should interrupt someone's morning: suggestions waiting on
 * their judgement first, because until they act nothing reaches a teacher;
 * then flagged incidents on their caseload; then the caseload itself.
 *
 * The Figma specialist screens include a live scheduler and a resource
 * library. Neither is built, and both are their own milestones — so they stay
 * as placeholders in the sidebar rather than appearing here half-made.
 */
export default function SpecialistDashboard() {
  const { profile } = useAuth()

  const pending = useQuery({
    queryKey: queryKeys.pendingStrategies,
    queryFn: fetchPendingStrategies,
  })
  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })
  const logs = useQuery({
    queryKey: queryKeys.recentLogs,
    queryFn: () => fetchRecentLogs(100),
  })

  if (pending.isPending) return <LoadingCards count={3} />
  if (students.isPending) return <LoadingCards count={3} />
  if (pending.isError) return <ErrorState message={pending.error.message} />
  if (students.isError) return <ErrorState message={students.error.message} />

  const waiting = pending.data.length
  const flagged = (logs.data ?? []).filter((l) => l.is_risk_flagged)

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Command centre</h1>
        <p className="mt-1 text-muted-foreground">
          {profile?.first_name ? `${profile.first_name}, here` : 'Here'} is what
          needs you today.
        </p>
      </header>

      {/* The one thing that blocks other people until it is done. */}
      {waiting > 0 ? (
        <div
          role="alert"
          className="mb-6 rounded-card border border-warning bg-warning-subtle p-5"
        >
          <p className="text-lg font-bold text-warning-foreground">
            {waiting} AI suggestion{waiting === 1 ? '' : 's'} waiting for your
            review
          </p>
          <p className="mt-1 max-w-prose text-sm text-warning-foreground">
            No teacher can see these until you release them. They were held back
            because the model was not confident enough, or because a teacher
            flagged one as unsuitable.
          </p>
          <Link
            to="/specialist/review-queue"
            className="mt-3 inline-block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
          >
            Open the review queue
          </Link>
        </div>
      ) : (
        <div className="mb-6 rounded-card border border-border bg-card shadow-raised p-5">
          <p className="font-semibold text-success-foreground">
            ✓ Nothing waiting for review
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Every AI suggestion so far cleared the confidence threshold on its
            own, or has already been dealt with.
          </p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <StatTile
          label="Caseload"
          value={students.isSuccess ? students.data.length : undefined}
          icon="caseload"
          hint={
            <Link
              to="/specialist/caseload"
              className="font-semibold text-primary hover:underline"
            >
              View caseload →
            </Link>
          }
        />

        <StatTile
          label="Flagged incidents"
          value={logs.isSuccess ? flagged.length : undefined}
          icon="safeguarding"
          tone={logs.isSuccess && flagged.length > 0 ? 'danger' : 'default'}
          hint="On your caseload, recently"
        />

        <StatTile
          label="Logs seen"
          value={logs.isSuccess ? logs.data.length : undefined}
          icon="observations"
          hint="Across your students"
        />
      </div>


      {/* --- Flagged incidents ----------------------------------------------
          A FAILED LOGS QUERY MUST NOT LOOK LIKE AN EMPTY ONE. This section used
          to hang off `flagged.length > 0` alone, so when the query failed it
          disappeared in silence — telling a specialist nothing was flagged on a
          screen they check to find out exactly that. The tiles above were
          already honest about it; this was not. */}
      {(logs.isError || flagged.length > 0) && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
            Flagged on your caseload
          </h2>

          {logs.isError ? (
            <ErrorState
              message="Flagged incidents could not be loaded, which is not the same as there being none. Check the safeguarding queue before treating your caseload as clear."
              onRetry={() => void logs.refetch()}
            />
          ) : (
            <>
              <p className="mb-3 max-w-prose text-sm text-muted-foreground">
                These are also in your school administrator&rsquo;s safeguarding
                queue. They appear here because you may be the person who knows
                this child best.
              </p>
              <ul className="space-y-3">
                {flagged.slice(0, 10).map((log) => {
                  const student = students.data.find((s) => s.id === log.student_id)
                  return (
                    <li
                      key={log.id}
                      className="rounded-card border border-border bg-card shadow-raised p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-btn bg-danger-subtle px-2.5 py-1 text-sm font-semibold text-danger-foreground">
                          {log.behaviour_type} · {log.intensity}
                        </span>
                        {student && (
                          <Link
                            to={`/specialist/students/${student.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {student.first_name} {student.last_name}
                          </Link>
                        )}
                        <span className="ml-auto text-sm text-muted-foreground">
                          {new Date(log.occurred_at).toLocaleDateString('en-AU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
