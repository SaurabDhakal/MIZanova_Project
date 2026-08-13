import { useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchSchoolStaff,
  fetchStudentAccessEvents,
  fetchStudents,
  queryKeys,
} from '../../lib/api'
import { ROLE_CONFIG } from '../../lib/roles'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import Pagination from '../../components/Pagination'

/**
 * Who opened which child's record.
 *
 * This exists to answer one question, asked by a parent or a regulator after
 * something has gone wrong: "which staff members have looked at my child's
 * file?" Until db/023 there was no answer, and it is the one gap that cannot
 * be filled retroactively — the record only exists from the day it starts.
 *
 * Deliberately plain. It is a list of facts in the order they happened, with
 * no summarising, scoring or "unusual activity" flag. A number that claims to
 * detect suspicion would be inventing one, and this is the screen where that
 * would matter most.
 */
export default function AccessLog() {
  const [page, setPage] = useState(0)
  const listTop = useRef<HTMLHeadingElement>(null)
  const events = useQuery({
    queryKey: [...queryKeys.studentAccess, page],
    queryFn: () => fetchStudentAccessEvents(page),
    placeholderData: keepPreviousData,
  })
  const staff = useQuery({
    queryKey: queryKeys.schoolStaff,
    queryFn: fetchSchoolStaff,
  })
  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })

  if (events.isPending) return <LoadingCards count={2} />
  if (events.isError) return <ErrorState message={events.error.message} />

  const staffName = (id: string) => {
    const person = staff.data?.find((p) => p.id === id)
    if (!person) return 'Unknown account'
    return `${person.full_name || person.email || 'Unnamed'} · ${ROLE_CONFIG[person.role].label}`
  }

  const studentName = (id: string) => {
    const student = students.data?.find((s) => s.id === id)
    return student ? `${student.first_name} ${student.last_name}` : 'Unknown student'
  }

  // How many distinct staff have opened each child's record. The useful shape
  // for the question actually asked, and still just a count of real rows.
  const perStudent = new Map<string, Set<string>>()
  for (const event of events.data.rows) {
    const seen = perStudent.get(event.student_id) ?? new Set<string>()
    seen.add(event.actor_id)
    perStudent.set(event.student_id, seen)
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Record access</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Every time a member of staff opened a child&rsquo;s record. Recording
          began when this feature was installed — there is nothing before that.
        </p>
      </header>

      <div
        role="note"
        className="mb-6 rounded-card border border-border bg-card shadow-raised p-4"
      >
        <p className="text-sm text-muted-foreground">
          Repeated views by the same person within five minutes are recorded
          once, so opening a page does not fill this list. Nobody can edit or
          delete an entry, including a platform administrator — the rows are
          written by the database and there is no policy that permits changing
          them.
        </p>
      </div>

      {events.data.total === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          detail="Entries appear here as staff open student records. If this stays empty while people are using the app, something is wrong — tell whoever maintains MiZanova."
        />
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            By child
          </h2>
          <ul className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...perStudent.entries()].map(([studentId, actors]) => (
              <li
                key={studentId}
                className="rounded-card border border-border bg-card shadow-raised p-4"
              >
                <p className="font-semibold text-foreground">
                  {studentName(studentId)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {actors.size} member{actors.size === 1 ? '' : 's'} of staff, on
                  this page of entries
                </p>
              </li>
            ))}
          </ul>

          <h2
            ref={listTop}
            className="mb-3 scroll-mt-6 text-lg font-semibold text-foreground"
          >
            Entries
          </h2>
          <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
            <table className="w-full min-w-[38rem] text-left">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                    When
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                    Who
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                    Opened
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.data.rows.map((event) => (
                  <tr key={event.id} className="border-b border-border last:border-0">
                    <td className="p-4 text-sm text-muted-foreground">
                      {new Date(event.occurred_at).toLocaleString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </td>
                    <td className="p-4 text-sm text-foreground">
                      {staffName(event.actor_id)}
                    </td>
                    <td className="p-4 text-sm font-medium text-foreground">
                      {studentName(event.student_id)}
                    </td>
                  </tr>
                ))}
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
        This records opening a child&rsquo;s profile. It does not yet record
        every screen that shows a name — a class list, for instance. Nothing
        prunes these entries either, and an access log kept forever is itself
        information about staff held longer than it is needed; a retention
        period should be agreed before this is used in a real school.
      </p>
    </div>
  )
}
