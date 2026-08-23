import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchStudents, queryKeys } from '../../lib/api'
import Messenger from '../../components/Messenger'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import EducatorSchoolContext from '../../components/EducatorSchoolContext'

/**
 * Staff messaging.
 *
 * The student picker filters the whole screen, not just the new-conversation
 * list. An earlier version filtered only the latter, which meant selecting a
 * student changed nothing visible and you could open a conversation about a
 * different child without noticing. A control that looks like a filter has to
 * behave like one.
 *
 * "All students" is the default because a teacher's inbox spans their whole
 * class; picking a student narrows it.
 */
export default function EducatorMessages() {
  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })
  const [studentId, setStudentId] = useState<string>('')

  if (students.isPending) return <LoadingCards count={2} />
  if (students.isError) return <ErrorState message={students.error.message} />

  if (students.data.length === 0) {
    return (
      <EmptyState
        title="No students assigned to you yet"
        detail="Messaging is organised around a student, so it becomes available once you are assigned to one."
      />
    )
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Messages</h1>
        <p className="mt-1 text-muted-foreground">
          Conversations with families about the students you support.
        </p>
        <EducatorSchoolContext />
      </header>

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
        Messages are part of the student&rsquo;s record. You can unsend your own
        message for 15 minutes; an audit-safe tombstone remains in the
        conversation. Photos, voice notes and files are stored privately and
        are available only to the conversation participants.
      </p>
    </div>
  )
}
