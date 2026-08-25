import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchGoals,
  fetchHomeObservations,
  fetchSharedLogs,
  queryKeys,
  type BehaviourType,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useSelectedChild } from '../../hooks/useMyChildren'
import ChildSwitcher from '../../components/ChildSwitcher'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import NoChildYet from '../../components/NoChildYet'

/**
 * Parent home — docs/Figma Pages Design/Parent Home Dashboard.png.
 *
 * Mobile-first (NFR3): a parent reads this on a phone, often standing up.
 * Single column by default, widening on larger screens.
 *
 * The child is referred to by `display_name` throughout. For a parent's OWN
 * child that is a design choice rather than a protection — they obviously know
 * their child's surname. The protection is Row-Level Security, which means a
 * parent never receives a row about anyone else's child in the first place.
 * Using the short form here keeps the two consistent and means a screenshot of
 * this page, shared in a group chat, carries no surname.
 */

const TYPE_LABEL: Record<BehaviourType, string> = {
  disruptive: 'Disruptive',
  withdrawn: 'Withdrawn',
  emotional: 'Emotional',
  physical: 'Physical',
}

function relativeDay(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const days = Math.round(
    (today.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) /
      86_400_000,
  )
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function ParentDashboard() {
  const { profile } = useAuth()
  const { children, child, selectChild, isPending, isError, error } =
    useSelectedChild()

  const logs = useQuery({
    queryKey: queryKeys.sharedLogs(child?.id ?? ''),
    queryFn: () => fetchSharedLogs(child!.id),
    enabled: Boolean(child),
  })

  const observations = useQuery({
    queryKey: queryKeys.homeObservations(child?.id ?? ''),
    queryFn: () => fetchHomeObservations(child!.id),
    enabled: Boolean(child),
  })

  const goals = useQuery({
    queryKey: queryKeys.goals(child?.id ?? ''),
    queryFn: () => fetchGoals(child!.id),
    enabled: Boolean(child),
  })

  if (isPending) return <LoadingCards count={2} />
  if (isError) return <ErrorState message={error?.message ?? 'Unknown error'} />

  if (!child) {
    return (
      <NoChildYet thing="Your child’s daily updates" />
    )
  }

  const shared = logs.data ?? []
  const latest = shared[0]

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">
          Welcome back{profile?.first_name ? `, ${profile.first_name}` : ''} 👋
        </h1>
        <p className="mt-1 text-muted-foreground">
          Here is the latest on {child.display_name}.
        </p>
      </header>

      <ChildSwitcher children={children} child={child} onSelect={selectChild} />


      {/* --- Today's update ------------------------------------------------ */}
      {latest ? (
        <div className="rounded-card border border-border bg-primary-subtle p-5">
          <p className="text-sm font-semibold text-primary">
            Update from school · {relativeDay(latest.occurred_at)}
          </p>
          <p className="mt-1 font-semibold text-foreground">
            {TYPE_LABEL[latest.behaviour_type]} · {latest.intensity} intensity
          </p>
          {latest.notes && (
            <p className="mt-2 text-foreground">{latest.notes}</p>
          )}
        </div>
      ) : (
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="font-semibold text-foreground">
            No updates shared with you yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Teachers choose which observations to share with families. When they
            do, they appear here.
          </p>
        </div>
      )}

      {/* --- Counts -------------------------------------------------------- */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Goal progress
          </p>
          {(() => {
            const active = (goals.data ?? []).filter(
              (g) => g.status !== 'achieved' && g.status !== 'discontinued',
            )
            if (goals.isPending) {
              return <p className="mt-2 text-4xl font-bold text-foreground">—</p>
            }
            /*
             * A FAILED QUERY IS NOT A CHILD WITH NO GOALS.
             *
             * This checked isPending and stopped. On an error `goals.data` is
             * undefined, `active` falls through to an empty array, and the next
             * branch told a parent "No active goals yet" — about their own
             * child, who may have four. Every other version of this fault in
             * the product showed a wrong number to staff; this one told a
             * family something untrue about their child, on the screen they
             * open most.
             */
            if (goals.isError) {
              return (
                <>
                  <p className="mt-2 text-4xl font-bold text-danger-foreground">
                    ?
                  </p>
                  <p className="mt-1 text-sm text-danger-foreground">
                    Goals could not be loaded just now. This is unknown, not
                    none — try again in a moment.
                  </p>
                </>
              )
            }
            if (active.length === 0) {
              return (
                <p className="mt-2 text-sm text-muted-foreground">
                  No active goals yet.
                </p>
              )
            }
            // Plain average across active goals. Not weighted by anything:
            // a weighting the family cannot see would make the number
            // unexplainable, and an unexplainable number is worse than none.
            const average = Math.round(
              active.reduce((sum, g) => sum + g.progress_percent, 0) /
                active.length,
            )
            return (
              <>
                <p className="mt-2 text-4xl font-bold text-foreground">
                  {average}%
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Average across {active.length} active goal
                  {active.length === 1 ? '' : 's'}
                </p>
                <Link
                  to="/parent/goals"
                  className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                >
                  View goals →
                </Link>
              </>
            )
          })()}
        </div>

        {/*
          A NUMBER ONLY WHEN THE QUESTION WAS ACTUALLY ANSWERED.

          These read `isPending ? '—' : count`, which is not the same thing.
          A failed query is not pending, so it fell through to the count — and
          `observations.data?.length ?? 0` turned "we could not ask" into a
          confident 0. The observations tile had no error state anywhere on the
          page either, so a parent whose query failed was told plainly that
          they had recorded nothing about their child.

          That is the worse half. A parent reading "0" does not suspect an
          outage; they suspect their notes were lost, and may write them again.

          `isSuccess` is the only state where a count is a fact. Everything
          else — loading, error, disabled — shows an em dash, and an error says
          so beneath the number rather than leaving the tile to speak alone.
        */}
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Updates shared with you
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {logs.isSuccess ? shared.length : '—'}
          </p>
          {logs.isError && (
            <p className="mt-1 text-sm text-muted-foreground">
              Could not be loaded
            </p>
          )}
        </div>

        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Your home observations
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {observations.isSuccess ? observations.data.length : '—'}
          </p>
          {observations.isError && (
            <p className="mt-1 text-sm text-muted-foreground">
              Could not be loaded
            </p>
          )}
          <Link
            to="/parent/observations"
            className="mt-3 inline-block rounded-btn bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Log an observation
          </Link>
        </div>
      </div>

      {/* --- Recent updates ------------------------------------------------ */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Recent updates from school
      </h2>

      {logs.isError && <ErrorState message={logs.error.message} />}

      {logs.isSuccess && shared.length === 0 && (
        <EmptyState
          title="Nothing shared yet"
          detail="This is normal early on. Teachers share updates deliberately rather than automatically."
        />
      )}

      {shared.length > 0 && (
        <ul className="space-y-3">
          {shared.map((log) => (
            <li
              key={log.id}
              className="rounded-card border border-border bg-card shadow-raised p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-btn bg-background px-2.5 py-1 text-sm font-medium text-foreground">
                  {TYPE_LABEL[log.behaviour_type]}
                </span>
                <span className="text-sm text-muted-foreground">
                  {log.intensity} intensity
                </span>
                <span className="ml-auto text-sm text-muted-foreground">
                  {relativeDay(log.occurred_at)}
                </span>
              </div>
              {log.notes && (
                <p className="mt-2 text-foreground">{log.notes}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
