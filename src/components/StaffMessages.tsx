import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchStudents, queryKeys } from '../lib/api'
import Messenger from './Messenger'
import { EmptyState, ErrorState, LoadingCards } from './QueryState'

/**
 * The Messages screen for a member of staff: pick a student, talk to their
 * people.
 *
 * ---------------------------------------------------------------------------
 * ONE SCREEN FOR EDUCATORS AND SPECIALISTS, AND `fetchStudents` IS WHY
 * ---------------------------------------------------------------------------
 * An educator's inbox is organised around their class and a specialist's around
 * their caseload, and it is tempting to build two screens for that. There is no
 * difference to build. Both call `fetchStudents()`, and RLS decides what comes
 * back: an educator gets the students they are assigned to, a specialist gets
 * the ones assigned to them with `assignment = 'specialist'`. The same request
 * with different answers — the same reasoning Caseload.tsx already relies on.
 *
 * So the only real difference is the words, and those are props. A second copy
 * of the picker, the filter and the record warning would be seventy lines that
 * have to be fixed twice.
 *
 * ---------------------------------------------------------------------------
 * THE PICKER FILTERS THE WHOLE SCREEN
 * ---------------------------------------------------------------------------
 * An earlier version filtered only the new-conversation list, which meant
 * selecting a student changed nothing visible and you could open a conversation
 * about a different child without noticing. A control that looks like a filter
 * has to behave like one.
 *
 * "All students" is the default, because an inbox spans everybody you support;
 * picking one narrows it.
 */
export default function StaffMessages({
  subtitle,
  emptyTitle,
  emptyDetail,
  note,
}: {
  subtitle: string
  /** Shown when RLS returns nobody — no class, or no caseload. */
  emptyTitle: string
  emptyDetail: string
  /**
   * Something true about THIS role's inbox that the screen would otherwise let
   * somebody assume wrongly. Only the school admin passes one; see that page.
   */
  note?: string
}) {
  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })
  const [studentId, setStudentId] = useState<string>('')

  if (students.isPending) return <LoadingCards count={2} />
  if (students.isError) return <ErrorState message={students.error.message} />

  if (students.data.length === 0) {
    return <EmptyState title={emptyTitle} detail={emptyDetail} />
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Messages</h1>
        <p className="mt-1 text-muted-foreground">{subtitle}</p>
      </header>

      {note && (
        <p className="mb-5 max-w-prose rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
          {note}
        </p>
      )}

      <div className="mb-5">
        <label
          htmlFor="message-student"
          className="text-sm font-medium text-muted-foreground"
        >
          Showing conversations about
        </label>
        <select
          id="message-student"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="mt-1 ml-2 rounded-btn border border-border bg-card px-3 py-2 text-foreground"
        >
          <option value="">All students</option>
          {students.data.map((student) => (
            <option key={student.id} value={student.id}>
              {student.first_name} {student.last_name}
            </option>
          ))}
        </select>
      </div>

      <Messenger studentId={studentId === '' ? null : studentId} />

      <p className="mt-4 max-w-prose text-xs text-muted-foreground">
        Messages are part of the student&rsquo;s record and cannot be edited or
        deleted once sent. Corrections are sent as a new message.
      </p>
    </div>
  )
}
