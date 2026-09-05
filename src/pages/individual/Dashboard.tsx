import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  fetchArticles,
  fetchCourses,
  fetchMyCompletions,
  fetchMyEnrolments,
  fetchMyPurchases,
  formatMoney,
  queryKeys,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ErrorState, LoadingCards } from '../../components/QueryState'

/**
 * Home for somebody who belongs to no school — db/088.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SCREEN IS FOR
 * ---------------------------------------------------------------------------
 * An individual came to the website themselves. Nobody invited them, no school
 * holds their record, and there is no child. What they have is what they have
 * started reading, so that is what this shows: courses in progress first,
 * everything else offered underneath.
 *
 * It reuses `fetchCourses`, `fetchMyEnrolments` and `fetchMyCompletions`
 * exactly as the Academy does. Nothing new was added to the API, because
 * enrolments were already keyed to a person rather than to a student record —
 * that is the whole reason this role was cheap to build.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT DO, AND WHY THERE IS NO TILE FOR IT
 * ---------------------------------------------------------------------------
 * No bookings. Booking runs through a student record, and a student needs a
 * school — see the note in db/089. A "Book a session" tile that led nowhere
 * would be the exact fault this codebase keeps finding in itself: a promise
 * printed with nothing behind it. When it exists, it belongs here.
 *
 * Paying DOES work now — db/092 — so the receipts below are here for the
 * reason the rest of this file exists: money changed hands and the person who
 * paid it should be able to see that somewhere other than their bank.
 */
