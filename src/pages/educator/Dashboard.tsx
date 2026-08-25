import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchAiQuota,
  fetchAllHomeObservations,
  fetchClassroomStats,
  fetchRecentLogs,
  fetchStudents,
  fetchThreads,
  fetchUpcomingGoals,
  queryKeys,
  type StudentRow,
  unreadMessagesInThread,
} from '../../lib/api'
import BehaviourLogModal from '../../components/BehaviourLogModal'
import { useAuth } from '../../lib/auth'
import {
  EmptyState,
  ErrorState,
  LoadingCards,
} from '../../components/QueryState'
import Icon from '../../components/Icon'
import Avatar from '../../components/Avatar'
import EducatorSchoolContext from '../../components/EducatorSchoolContext'

/**
 * Classroom Overview — the educator's landing screen.
 * Built from docs/Figma Pages Design/Classroom Overview Dashboard.png.
 *
 * Every number here is a real count from the database. When the tiles read
 * zero, that is the truth about an empty table, not a placeholder waiting to
 * be wired up later.
 */

/**
 * What is actually waiting for this teacher.
 *
 * REPLACES THREE TILES THAT COUNTED THINGS NOBODY ACTS ON. "Total students: 4"
 * is not news to the person who teaches them, and "Recent logs: 1" prompts
 * nothing. The third tile was worse than useless: it counted every log ever
 * flagged under the heading "Needs review", so on real data it read 9 when 3
 * were open and 6 had been acknowledged days earlier — and it linked nowhere,
 * so a teacher could not have reviewed them even if the number had been right.
 *
 * WHAT A FLAG MEANS TO A TEACHER, precisely. It does not mean "review this":
 * db/010 gives acknowledgement to administrators. It means the incident is with
 * the office AND the teacher can still edit it until somebody there reads it.
 * That window is the actionable fact, so that is what this says.
 *
 * The shape is Customer.io's Home checklist (docs/screenshots for inspiration/
 * Customer.io Web Home): a count, then linked lines, and a settled state that
 * still shows what was there rather than rendering an empty box.
 */
/*
 * COULD NOT CHECK IS NOT NOTHING TO DO.
 *
 * Every count here arrived as a plain number derived from `data ?? []`, and
 * every item is rendered by a `> 0` test. So a failed query became a zero,
 * the zero failed the test, and the item simply was not there — a teacher
 * opening this screen during an outage is told nothing needs them, in the
 * same calm words as a teacher who genuinely has a clear morning.
 *
 * `undefined` now means the question could not be answered, and it produces
 * its own line rather than silence. This is the same rule the notification
 * bell already follows.
 */
type Count = number | undefined

