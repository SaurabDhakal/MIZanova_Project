import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchGoals,
  fetchRecentLogs,
  fetchStudents,
  queryKeys,
  type StudentRow,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'

/**
 * The specialist's caseload.
 *
 * There is no caseload query. `fetchStudents()` is the same call an educator
 * makes; RLS returns a specialist only the students they are assigned to with
 * `assignment = 'specialist'`. "All students" and "my caseload" are the same
 * request with different answers — and because the boundary lives in the
 * database, this page cannot widen it by accident.
 */
function CaseloadCard({
  student,
  logCount,
}: {
  student: StudentRow
  logCount: number
}) {
  const goals = useQuery({
    queryKey: queryKeys.goals(student.id),
    queryFn: () => fetchGoals(student.id),
  })

  const active = (goals.data ?? []).filter(
    (g) => g.status !== 'achieved' && g.status !== 'discontinued',
  )
  const averageProgress =
    active.length > 0
      ? Math.round(
          active.reduce((sum, g) => sum + g.progress_percent, 0) / active.length,
        )
      : null
  const needsReview = (goals.data ?? []).some((g) => g.status === 'needs_review')

  return (
    <li className="rounded-card border border-border bg-card shadow-raised p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <p className="font-bold text-foreground">
            {student.first_name} {student.last_name}
          </p>
          <p className="text-sm text-muted-foreground">
            {student.year_level ? `Year ${student.year_level}` : 'Year —'}
            {student.external_ref && ` · ID #${student.external_ref}`}
          </p>
        </div>
        {needsReview && (
          <span className="ml-auto rounded-btn bg-warning-subtle px-2.5 py-1 text-sm font-semibold text-warning-foreground">
            Goal needs review
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Active goals
          </p>
          <p className="mt-1 text-title text-foreground">
            {goals.isPending ? '—' : active.length}
          </p>
          {averageProgress !== null && (
            <p className="text-xs text-muted-foreground">
              {averageProgress}% average progress
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Recent logs
          </p>
          <p className="mt-1 text-title text-foreground">{logCount}</p>
          <p className="text-xs text-muted-foreground">Most recent activity</p>
        </div>
      </div>

      <Link
        to={`/specialist/students/${student.id}`}
        className="mt-4 inline-block rounded-btn bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Open student
      </Link>
    </li>
  )
}

export default function Caseload() {
  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })
  const logs = useQuery({
    queryKey: queryKeys.recentLogs,
    queryFn: () => fetchRecentLogs(200),
  })

  if (students.isPending) return <LoadingCards count={3} />
  if (students.isError) return <ErrorState message={students.error.message} />

  const logsByStudent = new Map<string, number>()
  for (const log of logs.data ?? []) {
    logsByStudent.set(log.student_id, (logsByStudent.get(log.student_id) ?? 0) + 1)
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Caseload</h1>
        <p className="mt-1 text-muted-foreground">
          The students you are assigned to support.
        </p>
      </header>

      {students.data.length === 0 ? (
        <EmptyState
          title="No students on your caseload"
          detail="A school administrator adds students to your caseload from Directory & Access. Until then there is nothing here — and if your own account is not verified, nothing would be visible even if there were."
        />
      ) : (
        <ul className="grid gap-5 lg:grid-cols-2">
          {students.data.map((student) => (
            <CaseloadCard
              key={student.id}
              student={student}
              logCount={logsByStudent.get(student.id) ?? 0}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
