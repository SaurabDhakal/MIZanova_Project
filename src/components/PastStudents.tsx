import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchStudentsIncludingPast, queryKeys } from '../lib/api'
import Icon from './Icon'

/**
 * The children who have left — db/135.
 *
 * ---------------------------------------------------------------------------
 * A DISCLOSURE AT THE FOOT, NOT A MODE OF THE ROSTER
 * ---------------------------------------------------------------------------
 * Making the roster itself switch between "here" and "gone" would put a state
 * on a screen full of children's names where reading the wrong one matters, and
 * every filter, sort and count above would have to mean two things. The roster
 * is the school as it is today; this is the archive, and it is asked about
 * rarely — a records request, a parent ringing back, a child returning.
 *
 * Closed by default and counted in the summary line, so somebody who wants it
 * can see it is there without it ever competing with the roll.
 *
 * Only mounted for school administrators. An educator's roster is their
 * assignments, and a list of children they no longer teach is not their work.
 */
export default function PastStudents() {
  const all = useQuery({
    queryKey: queryKeys.studentsIncludingPast,
    queryFn: fetchStudentsIncludingPast,
  })

  const past = (all.data ?? []).filter((s) => !s.is_active)

  // Nothing to disclose, and an empty section would only raise the question.
  // A school with no leavers is the normal case in the first year.
  if (all.isSuccess && past.length === 0) return null

  return (
    <details className="mt-8 rounded-card border border-border bg-card p-5 shadow-raised">
      <summary className="flex min-h-11 cursor-pointer items-center text-section text-foreground">
        Students who have left
        {all.isSuccess && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({past.length})
          </span>
        )}
      </summary>

      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        Off the roll, and out of search, dropdowns and the counts. Every record
        about them is kept &mdash; open one to read their history, or to put
        them back if they return.
      </p>

      {all.isPending && (
        <div
          role="status"
          aria-label="Loading past students"
          className="mt-3 h-20 animate-pulse rounded-btn bg-background"
        />
      )}

      {all.isError && (
        <p role="alert" className="mt-3 text-sm text-danger-foreground">
          Past students could not be loaded: {all.error.message}
        </p>
      )}

      {all.isSuccess && past.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {past.map((student) => (
            <li key={student.id} className="py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link
                  to={`/school-admin/students/${student.id}`}
                  className="min-h-11 inline-flex items-center font-semibold text-primary hover:underline"
                >
                  {student.first_name} {student.last_name}
                </Link>

                {student.year_level && (
                  <span className="text-sm text-muted-foreground">
                    Year {student.year_level}
                  </span>
                )}
                {student.external_ref && (
                  <span className="text-sm tabular-nums text-muted-foreground">
                    #{student.external_ref}
                  </span>
                )}

                {student.left_at && (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
                    <Icon name="audit" aria-hidden className="h-3.5 w-3.5" />
                    Left{' '}
                    {new Date(student.left_at).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </div>

              {/* The one line somebody will be glad of in two years. Shown as
                  absent rather than skipped, because "no reason recorded" is
                  itself the useful answer when a new school asks. */}
              {student.left_reason ? (
                <p className="mt-0.5 max-w-prose text-sm text-foreground">
                  {student.left_reason}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  No reason recorded.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
