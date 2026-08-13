import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchSchoolSummary, fetchStudents, queryKeys } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import StatTile from '../../components/StatTile'

/**
 * School Admin command centre - docs/Figma Pages Design/SC1-Admin Command Center.png.
 *
 * The Figma version leads with an "Audit Readiness Score" of 92% on a gauge.
 * That number is invented: nothing in this system could compute it, and a
 * confident-looking compliance score with no basis is worse than no score,
 * because someone will quote it.
 *
 * Replaced with figures that are real and checkable: how many flagged
 * incidents are open, and how long the oldest has been waiting. That second
 * one is the number that actually matters for safeguarding — a queue is only
 * as good as its slowest item.
 */
/**
 * Whole days since a timestamp.
 *
 * A module-level helper rather than an inline `Date.now()` in the component:
 * the React Compiler lint rejects impure calls in a render body, and rightly —
 * but a "waiting N days" label is inherently time-dependent and SHOULD be
 * recalculated on every render. Same pattern as the other relative-time
 * helpers in this codebase.
 */
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export default function SchoolAdminDashboard() {
  const { profile } = useAuth()

  const summary = useQuery({
    queryKey: queryKeys.schoolSummary,
    queryFn: fetchSchoolSummary,
  })

  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })

  if (summary.isPending) return <LoadingCards count={3} />
  if (summary.isError) return <ErrorState message={summary.error.message} />

  const s = summary.data
  const openCount = s?.flagged_open ?? 0

  const oldestDays = s?.oldest_open_at ? daysSince(s.oldest_open_at) : null

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Command centre</h1>
        <p className="mt-1 text-muted-foreground">
          {profile?.first_name ? `${profile.first_name}, here` : 'Here'} is
          where your school stands today.
        </p>
      </header>

      {/* The one thing that should interrupt an administrator's day. */}
      {openCount > 0 && (
        <div
          role="alert"
          className="mb-6 rounded-card border border-danger bg-danger-subtle p-5"
        >
          <p className="text-lg font-bold text-danger-foreground">
            {openCount} safeguarding incident{openCount === 1 ? '' : 's'} waiting
            for review
          </p>
          {oldestDays !== null && (
            <p className="mt-1 text-sm text-danger-foreground">
              The oldest has been waiting{' '}
              {oldestDays === 0 ? 'less than a day' : `${oldestDays} days`}.
            </p>
          )}
          <Link
            to="/school-admin/safeguarding"
            className="mt-3 inline-block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
          >
            Review them
          </Link>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Students"
          value={students.isSuccess ? students.data.length : undefined}
          icon="students"
          hint="Active at school"
        />

        <StatTile
          label="Logs this week"
          value={summary.isSuccess ? (s?.logs_last_7_days ?? 0) : undefined}
          icon="observations"
          hint="Last 7 days"
        />

        {/* `openCount` was `s?.flagged_open ?? 0`, which is 0 when there are
            none AND 0 when the query failed — on the safeguarding figure, of
            all of them. StatTile takes undefined for "not known" so that
            cannot be expressed. */}
        <StatTile
          label="Open safeguarding"
          value={summary.isSuccess ? openCount : undefined}
          icon="safeguarding"
          tone={openCount > 0 && summary.isSuccess ? 'danger' : 'default'}
          hint={
            !summary.isSuccess ? undefined : openCount === 0 ? (
              <span className="font-medium text-success-foreground">
                Nothing outstanding
              </span>
            ) : (
              <span className="text-muted-foreground">Needs a decision</span>
            )
          }
        />

        <StatTile
          label="Flagged all time"
          value={summary.isSuccess ? (s?.flagged_total ?? 0) : undefined}
          icon="audit"
          hint={
            summary.isSuccess
              ? `${(s?.flagged_total ?? 0) - openCount} acknowledged`
              : undefined
          }
        />
      </div>

      <div className="mt-8 rounded-card border border-border bg-card shadow-raised p-5">
        <h2 className="font-semibold text-foreground">
          About these numbers
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Every figure here is counted from behaviour logs at your school in
          real time — there is no stored score and nothing is estimated. The
          Figma design for this page showed an &ldquo;Audit Readiness Score&rdquo;
          of 92%; nothing in this system could calculate that honestly, so it
          was replaced with figures you can check against the data.
        </p>
      </div>
    </div>
  )
}
