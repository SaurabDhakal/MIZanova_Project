import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  completeModule,
  enrolInCourse,
  fetchCourses,
  buyCourse,
  confirmCoursePurchase,
  fetchMyPurchases,
  formatMoney,
  fetchMyCompletions,
  fetchMyEnrolments,
  queryKeys,
  type Course,
  type Enrolment,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import PageHeader, { PageNote } from '../../components/PageHeader'
import Icon from '../../components/Icon'
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
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  /* OPENED FROM WHEREVER THEY PRESSED "CARRY ON".
     The home screen shows a course card with its title and "1 of 3 parts" and
     a link reading "Carry on" — and that link landed on the Academy index,
     where the person had to find the course again in a list. The card named it;
     the link should open it. `?open=<courseId>` is read once as the initial
     state, so the URL is a way in rather than a thing to keep in sync. */
  const [open, setOpen] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('open'),
  )
  /*
   * WHICH PART THEY ARE READING, not which course. Opening a course used to
   * unroll every module at once — three or eight of them, each several
   * paragraphs, all on screen together. That is a document, and this is meant
   * to be something you work through: there was no sense of being anywhere in
   * it, and nothing to come back to.
   *
   * Null means "wherever they are up to", worked out below rather than stored,
   * so somebody who returns after a week lands on the part they had not read
   * instead of on part one.
   */
  const [openModule, setOpenModule] = useState<string | null>(null)

  const courses = useQuery({ queryKey: queryKeys.courses, queryFn: fetchCourses })
  const enrolments = useQuery({
    queryKey: queryKeys.myEnrolments,
    queryFn: fetchMyEnrolments,
  })
  const completions = useQuery({
    queryKey: queryKeys.myCompletions,
    queryFn: fetchMyCompletions,
  })
  const purchases = useQuery({
    queryKey: queryKeys.myPurchases,
    queryFn: fetchMyPurchases,
  })

  /*
   * COMING BACK FROM STRIPE — db/092.
   *
   * The webhook is what actually settles a purchase and it does not care what
   * this browser does. This asks anyway, because somebody who has just paid
   * should see it now rather than whenever Stripe's notification lands, and
   * both paths call the same idempotent function so whichever arrives first
   * wins.
   *
   * The parameter is cleared either way, so a refresh does not re-run it and a
   * bookmarked URL does not confuse anybody a week later.
   */
  const [params, setParams] = useSearchParams()
  const returnedSession = params.get('session_id')

  useEffect(() => {
    if (!returnedSession) return
    let active = true
    void (async () => {
      try {
        const paid = await confirmCoursePurchase(returnedSession)
        if (!active) return
        if (paid) {
          await queryClient.invalidateQueries({ queryKey: queryKeys.myPurchases })
          showToast('Paid. It is yours — start it whenever suits.')
        } else {
          showToast('That payment has not come through yet.', 'error')
        }
      } catch (err) {
        if (active) {
          showToast(err instanceof Error ? err.message : 'Could not check that payment.', 'error')
        }
      } finally {
        if (active) {
          const next = new URLSearchParams(params)
          next.delete('session_id')
          setParams(next, { replace: true })
        }
      }
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedSession])

  const buy = useMutation({
    mutationFn: buyCourse,
    onSuccess: (url) => {
      /* Stripe's own page. Nothing about a card ever touches MiZanova. */
      window.location.href = url
    },
    onError: (e) => showToast(e.message, 'error'),
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

  /* THE HEADING IS NOT PART OF THE DATA. It used to be, because every state
     below returned before reaching it — so a slow query showed a page with no
     name on it, and the title then arrived and shoved the content down. An
     empty or failed screen had no title at all. Hoisted so every state has
     one, and the page stops moving underneath the reader. */
  const header = (
    <PageHeader
      title="Academy"
      lead={
        profile?.role === 'individual'
          ? 'Short courses from Special Miles, at your own pace. Nothing is timed and nothing is scored.'
          : 'Short courses from Special Miles, for the work you actually do.'
      }
    />
  )

  if (courses.isPending)
    return (
      <>
        {header}
        <LoadingCards count={3} />
      </>
    )
  if (courses.isError)
    return (
      <>
        {header}
        <ErrorState message={courses.error.message} />
      </>
    )

  const done = new Set(
    (completions.data ?? []).map((c) => `${c.enrolment_id}:${c.module_id}`),
  )
  /*
   * NOT ENROLLED, OR NOT FOUND OUT? THEY LOOKED THE SAME.
   *
   * `enrolmentFor` reads `enrolments.data ?? []`, and `moduleProgress` returns
   * `done: 0` when there is no enrolment. So a failed lookup told every
   * learner they had completed none of every course and offered them "Start
   * this course" — which, for somebody already enrolled, is an invitation to
   * press a button that cannot succeed: one enrolment per person per course is
   * the point of the table.
   *
   * Progress is only progress when both queries answered.
   */
  const progressUnknown = enrolments.isError || completions.isError

  const enrolmentFor = (courseId: string) =>
    (enrolments.data ?? []).find((e) => e.course_id === courseId)

  /*
   * A platform admin's own view of this screen includes drafts, because db/075
   * lets them read one. Hidden here rather than shown as a broken card: this is
   * the learner's screen, and an unpublished course has nothing to enrol in.
   * They write them on Courses.
   */
  const published = courses.data.filter((c) => c.is_published)

  /*
   * ---------------------------------------------------------------------
   * WHAT YOU ARE PARTWAY THROUGH COMES FIRST
   * ---------------------------------------------------------------------
   * The list came back in whatever order the database returned it, so a course
   * somebody was halfway through could sit under two they had never opened.
   * The one with a bookmark in it is the reason they came to this screen.
   *
   * Finished ones sink rather than disappear: they are still readable, and
   * removing something somebody completed would read as losing it.
   *
   * Ordering is skipped entirely while progress is unknown — a list that
   * reshuffles itself the moment a failed query succeeds is worse than one
   * that never moved.
   */
  const rank = (c: Course) => {
    const e = enrolmentFor(c.id)
    if (!e) return 1 // not started
    return e.completed_at ? 2 : 0 // finished sinks, in progress leads
  }
  const visible = progressUnknown
    ? published
    : [...published].sort((a, b) => rank(a) - rank(b))

  return (
    <div>
      {/* ONE PAGE, SIX ROLES, AND ONE OF THEM DOES NOT DO "WORK".
          This lead was written for staff and shown to everybody, including an
          individual — somebody with no school, no job attached to this account
          and nobody assigning them anything. "For the work you actually do" is
          a stranger's sentence to them, on the page they were sent to from a
          public site promising the opposite. The rest of the screen is genuinely
          audience-driven through `audiences`; only the sentence at the top was
          not. */}
      {header}

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
            /* A priced course you have not bought. `purchases` failing is
               treated as "not paid": the worst case is offering the till to
               somebody who already paid, and the enrolment policy refuses the
               alternative anyway — so this cannot let anybody in for free. */
            const needsPaying =
              course.price_cents !== null &&
              !(purchases.data ?? []).some(
                (b) => b.course_id === course.id && b.status === 'paid',
              )

            return (
              <li
                key={course.id}
                className="rounded-card border border-border bg-card shadow-raised p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* AN ICON TILE, BECAUSE A COURSE IS NOT A LIST ROW.
                      Two courses rendered as two thin lines of text with a
                      button on the right, which is what a settings list looks
                      like — and for somebody with no school the Academy IS the
                      product. The tile costs nothing, marks each card as a
                      thing rather than an entry, and matches the treatment the
                      landing page already gives its three steps. */}
                  <span className="hidden shrink-0 rounded-btn bg-brand-navy/10 p-2.5 text-brand-navy sm:inline-flex">
                    <Icon name="resources" className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-foreground">
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
                    {/* A COUNT WOULD BE A LIE ON A PRICED COURSE.
                        db/097 shows an unpaid visitor only the sample module,
                        so `total` here is 1 however many the course really
                        has — and "1 module" undersells a course somebody is
                        being asked to pay for. Say what is readable instead of
                        counting what happens to have come back. */}
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-btn bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      <Icon
                        name={needsPaying && !enrolment ? 'invoices' : 'resources'}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      {needsPaying && !enrolment
                        ? 'Read the first part free, then buy it to carry on'
                        : total === 0
                          ? 'No modules yet'
                          : progressUnknown
                            ? `${total} module${total === 1 ? '' : 's'} · your progress could not be loaded`
                            : enrolment
                              ? `${doneCount} of ${total} modules done`
                              : `${total} module${total === 1 ? '' : 's'}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {progressUnknown ? (
                      /* Neither "Start" nor "Continue" is safe to offer when
                         we do not know which one is true. */
                      <button
                        type="button"
                        onClick={() => {
                          void enrolments.refetch()
                          void completions.refetch()
                        }}
                        className="min-h-11 rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground"
                      >
                        Try again
                      </button>
                    ) : !enrolment && needsPaying ? (
                      /* PRICED, AND NOT PAID FOR — db/092. The enrolment policy
                         refuses this without a paid purchase, so the button is
                         not the paywall; it is the way to reach the till. */
                      <button
                        type="button"
                        disabled={buy.isPending || total === 0}
                        onClick={() => buy.mutate(course.id)}
                        className="min-h-11 rounded-btn bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        {total === 0
                          ? 'Not ready yet'
                          : buy.isPending
                            ? 'Taking you to pay…'
                            : `Buy for ${formatMoney(course.price_cents ?? 0, course.currency)}`}
                      </button>
                    ) : !enrolment ? (
                      <button
                        type="button"
                        disabled={enrol.isPending || total === 0}
                        onClick={() => enrol.mutate(course.id)}
                        className="min-h-11 rounded-btn bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        {total === 0 ? 'Not ready yet' : 'Start this course'}
                      </button>
                    ) : (
                      /* CONTINUE IS THE PRIMARY ACTION AND WAS DRESSED AS THE
                         WEAKEST THING ON THE CARD. An outlined button sat
                         beside solid ones on every course somebody had NOT
                         started, so the page pushed hardest on starting
                         something new and whispered about finishing what was
                         already open. Backwards: carrying on is the thing this
                         product wants and the thing the person came for.

                         "Hide" stays outlined, because closing a panel is not
                         an action worth a solid button. */
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : course.id)}
                        className={
                          isOpen
                            ? 'inline-flex min-h-11 items-center rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground'
                            : 'inline-flex min-h-11 items-center rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground'
                        }
                      >
                        {isOpen
                          ? 'Hide'
                          : enrolment.completed_at
                            ? 'Read it again'
                            : 'Continue'}
                      </button>
                    )}
                  </div>
                </div>

                {/* A bar rather than a percentage. "3 of 8" is already on the
                    card; the bar is for the glance, and a number to one decimal
                    place would be false precision about eight things.

                    THICKER AND CLOSER THAN IT WAS. At 1.5px hugging the bottom
                    edge it read as a border somebody had coloured in — the one
                    thing on the card that shows momentum, and the easiest to
                    miss. */}
                {enrolment && total > 0 && (
                  <div
                    className="mt-4 h-2 w-full overflow-hidden rounded-full bg-background"
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
                  <ol className="mt-4 space-y-2 border-t border-border pt-4">
                    {(course.course_modules ?? []).map((m, i) => {
                      const isDone = done.has(`${enrolment.id}:${m.id}`)
                      /* Where they are up to: the first part not yet done, or
                         the last one if they have finished the lot. */
                      const upTo =
                        (course.course_modules ?? []).find(
                          (x) => !done.has(`${enrolment.id}:${x.id}`),
                        )?.id ?? (course.course_modules ?? []).at(-1)?.id
                      const showing = (openModule ?? upTo) === m.id
                      return (
                        <li
                          key={m.id}
                          className={`rounded-card border p-4 ${
                            showing
                              ? 'border-primary bg-card'
                              : 'border-border bg-background'
                          }`}
                        >
                          {/* THE WHOLE ROW OPENS IT. A title somebody has to
                              hit exactly is a worse target than the card they
                              are already looking at, and this list is read on
                              phones. */}
                          <button
                            type="button"
                            onClick={() => setOpenModule(showing ? '' : m.id)}
                            aria-expanded={showing}
                            className="flex w-full flex-wrap items-baseline gap-2 text-left"
                          >
                            <span
                              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                                isDone
                                  ? 'bg-success-subtle text-success-foreground'
                                  : showing
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-background text-muted-foreground'
                              }`}
                            >
                              {isDone ? '✓' : i + 1}
                            </span>
                            <h3 className="font-semibold text-foreground">
                              {m.title}
                            </h3>
                            {isDone && (
                              <span className="text-xs font-semibold text-success-foreground">
                                Done
                              </span>
                            )}
                          </button>

                          {showing && m.body && (
                            /* whitespace-pre-line, not dangerouslySetInnerHTML.
                               db/075 stores plain text on purpose — rendering
                               staff-written content as markup is how a content
                               field becomes an injection surface, and the brief
                               names input validation by name. */
                            <p className="mt-2 max-w-prose text-sm whitespace-pre-line text-muted-foreground">
                              {m.body}
                            </p>
                          )}

                          {showing && m.video_url && (
                            <a
                              href={m.video_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="mt-2 inline-block text-sm font-semibold text-primary hover:underline"
                            >
                              Watch the video →
                            </a>
                          )}

                          {showing && !isDone && (
                            <button
                              type="button"
                              disabled={tick.isPending}
                              onClick={() =>
                                tick.mutate({ e: enrolment.id, m: m.id })
                              }
                              className="min-h-11 mt-3 block rounded-btn border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground disabled:opacity-60"
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
