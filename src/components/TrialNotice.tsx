import { useQuery } from '@tanstack/react-query'
import { fetchSchools, queryKeys } from '../lib/api'
import { useAuth } from '../lib/auth'

/**
 * "Your school is on a trial", shown to the school.
 *
 * THE DATA EXISTED AND NOBODY COULD SEE IT. `db/053` settled that a school is
 * active, trial, suspended or closed, and `AddSchoolSection` opens every new
 * one on trial — then the only place that status appeared was Special Miles'
 * own tenant list. The school it describes was never told.
 *
 * SHOWN ONLY WHEN IT IS TRUE. A badge reading "Active" on every screen forever
 * is furniture; nobody reads furniture. This renders for a trial and nothing
 * else, so when it does appear it means something.
 *
 * NO COUNTDOWN, and that is not an oversight. Customer.io shows "14 days left"
 * because a self-serve trial has a hard end date in the database. MiZanova has
 * no trial end date and no billing clock — a school is invoiced after a
 * conversation. Inventing "23 days left" would be the twelfth entry in the
 * fault table.
 */
export default function TrialNotice() {
  const { profile } = useAuth()

  const schools = useQuery({
    queryKey: queryKeys.schools,
    queryFn: fetchSchools,
    // Platform admins see every school and are not "on" any of them.
    enabled: Boolean(profile?.school_id) && profile?.role !== 'platform_admin',
  })

  /*
   * A FAILED LOOKUP HIDES THIS, AND THAT IS THE RIGHT BEHAVIOUR HERE.
   *
   * Everywhere else in this project, treating a failed query as "nothing" is
   * the bug — a count of 0 that means "could not check" has been fixed seven
   * times. This is the exception, and the difference is what the thing says: a
   * NOTICE that might be wrong is worse than one that is briefly absent. Saying
   * "we could not check your status" in the sidebar of every page, on every
   * blip, would be noise nobody can act on, and the banner returns on the next
   * load.
   *
   * Left as it is deliberately, and written down so it is not "fixed" later by
   * somebody sweeping for this pattern — which is exactly what happened today.
   */
  const mine = schools.data?.find((s) => s.id === profile?.school_id)
  if (mine?.status !== 'trial') return null

  return (
    <p className="mb-2 rounded-btn bg-white/10 px-3 py-2 text-xs text-sidebar-foreground">
      <span className="font-semibold">Trial</span>
      <span className="mt-0.5 block text-sidebar-muted">
        {mine.name} is being evaluated. Everything works normally.
      </span>
    </p>
  )
}
