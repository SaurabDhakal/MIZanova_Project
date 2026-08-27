import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  completeModule,
  enrolInCourse,
  fetchCourses,
  fetchMyCompletions,
  fetchMyEnrolments,
  queryKeys,
  type Course,
  type Enrolment,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import PageHeader, { PageNote } from '../../components/PageHeader'
import { showToast } from '../../lib/toast'

/**
 * Special Miles Academy — db/075.
 *
 * ---------------------------------------------------------------------------
 * ONE SCREEN FOR EVERY LEARNER, BECAUSE THE DIFFERENCE IS THE CONTENT
 * ---------------------------------------------------------------------------
 * The brief describes programmes for four audiences — professional development
 * for schools, Empowered Parenting for families, executive functioning for
 * students, neurodiversity training for workplaces. They are the same
 * mechanism: enrol, work through modules, finish.
 *
 * So there is one component, and what a person sees is decided by db/075's
 * policies rather than by a prop. A course written for educators does not
 * arrive at a parent's browser and get filtered out here — it never arrives.
 * That distinction matters the day somebody opens the network tab.
 *
 * ---------------------------------------------------------------------------
 * FINISHING IS THE DATABASE'S DECISION
 * ---------------------------------------------------------------------------
 * Ticking the last module does not set `completed_at` here. A trigger does it,
 * so the progress a learner sees and the progress a dashboard reports cannot
 * disagree — and two tabs racing to tick the last box cannot both decide they
 * were the one that finished it.
 */

function moduleProgress(
  course: Course,
  enrolment: Enrolment | undefined,
  done: Set<string>,
) {
  const modules = course.course_modules ?? []
  if (!enrolment) return { total: modules.length, done: 0 }
  return {
    total: modules.length,
    done: modules.filter((m) => done.has(`${enrolment.id}:${m.id}`)).length,
  }
}

export default function Academy() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<string | null>(null)

  const courses = useQuery({ queryKey: queryKeys.courses, queryFn: fetchCourses })
  const enrolments = useQuery({
    queryKey: queryKeys.myEnrolments,
    queryFn: fetchMyEnrolments,
  })
  const completions = useQuery({
    queryKey: queryKeys.myCompletions,
    queryFn: fetchMyCompletions,
  })

  const enrol = useMutation({
    mutationFn: enrolInCourse,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.myEnrolments })
      showToast('Enrolled. Work through it whenever suits.')
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  const tick = useMutation({
    mutationFn: ({ e, m }: { e: string; m: string }) => completeModule(e, m),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.myCompletions })
      await queryClient.invalidateQueries({ queryKey: queryKeys.myEnrolments })
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  if (courses.isPending) return <LoadingCards count={3} />
  if (courses.isError) return <ErrorState message={courses.error.message} />

  const done = new Set(
    (completions.data ?? []).map((c) => `${c.enrolment_id}:${c.module_id}`),
  )
  const enrolmentFor = (courseId: string) =>
    (enrolments.data ?? []).find((e) => e.course_id === courseId)

  /*
   * A platform admin's own view of this screen includes drafts, because db/075
   * lets them read one. Hidden here rather than shown as a broken card: this is
   * the learner's screen, and an unpublished course has nothing to enrol in.
   * They write them on Courses.
   */
  const visible = courses.data.filter((c) => c.is_published)

  return (
    <div>
      <PageHeader
        title="Academy"
        lead="Short courses from Special Miles, for the work you actually do."
      />

      {visible.length === 0 ? (
        <EmptyState
          title="No courses for you yet"
          detail="Special Miles publishes courses for different audiences. When one is published for your role, it appears here."
        />
      ) : (
        <ul className="space-y-4">
          {visible.map((course) => {
            const enrolment = enrolmentFor(course.id)
            const { total, done: doneCount } = moduleProgress(
              course,
              enrolment,
              done,
            )
            const isOpen = open === course.id

            return (
              <li
                key={course.id}
                className="rounded-card border border-border bg-card shadow-raised p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-foreground">
                        {course.title}
                      </h2>
                      {enrolment?.completed_at && (
                        <span className="rounded-btn bg-success-subtle px-2 py-0.5 text-xs font-semibold text-success-foreground">
                          Finished
                        </span>
                      )}
                    </div>
                    <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                      {course.summary}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {total === 0
                        ? 'No modules yet'
                        : enrolment
                          ? `${doneCount} of ${total} modules done`
                          : `${total} module${total === 1 ? '' : 's'}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!enrolment ? (
                      <button
                        type="button"
                        disabled={enrol.isPending || total === 0}
                        onClick={() => enrol.mutate(course.id)}
                        className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        {total === 0 ? 'Not ready yet' : 'Start this course'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : course.id)}
                        className="rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground"
                      >
                        {isOpen ? 'Hide' : 'Continue'}
                      </button>
                    )}
                  </div>
                </div>

                {/* A bar rather than a percentage. "3 of 8" is already on the
                    card; the bar is for the glance, and a number to one decimal
                    place would be false precision about eight things. */}
                {enrolment && total > 0 && (
                  <div
                    className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background"
                    role="progressbar"
                    aria-valuenow={doneCount}
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-label={`${doneCount} of ${total} modules done`}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${(doneCount / total) * 100}%` }}
                    />
                  </div>
                )}

                {isOpen && enrolment && (
                  <ol className="mt-4 space-y-3 border-t border-border pt-4">
                    {(course.course_modules ?? []).map((m, i) => {
                      const isDone = done.has(`${enrolment.id}:${m.id}`)
                      return (
                        <li key={m.id} className="rounded-card border border-border p-4">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-xs font-semibold text-muted-foreground">
                              {i + 1}
                            </span>
                            <h3 className="font-semibold text-foreground">
                              {m.title}
                            </h3>
                            {isDone && (
                              <span className="text-xs font-semibold text-success-foreground">
                                Done
                              </span>
                            )}
                          </div>

                          {m.body && (
                            /* whitespace-pre-line, not dangerouslySetInnerHTML.
                               db/075 stores plain text on purpose — rendering
                               staff-written content as markup is how a content
                               field becomes an injection surface, and the brief
                               names input validation by name. */
                            <p className="mt-2 max-w-prose text-sm whitespace-pre-line text-muted-foreground">
                              {m.body}
                            </p>
                          )}

                          {m.video_url && (
                            <a
                              href={m.video_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="mt-2 inline-block text-sm font-semibold text-primary hover:underline"
                            >
                              Watch the video →
                            </a>
                          )}

                          {!isDone && (
                            <button
                              type="button"
                              disabled={tick.isPending}
                              onClick={() =>
                                tick.mutate({ e: enrolment.id, m: m.id })
                              }
                              className="mt-3 block rounded-btn border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground disabled:opacity-60"
                            >
                              Mark as done
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <PageNote>
        Courses are written by Special Miles and published for particular
        audiences, so this list shows what is meant for your role rather than
        everything that exists. Marking a module done is for your own
        record — nothing is scored, nothing is timed, and going back over one
        changes nothing. There are no certificates: a tick here says you read
        it, which is not the same claim as having been assessed, and this
        product does not make claims it cannot support.
      </PageNote>
    </div>
  )
}
