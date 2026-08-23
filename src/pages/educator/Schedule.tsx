import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchStudents, fetchUpcomingGoals, queryKeys } from '../../lib/api'
import { GOAL_CATEGORY_LABEL } from '../../lib/goalCategories'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import EducatorSchoolContext from '../../components/EducatorSchoolContext'

/**
 * Educator schedule — what is coming up for the children you teach.
 *
 * THE LAST PLACEHOLDER IN THE PRODUCT, and it is not a calendar. The same
 * reasoning as the specialist's: nothing in MiZanova books anything. There are
 * no slots, no availability, no invitations and no reminders, so a week grid
 * would be a picture of a feature, and every empty cell would be a promise
 * that something could be dropped into it.
 *
 * WHAT A TEACHER ACTUALLY HAS DATED. Two things, and only two:
 *
 *   goal target dates    "Maya's communication goal targets 30 September"
 *   nothing else         behaviour logs are a record of the past; messages
 *                        have no date to fall due; IEP documents carry the
 *                        date they were written, not a review date
 *
 * So this screen is built from goal target dates, and says so. A screen that
 * padded itself out with today's behaviour logs to look busier would be
 * answering a question nobody asked on a page titled Schedule.
 *
 * OVERDUE COMES FIRST AND IS NOT SOFTENED. A goal whose target date has passed
 * is the single thing on this page somebody needs to act on, and calling it
 * "due" rather than "overdue" would be the product being polite about its own
 * bad news.
 */

/** Whole days from today. Negative once the date has gone. */
function daysUntil(iso: string): number {
  const then = new Date(iso)
  const now = new Date()
  then.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.round((then.getTime() - now.getTime()) / 86_400_000)
}

function whenLabel(days: number): string {
  if (days < 0) {
    const gone = Math.abs(days)
    return `${gone} day${gone === 1 ? '' : 's'} overdue`
  }
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days <= 14) return `in ${days} days`
  return `in ${Math.round(days / 7)} weeks`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function GoalLine({
  goal,
  studentName,
}: {
  goal: {
    id: string
    student_id: string
    title: string
    target_date: string | null
    progress_percent: number
    category: keyof typeof GOAL_CATEGORY_LABEL
    goal_milestones: { is_done: boolean }[]
  }
  studentName: string
}) {
  const days = daysUntil(goal.target_date!)
  const overdue = days < 0
  const done = goal.goal_milestones.filter((m) => m.is_done).length

  return (
    <li
      className={`rounded-card border bg-card p-4 ${
        overdue ? 'border-danger' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link
          to={`/educator/students/${goal.student_id}`}
          className="font-semibold text-primary hover:underline"
        >
          {studentName}
        </Link>
        <span className="rounded-btn bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {GOAL_CATEGORY_LABEL[goal.category]}
        </span>
        <span
          className={`rounded-btn px-2.5 py-0.5 text-xs font-semibold ${
            overdue
              ? 'bg-danger-subtle text-danger-foreground'
              : days <= 14
                ? 'bg-warning-subtle text-warning-foreground'
                : 'bg-background text-muted-foreground'
          }`}
        >
          {whenLabel(days)}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          {formatDate(goal.target_date!)}
        </span>
      </div>

      <p className="mt-1 text-foreground">{goal.title}</p>

      <div className="mt-2 flex items-center gap-3">
        <div
          role="img"
          aria-label={`${goal.progress_percent} percent complete`}
          className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-background"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${goal.progress_percent}%` }}
          />
        </div>
        <span className="text-sm font-semibold text-primary">
          {goal.progress_percent}%
        </span>
        {goal.goal_milestones.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {done} of {goal.goal_milestones.length} steps
          </span>
        )}
      </div>
    </li>
  )
}

export default function Schedule() {
  const goals = useQuery({
    queryKey: queryKeys.upcomingGoals,
    queryFn: fetchUpcomingGoals,
  })
  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })

  if (goals.isPending) return <LoadingCards count={3} />
  if (goals.isError) return <ErrorState message={goals.error.message} />

  /*
   * The roster is what turns a student_id into a name. If it failed, names are
   * unknown — and saying "Unknown student" is better than silently dropping
   * the row, which would make a page about things falling due look emptier
   * than it is.
   */
  const byId = new Map(
    (students.data ?? []).map((s) => [s.id, `${s.first_name} ${s.last_name}`]),
  )
  const nameOf = (id: string) => byId.get(id) ?? 'A student'

  const overdue = goals.data.filter((g) => daysUntil(g.target_date!) < 0)
  const soon = goals.data.filter((g) => {
    const days = daysUntil(g.target_date!)
    return days >= 0 && days <= 60
  })
  const later = goals.data.filter((g) => daysUntil(g.target_date!) > 60)

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Schedule</h1>
        <p className="mt-1 text-muted-foreground">
          Goal target dates for the children you are assigned to, soonest
          first.
        </p>
        <EducatorSchoolContext />
      </header>

      {/* AN EMPTY PAGE HERE IS ORDINARY, NOT BROKEN, and it says which.
          A target date is optional when a goal is written, so a teacher who
          has never set one sees nothing — and "Nothing has a date yet" with no
          explanation is indistinguishable from a screen that failed. It names
          the reason and links to where the date is set. */}
      {goals.data.length === 0 && (
        <div className="rounded-card border border-border bg-card shadow-raised p-8 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            None of your goals has a target date
          </h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
            A target date is optional when you write a goal, and nothing here
            has one yet. Add a date to a goal and it will appear on this page,
            soonest first — overdue ones at the top.
          </p>
          <Link
            to="/educator/students"
            className="mt-5 inline-block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
          >
            Open a student
          </Link>
        </div>
      )}

      {overdue.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-danger-foreground">
            Overdue ({overdue.length})
          </h2>
          <ul className="space-y-3">
            {overdue.map((goal) => (
              <GoalLine key={goal.id} goal={goal} studentName={nameOf(goal.student_id)} />
            ))}
          </ul>
        </section>
      )}

      {soon.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Next 60 days ({soon.length})
          </h2>
          <ul className="space-y-3">
            {soon.map((goal) => (
              <GoalLine key={goal.id} goal={goal} studentName={nameOf(goal.student_id)} />
            ))}
          </ul>
        </section>
      )}

      {later.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Later ({later.length})
          </h2>
          <ul className="space-y-3">
            {later.map((goal) => (
              <GoalLine key={goal.id} goal={goal} studentName={nameOf(goal.student_id)} />
            ))}
          </ul>
        </section>
      )}

      {/* Said once, at the bottom, rather than as an empty calendar grid that
          implies the opposite on every screen it appears on. */}
      <p className="mt-6 max-w-prose text-sm text-muted-foreground">
        <strong className="font-semibold text-foreground">
          This is not a booking calendar.
        </strong>{' '}
        MiZanova has no appointment slots, no availability and no reminders, so
        there is nothing here to book or move. What it shows is the only thing
        the system has a date for: the targets set on your students&rsquo;
        goals. Session booking is a separate piece of work with its own tables.
      </p>
    </div>
  )
}
