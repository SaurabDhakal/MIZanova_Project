import { useQuery } from '@tanstack/react-query'
import { fetchMyGoals, queryKeys, type StudentGoal } from '../../lib/api'
import { GOAL_CATEGORY_LABEL } from '../../lib/goalCategories'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import PageHeader, { PageNote } from '../../components/PageHeader'

/**
 * What a student sees — db/074.
 *
 * ---------------------------------------------------------------------------
 * THE WHOLE ROLE IS THIS ONE SCREEN, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------
 * The brief asks for student accounts and names what they are for: "self-
 * advocacy and resilience development", "executive functioning and study
 * skills". That is a young person working on what they are trying to get
 * better at.
 *
 * It is NOT a small version of the parent portal. db/074 gives a student their
 * own goals and nothing else — no behaviour logs, no IEP, no messages, no
 * safeguarding, not even the list of who has read their file. Those decisions
 * are argued in that migration and the tests assert every one of them.
 *
 * So there is one screen, because there is one thing a student may see. Adding
 * a nav item that led to an empty page would suggest the rest is coming.
 *
 * ---------------------------------------------------------------------------
 * IT IS READ ONLY
 * ---------------------------------------------------------------------------
 * A student cannot tick their own milestone or mark a goal achieved. Progress
 * here is a claim about what somebody managed in class, and the people teaching
 * them are the ones who record it — a self-marked goal would quietly become
 * evidence in an IEP review that nobody verified.
 *
 * Telling somebody what they are working towards is worth doing on its own.
 */

const STATUS_LABEL: Record<StudentGoal['status'], string> = {
  not_started: 'Not started yet',
  on_track: 'Going well',
  needs_review: 'Being looked at',
  achieved: 'Done',
  discontinued: 'Stopped',
}

/*
 * PLAIN WORDS, NOT THE DATABASE'S. "needs_review" is staff vocabulary and reads
 * to a young person as "you are failing"; it means an adult wants to look at
 * whether the goal is still the right one. "discontinued" reads as being given
 * up on. Neither is what the status means, and this is the one screen where the
 * reader is the person the words are about.
 */
const STATUS_STYLE: Record<StudentGoal['status'], string> = {
  not_started: 'bg-background text-muted-foreground',
  on_track: 'bg-success-subtle text-success-foreground',
  needs_review: 'bg-warning-subtle text-warning-foreground',
  achieved: 'bg-success-subtle text-success-foreground',
  discontinued: 'bg-background text-muted-foreground',
}

export default function MyGoals() {
  const goals = useQuery({ queryKey: queryKeys.myGoals, queryFn: fetchMyGoals })

  if (goals.isPending) return <LoadingCards count={3} />
  if (goals.isError) return <ErrorState message={goals.error.message} />

  /*
   * Stopped goals are not shown. A young person reading a list of things that
   * were abandoned learns nothing they can act on, and the reason a goal was
   * discontinued is usually a conversation somebody had about them rather than
   * with them.
   */
  const live = goals.data.filter((g) => g.status !== 'discontinued')
  const working = live.filter((g) => g.status !== 'achieved')
  const done = live.filter((g) => g.status === 'achieved')

  return (
    <div>
      <PageHeader
        title="My goals"
        lead="What you are working on at school, and how it is going."
      />

      {live.length === 0 ? (
        <EmptyState
          title="No goals yet"
          detail="When your school sets a goal with you, it will show up here."
        />
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Working on{' '}
            <span className="font-normal text-muted-foreground">
              ({working.length})
            </span>
          </h2>
          {working.length === 0 ? (
            <p className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
              Nothing on the go right now.
            </p>
          ) : (
            <ul className="space-y-3">
              {working.map((g) => (
                <GoalCard key={g.id} goal={g} />
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <>
              <h2 className="mt-8 mb-3 text-lg font-semibold text-foreground">
                Done{' '}
                <span className="font-normal text-muted-foreground">
                  ({done.length})
                </span>
              </h2>
              <ul className="space-y-3">
                {done.map((g) => (
                  <GoalCard key={g.id} goal={g} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <PageNote>
        Your teachers and the specialists you work with set these goals and tick
        things off as you go, so you cannot change them here. If a goal does not
        look right, or you want to work on something else, say so to your
        teacher — that conversation is the point of having them written down.
      </PageNote>
    </div>
  )
}

function GoalCard({ goal }: { goal: StudentGoal }) {
  const steps = goal.goal_milestones ?? []
  const doneCount = steps.filter((m) => m.is_done).length

  return (
    <li className="rounded-card border border-border bg-card shadow-raised p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-semibold text-foreground">{goal.title}</p>
        <span
          className={`rounded-btn px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[goal.status]}`}
        >
          {STATUS_LABEL[goal.status]}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {GOAL_CATEGORY_LABEL[goal.category]}
        </span>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{goal.description}</p>

      {steps.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Steps — {doneCount} of {steps.length}
          </p>
          <ul className="mt-2 space-y-1.5">
            {steps.map((m) => (
              <li key={m.id} className="flex items-start gap-2 text-sm">
                {/*
                  A tick or an empty circle, drawn rather than a checkbox. A
                  real checkbox invites a click that does nothing, and an
                  input a student cannot use is worse than a picture of one.
                */}
                <span
                  aria-hidden="true"
                  className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[0.6rem] ${
                    m.is_done
                      ? 'border-success bg-success-subtle text-success-foreground'
                      : 'border-border text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span
                  className={
                    m.is_done ? 'text-muted-foreground' : 'text-foreground'
                  }
                >
                  {m.title}
                  <span className="sr-only">
                    {m.is_done ? ' — done' : ' — not done yet'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}
