import { useQuery } from '@tanstack/react-query'
import { fetchMyMemberships, queryKeys } from '../lib/api'
import { useAuth } from '../lib/auth'
import Icon from './Icon'

/**
 * Names the tenant an educator is acting in before they read or create data.
 *
 * The global context switcher intentionally disappears for people with one
 * membership. That keeps the shell quiet, but it also leaves an educator with
 * no visible confirmation of which school's records they are using. This
 * educator-only line is deliberately repeated on the few screens where school
 * context changes the meaning of an action.
 */
export default function EducatorSchoolContext() {
  const { profile } = useAuth()
  const memberships = useQuery({
    queryKey: queryKeys.myMemberships,
    queryFn: fetchMyMemberships,
    enabled: profile?.role === 'educator',
    staleTime: 5 * 60 * 1000,
  })

  if (profile?.role !== 'educator') return null

  const current = memberships.data?.find((membership) => membership.is_current)
  const hasSeveral = (memberships.data?.length ?? 0) > 1

  if (!profile.school_id || (memberships.isSuccess && !current)) {
    return (
      <div
        role="alert"
        className="mt-3 flex max-w-prose gap-2 rounded-btn border border-warning bg-warning-subtle px-3 py-2 text-sm text-warning-foreground"
      >
        <Icon name="schools" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          No active school is selected. Ask a school administrator to confirm
          your membership before working with student records.
        </span>
      </div>
    )
  }

  if (memberships.isError) {
    return (
      <p className="mt-3 max-w-prose text-sm text-muted-foreground">
        Your active school could not be named. Student access is still limited
        by your current school membership.
      </p>
    )
  }

  if (!current) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Confirming your current school…
      </p>
    )
  }

  /*
   * SILENT WHEN THERE IS NOTHING TO DISAMBIGUATE.
   *
   * The three states above stay: a missing school, a failed lookup and a
   * pending one all change what the reader should trust, and they must be
   * said. This last one did not — an educator who belongs to exactly one
   * school already knows which school they work at, and the line was repeating
   * it on every screen. On the student record at 375px it wrapped to three
   * lines and was the single largest contributor to a 248px header, pushing
   * the child's actual record below the fold.
   *
   * It still appears the moment it carries information: somebody with more
   * than one membership genuinely needs to know which one is active, because
   * it decides which students exist.
   */
  if (!hasSeveral) return null

  return (
    <div className="mt-3 flex max-w-prose items-start gap-2 text-sm text-muted-foreground">
      <Icon name="schools" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p>
        Working at{' '}
        <strong className="font-semibold text-foreground">
          {current.organisation_name}
        </strong>
        . Only this school&rsquo;s students and conversations are shown.
      </p>
    </div>
  )
}
