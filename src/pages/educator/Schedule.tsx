import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchStudents, fetchUpcomingGoals, queryKeys } from '../../lib/api'
import { GOAL_CATEGORY_LABEL } from '../../lib/goalCategories'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import EducatorSchoolContext from '../../components/EducatorSchoolContext'
import AppointmentCalendar from '../../components/AppointmentCalendar'
import type { CalendarAppointment } from '../../components/AppointmentCalendar'

/**
 * Educator schedule — what is coming up for the children you teach.
 *
 * A MONTH GRID OVER A LIST, and the grid draws dates, not bookings. Nothing in
 * MiZanova books a teacher: there are no slots, no availability, no invitations
 * and no reminders, and RLS does not even let an educator read the specialist
 * appointment table (db/059 admits the assigned specialist, the platform admin
 * and, since db/073, the family — nobody else). So a grid of hours here would
 * be a picture of a feature, and every empty cell a promise something could be
 * dropped into it.
 *
 * WHAT IT DRAWS INSTEAD is the goal target dates below, on the day each falls
 * due, as all-day events — because a target date names a day and never an
 * hour. The calendar and the list are the same goals in two shapes: the list
 * answers "what is coming", the month answers "when is my crunch", and the
 * filters govern both. The note at the foot says the grid is not bookable,
 * which matters more now that there is a grid to misread.
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
  const navigate = useNavigate()
  const [studentFilter, setStudentFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFilter, setDateFilter] = useState<
    '' | 'overdue' | 'next-60' | 'later'
  >('')
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

  const totalOverdue = goals.data.filter((g) => daysUntil(g.target_date!) < 0)
    .length
  const dueNext14Days = goals.data.filter((g) => {
    const days = daysUntil(g.target_date!)
    return days >= 0 && days <= 14
  }).length
  const averageProgress =
    goals.data.length === 0
      ? 0
      : Math.round(
          goals.data.reduce((total, goal) => total + goal.progress_percent, 0) /
            goals.data.length,
        )

  const visibleGoals = goals.data.filter((goal) => {
    const days = daysUntil(goal.target_date!)
    const matchesDate =
      dateFilter === '' ||
      (dateFilter === 'overdue' && days < 0) ||
      (dateFilter === 'next-60' && days >= 0 && days <= 60) ||
      (dateFilter === 'later' && days > 60)
    return (
      (studentFilter === '' || goal.student_id === studentFilter) &&
      (categoryFilter === '' || goal.category === categoryFilter) &&
      matchesDate
    )
  })

  const overdue = visibleGoals.filter((g) => daysUntil(g.target_date!) < 0)
  const soon = visibleGoals.filter((g) => {
    const days = daysUntil(g.target_date!)
    return days >= 0 && days <= 60
  })
  const later = visibleGoals.filter((g) => daysUntil(g.target_date!) > 60)
  const filtersActive = Boolean(studentFilter || categoryFilter || dateFilter)

  /*
   * The goals the lists below draw, in the shape the calendar reads.
   *
   * `duration_minutes` is 0 and never used — these are all-day events, so the
   * component omits the end rather than computing start + 0ms and drawing a
   * sliver nobody can click. `status` is only what picks the colour, and the
   * cut is 14 days to agree with the tile above it; the sections underneath
   * split at 60 because a list can afford a wider bucket, where a month grid
   * showing about thirty days would render every one of them amber.
   */
  const calendarGoals: CalendarAppointment[] = visibleGoals.map((goal) => {
    const days = daysUntil(goal.target_date!)
    return {
      id: goal.id,
      student_id: goal.student_id,
      starts_at: goal.target_date!,
      duration_minutes: 0,
      status: days < 0 ? 'overdue' : days <= 14 ? 'soon' : 'later',
    }
  })

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

      {goals.data.length > 0 && (
        <>
          <dl className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-card border border-border bg-card p-4 shadow-raised">
              <dt className="text-sm text-muted-foreground">Dated goals</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {goals.data.length}
              </dd>
            </div>
            <div className="rounded-card border border-border bg-card p-4 shadow-raised">
              <dt className="text-sm text-muted-foreground">Overdue</dt>
              <dd className="mt-1 text-2xl font-semibold text-danger-foreground">
                {totalOverdue}
              </dd>
            </div>
            <div className="rounded-card border border-border bg-card p-4 shadow-raised">
              <dt className="text-sm text-muted-foreground">Due in 14 days</dt>
              <dd className="mt-1 text-2xl font-semibold text-warning-foreground">
                {dueNext14Days}
              </dd>
            </div>
            <div className="rounded-card border border-border bg-card p-4 shadow-raised">
              <dt className="text-sm text-muted-foreground">Average progress</dt>
              <dd className="mt-1 text-2xl font-semibold text-primary">
                {averageProgress}%
              </dd>
            </div>
          </dl>

          <div className="mb-6 flex flex-wrap items-end gap-3 rounded-card border border-border bg-card p-4 shadow-raised">
            <label className="text-sm font-medium text-muted-foreground">
              Student
              <select
                value={studentFilter}
                onChange={(event) => setStudentFilter(event.target.value)}
                className="mt-1 block max-w-56 rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              >
                <option value="">All students</option>
                {(students.data ?? []).map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.first_name} {student.last_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-muted-foreground">
              Goal category
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-1 block rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              >
                <option value="">All categories</option>
                {Object.entries(GOAL_CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-muted-foreground">
              Target date
              <select
                value={dateFilter}
                onChange={(event) =>
                  setDateFilter(
                    event.target.value as
                      | ''
                      | 'overdue'
                      | 'next-60'
                      | 'later',
                  )
                }
                className="mt-1 block rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              >
                <option value="">Any date</option>
                <option value="overdue">Overdue</option>
                <option value="next-60">Next 60 days</option>
                <option value="later">More than 60 days</option>
              </select>
            </label>

            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setStudentFilter('')
                  setCategoryFilter('')
                  setDateFilter('')
                }}
                className="rounded-btn border border-border px-3 py-2.5 text-sm font-semibold hover:bg-background"
              >
                Clear filters
              </button>
            )}

            <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
              Showing {visibleGoals.length} of {goals.data.length} goals
            </p>
          </div>
        </>
      )}

      {visibleGoals.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              When they fall due
            </h2>
            <p className="text-sm text-muted-foreground">
              Click a goal to open the child&rsquo;s record. The filters above
              narrow this too.
            </p>
          </div>

          {/* No onPickSlot. There is nothing to book, and the component drops
              the pointer cursor and the hover state when the handler is absent
              rather than inviting a press that would do nothing. */}
          <AppointmentCalendar
            appointments={calendarGoals}
            nameOf={nameOf}
            currentUserId={null}
            selectedId={null}
            initialView="dayGridMonth"
            allDay
            onSelect={(goal) =>
              void navigate(`/educator/students/${goal.student_id}`)
            }
          />

          {/* COLOUR IS NOT THE ONLY CARRIER. A block in the grid says whose
              goal it is and nothing about urgency but its fill, so the words
              are given here — and the lists underneath are the same goals with
              "3 days overdue" written out, on the same screen. */}
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-sm bg-danger-strong"
              />
              Overdue
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-sm bg-warning-foreground"
              />
              Due within 14 days
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-sm bg-primary"
              />
              Later
            </li>
          </ul>
        </section>
      )}

      {goals.data.length > 0 && visibleGoals.length === 0 && (
        <div className="mb-8 rounded-card border border-border bg-card p-8 text-center shadow-raised">
          <h2 className="text-lg font-semibold text-foreground">
            No goals match these filters
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Clear one or more filters to bring the other dated goals back.
          </p>
          <button
            type="button"
            onClick={() => {
              setStudentFilter('')
              setCategoryFilter('')
              setDateFilter('')
            }}
            className="mt-4 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
          >
            Show all goals
          </button>
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

      {/* SAID ONCE, AND NOW LOAD-BEARING. The month grid above is the shape
          people read as a diary, so the sentence that it books nothing is
          more necessary with it than it was without it. */}
      <p className="mt-6 max-w-prose text-sm text-muted-foreground">
        <strong className="font-semibold text-foreground">
          This is not a booking calendar.
        </strong>{' '}
        MiZanova has no appointment slots, no availability and no reminders, so
        there is nothing here to book or move, and an empty day means nothing
        falls due on it rather than that you are free. What it shows is the
        only thing the system has a date for: the targets set on your
        students&rsquo; goals, drawn on the day each is due. A specialist&rsquo;s
        bookings are a separate table, and a teacher is not given sight of it.
      </p>
    </div>
  )
}