export default function IndividualHome() {
  const { profile } = useAuth()

  const courses = useQuery({ queryKey: queryKeys.courses, queryFn: fetchCourses })
  const enrolments = useQuery({
    queryKey: queryKeys.myEnrolments,
    queryFn: fetchMyEnrolments,
  })
  const completions = useQuery({
    queryKey: queryKeys.myCompletions,
    queryFn: fetchMyCompletions,
  })
  const articles = useQuery({
    queryKey: queryKeys.articles,
    queryFn: fetchArticles,
  })
  const purchases = useQuery({
    queryKey: queryKeys.myPurchases,
    queryFn: fetchMyPurchases,
  })

  if (courses.isPending) return <LoadingCards count={2} />
  if (courses.isError) {
    return (
      <ErrorState
        message={courses.error.message}
        onRetry={() => void courses.refetch()}
      />
    )
  }

  /*
   * `isSuccess` rather than `data ?? []`. If the enrolment query FAILED, an
   * empty array would render "nothing started yet" — telling somebody they
   * have begun nothing when the truth is that we could not check. The rest of
   * this product makes that distinction everywhere and this screen is not
   * going to be the exception.
   */
  const enrolmentsKnown = enrolments.isSuccess
  const mine = enrolmentsKnown ? enrolments.data : []
  const doneByEnrolment = new Map<string, number>()
  for (const c of completions.data ?? []) {
    doneByEnrolment.set(
      c.enrolment_id,
      (doneByEnrolment.get(c.enrolment_id) ?? 0) + 1,
    )
  }

  const started = mine
    .map((e) => {
      const course = courses.data.find((c) => c.id === e.course_id)
      if (!course) return null
      const total = course.course_modules?.length ?? 0
      const done = doneByEnrolment.get(e.id) ?? 0
      return { enrolment: e, course, total, done }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  const startedIds = new Set(started.map((s) => s.course.id))
  const available = courses.data.filter((c) => !startedIds.has(c.id))

  /*
   * Paid only. A `pending` row is somebody who reached Stripe and did not come
   * back, and listing it under "what you have paid for" would tell them they
   * bought something they do not own. Refunded is left out for the same
   * reason in reverse — if it comes back, that conversation happens with a
   * person, not with a line on a dashboard.
   */
  const paid = (purchases.data ?? []).filter((p) => p.status === 'paid')

  const firstName = profile?.first_name?.trim()

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">
          {firstName ? `Hello, ${firstName}` : 'Hello'}
        </h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Everything here is yours. No school holds any of it, and nothing you
          do on these pages is reported to anybody.
        </p>
      </header>

      {/* --- what they have started ---------------------------------------- */}
      <h2 className="mt-8 mb-3 text-lg font-semibold text-foreground">
        What you have started
      </h2>

      {!enrolmentsKnown && (
        <ErrorState
          message="Your courses could not be loaded, so this is unknown rather than empty. Nothing has been lost — this is a problem reaching the server."
          onRetry={() => void enrolments.refetch()}
        />
      )}

      {enrolmentsKnown && started.length === 0 && (
        <div className="rounded-card border border-border bg-card p-6 shadow-raised">
          <p className="max-w-prose text-muted-foreground">
            Nothing yet. The Academy has short courses you can work through at
            your own pace — nothing is timed, nothing is scored, and you can
            stop and come back.
          </p>
          <Link
            to="/individual/academy"
            className="mt-4 inline-block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
          >
            Look at the courses
          </Link>
        </div>
      )}

      {enrolmentsKnown && started.length > 0 && (
        <ul className="space-y-3">
          {started.map(({ enrolment, course, total, done }) => {
            const finished = enrolment.completed_at !== null
            const percent = total === 0 ? 0 : Math.round((done / total) * 100)
            return (
              <li
                key={enrolment.id}
                className="rounded-card border border-border bg-card p-5 shadow-raised"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-semibold text-foreground">
                    {course.title}
                  </h3>
                  {finished && (
                    <span className="rounded-btn bg-success-subtle px-2 py-0.5 text-xs font-semibold text-success-foreground">
                      Finished
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                  {course.summary}
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <div
                    role="img"
                    aria-label={`${done} of ${total} parts done`}
                    className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-background"
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {done} of {total} {total === 1 ? 'part' : 'parts'}
                  </span>
                </div>

                <Link
                  to="/individual/academy"
                  className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                >
                  {finished ? 'Read it again →' : 'Carry on →'}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {/* --- what else there is -------------------------------------------- */}
      {available.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
            Also for you
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {available.map((course) => (
              <li
                key={course.id}
                className="rounded-card border border-border bg-card p-5 shadow-raised"
              >
                <h3 className="font-semibold text-foreground">{course.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {course.summary}
                </p>
                <Link
                  to="/individual/academy"
                  className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                >
                  Start it →
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {articles.isSuccess && articles.data.length > 0 && (
        <p className="mt-8 max-w-prose text-sm text-muted-foreground">
          There {articles.data.length === 1 ? 'is' : 'are'}{' '}
          {articles.data.length} short{' '}
          {articles.data.length === 1 ? 'read' : 'reads'} in the{' '}
          <Link
            to="/individual/library"
            className="font-medium text-primary hover:underline"
          >
            Library
          </Link>{' '}
          as well.
        </p>
      )}

      {/* --- what they have paid for -------------------------------------- */}
      {paid.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
            What you have paid for
          </h2>
          <ul className="divide-y divide-border rounded-card border border-border bg-card shadow-raised">
            {paid.map((purchase) => {
              /* The course is always readable here even if Special Miles has
                 since unpublished it — that is what db/093 is for. The
                 fallback covers a course that was removed some other way, so
                 the amount is never orphaned. */
              const course = courses.data.find((c) => c.id === purchase.course_id)
              return (
                <li
                  key={purchase.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4"
                >
                  <span className="font-medium text-foreground">
                    {course?.title ?? 'A course that is no longer listed'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatMoney(purchase.amount_cents, purchase.currency)}
                    {purchase.paid_at &&
                      ` · ${new Date(purchase.paid_at).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}`}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Yours to keep. A course you have paid for stays open to you even if
            it stops being offered to anybody else.
          </p>
        </>
      )}

      {/* NOT BUILT, SAID PLAINLY. The brief lists bookable sessions as a real
          product, and booking runs through a student record, which needs a
          school — so it does not exist for somebody here, and a tile offering
          it would be a promise with nothing behind it.

          Paying is no longer on this list. db/092 built it, so claiming it was
          missing would be the same fault pointing the other way. */}
      <section className="mt-10 rounded-card border border-border bg-background p-6">
        <h2 className="font-semibold text-foreground">Not built yet</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Booking a session with a specialist does not work from this account.
          Booking a time runs through a school and a student record, and you
          have neither. It is part of the plan; it is not here yet, and nothing
          on these pages will pretend otherwise.
        </p>
      </section>
    </div>
  )
}