function NeedsYou({
  flaggedOpen,
  overdueGoals,
  homeNotes,
  unreadMessages,
  logsLast24h,
}: {
  flaggedOpen: Count
  overdueGoals: Count
  homeNotes: Count
  unreadMessages: Count
  logsLast24h: number
}) {
  const unknown = [
    flaggedOpen === undefined && 'flagged incidents',
    overdueGoals === undefined && 'goal target dates',
    unreadMessages === undefined && 'unread messages',
    homeNotes === undefined && 'notes from home',
  ].filter(Boolean) as string[]

  const items = [
    ((flaggedOpen ?? 0) > 0) && {
      key: 'flags',
      icon: 'safeguarding' as const,
      tone: 'danger' as const,
      text: `${flaggedOpen} flagged incident${flaggedOpen === 1 ? '' : 's'} with the office`,
      detail:
        'You can still add detail until an administrator acknowledges it. After that it is locked.',
      to: '/educator/students',
    },
    ((overdueGoals ?? 0) > 0) && {
      key: 'goals',
      icon: 'goals' as const,
      tone: 'warning' as const,
      text: `${overdueGoals} goal${overdueGoals === 1 ? '' : 's'} past its target date`,
      detail: 'Either the date moves or the goal does.',
      to: '/educator/schedule',
    },
    ((unreadMessages ?? 0) > 0) && {
      key: 'messages',
      icon: 'messages' as const,
      tone: 'default' as const,
      text: `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`,
      detail: 'Replies from families you have not opened yet.',
      to: '/educator/messages',
    },
    ((homeNotes ?? 0) > 0) && {
      key: 'home',
      icon: 'home' as const,
      tone: 'default' as const,
      text: `${homeNotes} note${homeNotes === 1 ? '' : 's'} shared from home`,
      detail: 'Available in the students’ records. These are not labelled unread.',
      to: '/educator/students',
    },
  ].filter(Boolean) as {
    key: string
    icon: 'safeguarding' | 'goals' | 'home' | 'messages'
    tone: 'danger' | 'warning' | 'default'
    text: string
    detail: string
    to: string
  }[]

  const RAIL = {
    danger: 'border-danger',
    warning: 'border-warning',
    default: 'border-border',
  }

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-raised">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-section text-foreground">Needs you</h2>
        <span className="text-sm text-muted-foreground">
          {/* 'nothing waiting' is only honest when everything was actually
              checked. With a query down it becomes 'nothing waiting that could
              be checked', which is a different and true claim. */}
          {items.length === 0
            ? unknown.length > 0
              ? 'nothing waiting that could be checked'
              : 'nothing waiting'
            : `${items.length} thing${items.length === 1 ? '' : 's'}`}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">
          {logsLast24h} log{logsLast24h === 1 ? '' : 's'} in the last 24 hours
        </span>
      </div>

      {unknown.length > 0 && (
        <p
          role="alert"
          className="mt-3 rounded-btn border border-warning bg-warning-subtle px-3 py-2 text-sm text-warning-foreground"
        >
          Could not check {unknown.join(', ')} just now, so something may be
          waiting that is not listed here.
        </p>
      )}

      {items.length === 0 ? (
        /* A settled state, not an empty one. It says what was checked, because
           "nothing here" and "nothing was looked at" are different claims and a
           blank card cannot tell them apart. */
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing is currently highlighted. New activity will appear here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                className={`flex gap-3 border-l-2 py-2 pl-3 hover:bg-background ${RAIL[item.tone]}`}
              >
                <Icon
                  name={item.icon}
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">
                    {item.text}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function EducatorDashboard() {
  const { profile } = useAuth()
  // Which student we are currently logging for. Null = modal closed.
  const [loggingFor, setLoggingFor] = useState<StudentRow | null>(null)

  const stats = useQuery({
    queryKey: queryKeys.classroomStats,
    queryFn: fetchClassroomStats,
  })
  const students = useQuery({
    queryKey: queryKeys.students,
    queryFn: fetchStudents,
  })
  const logs = useQuery({
    queryKey: queryKeys.recentLogs,
    queryFn: () => fetchRecentLogs(100),
  })
  const homeNotes = useQuery({
    queryKey: queryKeys.allHomeObservations,
    queryFn: fetchAllHomeObservations,
  })
  const threads = useQuery({
    queryKey: queryKeys.threads,
    queryFn: fetchThreads,
  })

  const unreadMessages = !threads.isSuccess
    ? undefined
    : profile
    ? (threads.data ?? []).reduce(
        (total, thread) => total + unreadMessagesInThread(thread, profile.id),
        0,
      )
    : 0

  /**
   * Goals whose target date has gone.
   *
   * The same query the Schedule screen runs, so the two cannot disagree about
   * what "overdue" means — and it already excludes achieved and discontinued
   * goals, which is the distinction that makes the number honest.
   */
  const goals = useQuery({
    queryKey: queryKeys.upcomingGoals,
    queryFn: fetchUpcomingGoals,
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueGoals = goals.isSuccess
    ? goals.data.filter(
        (g) => g.target_date != null && new Date(g.target_date) < today,
      ).length
    : undefined

  /**
   * Today's AI allowance — db/026.
   *
   * Shown only once most of it is gone. A counter on screen every day would be
   * noise a teacher learns to ignore; the moment it matters is when the next
   * request is about to be refused, and finding that out from an error message
   * mid-incident is the wrong time.
   */
  const quota = useQuery({
    queryKey: queryKeys.aiQuota(profile?.school_id ?? null, profile?.id ?? ''),
    queryFn: () => fetchAiQuota(profile!.school_id, profile!.id),
    enabled: Boolean(profile),
  })

  const q = quota.data
  const nearLimit =
    q != null &&
    (q.user_used >= q.user_limit * 0.75 || q.school_used >= q.school_limit * 0.75)

  // How many recent logs each student has, so the cards can say something
  // truthful instead of showing a decorative trend line with no data behind it.
  const logCountByStudent = new Map<string, number>()
  for (const log of logs.data ?? []) {
    logCountByStudent.set(
      log.student_id,
      (logCountByStudent.get(log.student_id) ?? 0) + 1,
    )
  }

  // Surfaced on the card because a family took the time to write it. If a
  // teacher has to open each child to discover that, most will never be read.
  const homeCountByStudent = new Map<string, number>()
  for (const note of homeNotes.data ?? []) {
    homeCountByStudent.set(
      note.student_id,
      (homeCountByStudent.get(note.student_id) ?? 0) + 1,
    )
  }

  return (
    <div>
      {/* NO "LOG BEHAVIOUR" BUTTON UP HERE, and it was a mistake to try.
          `BehaviourLogModal` takes one fixed student and has no picker, so a
          header button has nothing to open it with — a first draft of this
          passed `students[0]`, which would file an incident against whichever
          child happened to sort first. Logging stays on the student card, where
          the question "about whom?" is already answered. */}
      <header className="mb-6">
        <h1 className="text-title text-foreground">Classroom overview</h1>
        <p className="mt-1 text-muted-foreground">
          {profile?.first_name ? `Good to see you, ${profile.first_name}. ` : ''}
          Here is where your class is up to today.
        </p>
        <EducatorSchoolContext />
      </header>

      {nearLimit && q && (
        <div
          role="status"
          className="mb-6 rounded-card border border-warning bg-warning-subtle p-4"
        >
          <p className="font-semibold text-warning-foreground">
            {q.user_used >= q.user_limit || q.school_used >= q.school_limit
              ? 'No AI suggestions left for now'
              : 'Running low on AI suggestions'}
          </p>
          <p className="mt-1 max-w-prose text-sm text-warning-foreground">
            You have used {q.user_used} of {q.user_limit} in the last 24 hours,
            and your school has used {q.school_used} of {q.school_limit}. The
            allowance is rolling, so it frees up as older requests age out.
            Logging behaviour is unaffected — only new suggestions pause.
          </p>
        </div>
      )}

      {/* --- Stat tiles ---------------------------------------------------- */}
      {stats.isPending ? (
        <LoadingCards />
      ) : stats.isError ? (
        <ErrorState
          message={stats.error.message}
          onRetry={() => void stats.refetch()}
        />
      ) : (
        <NeedsYou
          flaggedOpen={stats.data.flaggedOpen}
          overdueGoals={overdueGoals}
          homeNotes={homeNotes.isSuccess ? homeNotes.data.length : undefined}
          unreadMessages={unreadMessages}
          logsLast24h={stats.data.logsLast24h}
        />
      )}

      {/* --- Students ------------------------------------------------------ */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Your students
      </h2>

      {students.isPending ? (
        <LoadingCards count={4} />
      ) : students.isError ? (
        <ErrorState
          message={students.error.message}
          onRetry={() => void students.refetch()}
        />
      ) : students.data.length === 0 ? (
        <EmptyState
          title="No students assigned to you yet"
          detail={
            profile?.school_id
              ? 'A school administrator assigns students to your class. Once they do, they will appear here.'
              : 'Your account has not been added to a school yet. A school administrator needs to do that before student records become available.'
          }
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {students.data.map((student) => {
            const count = logCountByStudent.get(student.id) ?? 0
            return (
              /* flex-col so the button can be pushed to the bottom. Without it
                 a card carrying the "from home" badge is taller than its
                 neighbour and the row of buttons goes ragged — small, and the
                 kind of small that reads as unfinished. */
              <li
                key={student.id}
                className="flex flex-col rounded-card border border-border bg-card p-5 shadow-raised"
              >
                {/* LEFT-ALIGNED, and the name leads. Centred text reads as a
                    poster rather than a record, and the ID was set at the same
                    weight as the child directly under their name — a teacher
                    does not think in #4021. It stays, quietly, because it is
                    what a school office searches by.

                    display_name, not the full name: the Figma shows first name
                    plus initial so a screen glanced at across a classroom does
                    not expose a surname. */}
                <div className="flex items-center gap-3">
                  <Avatar
                    id={student.id}
                    name={student.display_name}
                    size="md"
                  />
                  <div className="min-w-0">
                    <Link
                      to={`/educator/students/${student.id}`}
                      className="block truncate font-semibold text-foreground hover:text-primary hover:underline"
                    >
                      {student.display_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {student.external_ref ? `#${student.external_ref}` : '—'}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm text-muted-foreground">
                  {count === 0
                    ? 'No logs yet'
                    : `${count} log${count === 1 ? '' : 's'} recorded`}
                </p>

                {/* An icon, not an emoji. Every other glyph in this product is
                    an inline SVG that takes currentColor and ships in the
                    bundle the service worker already caches; one emoji renders
                    differently on every platform and at a different size. */}
                {(homeCountByStudent.get(student.id) ?? 0) > 0 && (
                  /* self-start, because the card is now a flex column and a
                     flex child stretches to full width by default — the badge
                     became a full-width green bar the moment the column was
                     introduced. */
                  <p className="mt-2 inline-flex items-center gap-1.5 self-start rounded-btn bg-success-subtle px-2 py-1 text-xs font-semibold text-success-foreground">
                    <Icon name="home" className="h-3.5 w-3.5" />
                    {homeCountByStudent.get(student.id)} from home
                  </p>
                )}

                {/* SECONDARY, not a wall of blue. Four identical primary
                    buttons in a row make none of them the primary action, and
                    the card's real subject is the child, whose name is the
                    link. */}
                {/* The wrapper takes mt-auto so it absorbs the slack in a short
                    card, and every button in the row lands on the same line. */}
                <div className="mt-auto pt-4">
                  <button
                    type="button"
                    onClick={() => setLoggingFor(student)}
                    className="w-full rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-background"
                  >
                    Log behaviour
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Mounted only while logging, so the timer starts fresh each time and
          no stale draft survives from a previous student. */}
      {loggingFor && (
        <BehaviourLogModal
          student={loggingFor}
          onClose={() => setLoggingFor(null)}
        />
      )}
    </div>
  )
}
