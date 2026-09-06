import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  fetchArticles,
  fetchCourses,
  fetchMyCompletions,
  fetchMyEnrolments,
  fetchMyGoalsPersonal,
  goalNeedsAsking,
  sinceLastLook,
  fetchMyPurchases,
  fetchIndividualPlan,
  fetchMyAiTier,
  fetchMySubscription,
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

  /* Both only decide whether the price card renders, so a failure on either is
     a card that does not appear rather than a screen that breaks. */
  const plan = useQuery({
    queryKey: queryKeys.individualPlan,
    queryFn: fetchIndividualPlan,
  })
  const tier = useQuery({ queryKey: queryKeys.myAiTier, queryFn: fetchMyAiTier })
  /* Which of the two reasons they are on the paid tier. Asked rather than
     inferred from the purchase list, because a subscription is the answer that
     changes what the card offers to do next. */
  const subscription = useQuery({
    queryKey: queryKeys.mySubscription,
    queryFn: fetchMySubscription,
  })
  const hasLiveSubscription = ['trialing', 'active', 'past_due'].includes(
    subscription.data?.status ?? '',
  )
  const purchases = useQuery({
    queryKey: queryKeys.myPurchases,
    queryFn: fetchMyPurchases,
  })
  const goals = useQuery({
    queryKey: queryKeys.myPersonalGoals,
    queryFn: fetchMyGoalsPersonal,
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

  const activeGoals = (goals.data ?? []).filter((g) => g.status === 'active')

  /*
   * A BRAND-NEW ACCOUNT IS THE SCREEN MOST PEOPLE SEE FIRST AND THE ONE THIS
   * PRODUCT HAS ALWAYS BEEN WORST AT. docs/14 calls empty states the single
   * best thing in the whole Customer.io study, and every one here was a title
   * and a sentence in a box.
   *
   * Somebody who has just signed up has nothing started, nothing asked and no
   * goal, and the honest thing is not to apologise for that — it is to say
   * what the three things are and let them pick one.
   */
  const brandNew =
    enrolmentsKnown && started.length === 0 && activeGoals.length === 0

  const firstName = profile?.first_name?.trim()

  /*
   * ---------------------------------------------------------------------
   * ONE THING TO PICK UP, CHOSEN FROM WHAT IS ACTUALLY THERE
   * ---------------------------------------------------------------------
   * The page opened with a greeting and then six sections of equal weight,
   * which is a filing cabinet rather than a home screen — nothing said where
   * somebody was up to or what to do next, so every visit started with
   * reading.
   *
   * The order is not arbitrary. A goal is the thing with a thread running
   * through it and the thing somebody came back for; a half-finished course is
   * the next most alive; and only when neither exists is "start something" the
   * honest suggestion. Nothing here is invented — each branch points at
   * something that exists and says its real name.
   */
  const unfinished = started.find((s) => s.enrolment.completed_at === null)
  /* db/106. A goal nobody has asked about outranks one checked in yesterday —
     it is the thing most likely to be quietly slipping, and the whole point of
     following anything up. */
  const toLookAt = activeGoals.find((g) => goalNeedsAsking(g))
  const nextThing = toLookAt
    ? {
        eyebrow: `Not looked at in ${sinceLastLook(toLookAt)}`,
        title: toLookAt.title,
        to: '/individual/goals',
        cta: 'How did it go?',
      }
    : activeGoals[0]
    ? {
        eyebrow: 'Pick up where you left off',
        title: activeGoals[0].title,
        to: '/individual/goals',
        cta: 'Check in',
      }
    : unfinished
      ? {
          eyebrow: 'Carry on',
          title: unfinished.course.title,
          to: '/individual/academy',
          cta: `Part ${Math.min(unfinished.done + 1, unfinished.total)} of ${unfinished.total}`,
        }
      : available[0]
        ? {
            eyebrow: 'Somewhere to start',
            title: available[0].title,
            to: '/individual/academy',
            cta: 'Open it',
          }
        : null

  /*
   * COUNTED, NEVER ESTIMATED, and shown only where the number means something.
   * `docs/14` and the charting guidance both say to lead with big figures only
   * when the figures are the point of the page — on a personal home screen
   * they are, because progress is the only thing this account accumulates.
   *
   * Parts finished is the one worth having: it is the number that goes up when
   * somebody does the thing, and it is the only one here that can.
   */
  const partsDone = started.reduce((n, s) => n + s.done, 0)
  const stats = [
    { n: activeGoals.length, label: activeGoals.length === 1 ? 'goal on the go' : 'goals on the go' },
    { n: started.length, label: started.length === 1 ? 'course started' : 'courses started' },
    { n: partsDone, label: partsDone === 1 ? 'part finished' : 'parts finished' },
  ]

  return (
    <div>
      {/* ---------------------------------------------------------------
          A BAND, NOT A HEADING. The page used to open with black text on the
          same background as everything under it, so there was nothing to land
          on and no sense of arriving anywhere. This carries the greeting, the
          one promise this account makes, the thing to pick up, and three
          counted figures — all of it real, none of it decoration.
          --------------------------------------------------------------- */}
      <header className="mb-8 rounded-card border border-border bg-primary-subtle p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wider text-primary uppercase">
              {new Date().toLocaleDateString('en-AU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-balance text-foreground md:text-4xl">
              {firstName ? `Hello, ${firstName}` : 'Hello'}
            </h1>
            <p className="mt-2 max-w-prose text-foreground">
              Everything here is yours. No school holds any of it, and nothing
              you do on these pages is reported to anybody.
            </p>
          </div>

          {/* Counted from what is already loaded — no extra request, and no
              figure that cannot go up. */}
          <dl className="flex gap-6">
            {/* THE LABEL WAS IN HERE TWICE. An `sr-only` <dt> carried it for
                screen readers and a visible <span> carried it for everybody
                else, inside the <dd> — so a screen reader read "goals on the
                go, 2, goals on the go" on every tile. Two copies of one label
                is also two things to keep in step.

                The visible label IS the term, which is what a description list
                is for. `flex-col-reverse` puts the number on top visually while
                the DOM keeps dt before dd, so it reads correctly and once. */}
            {stats.map((s) => (
              <div
                key={s.label}
                /* `justify-end` because in column-reverse the main axis starts
                   at the BOTTOM, so the default packs content downwards and a
                   one-line label ("part finished") sat its number lower than a
                   two-line one ("goals on the go"). Packing to main-end is what
                   puts every figure on the same line. */
                className="flex flex-col-reverse justify-end"
              >
                <dt className="mt-0.5 block max-w-20 text-xs leading-tight text-muted-foreground">
                  {s.label}
                </dt>
                {/* A ZERO IS STILL SHOWN AND STILL TRUE — it says what this
                    account counts, and it fills in as somebody uses it. It just
                    stops shouting as loudly as the figure that is actually
                    there, so the eye lands on the one that means something.
                    Hiding it would make the row jump about as numbers crossed
                    one. */}
                <dd
                  className={`block text-3xl font-bold tabular-nums ${
                    s.n === 0 ? 'text-muted-foreground/50' : 'text-foreground'
                  }`}
                >
                  {s.n}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {nextThing && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-card p-4">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-wider text-brand-green uppercase">
                {nextThing.eyebrow}
              </p>
              {/* Two lines rather than one truncated. Somebody's own words for
                  their own goal are the last thing that should be cut off
                  mid-word on the narrow screen most people open this on. */}
              <p className="mt-1 line-clamp-2 text-lg font-semibold text-foreground">
                {nextThing.title}
              </p>
            </div>
            <Link
              to={nextThing.to}
              className="shrink-0 rounded-btn bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:brightness-110"
            >
              {nextThing.cta}
            </Link>
          </div>
        )}
      </header>

      {brandNew && (
        <section className="mt-8 rounded-card border border-border bg-primary-subtle p-6">
          <h2 className="font-semibold text-foreground">
            Three things worth doing first
          </h2>
          <ol className="mt-3 space-y-3 text-sm text-foreground">
            <li>
              <Link to="/individual/goals" className="font-semibold text-primary hover:underline">
                Set one thing you want to be different
              </Link>{' '}
              &mdash; and write down why, because that is the part you will be
              glad of in six weeks.
            </li>
            <li>
              <Link to="/individual/suggestions" className="font-semibold text-primary hover:underline">
                Describe something you are finding hard
              </Link>{' '}
              &mdash; you get a few practical things to try. It will not tell
              you what you have, and nobody else can read it.
            </li>
            <li>
              <Link to="/individual/academy" className="font-semibold text-primary hover:underline">
                Start a course
              </Link>{' '}
              &mdash; short, untimed, unscored, and yours to leave half-finished.
            </li>
          </ol>
        </section>
      )}
      {/* ---------------------------------------------------------------
          TWO COLUMNS, AND WHAT IS ALIVE COMES FIRST.

          This was five sections of identical weight in one narrow column, so
          the eye had nowhere to land and half a 1280px screen was empty. Worse,
          the top slot went to "What you have started" — which for most people
          most of the time is a card explaining that they have not started
          anything. An absence had the most prominent position on the page.

          Now the left column carries what is actually going on, in the order
          somebody would ask it: what am I working on, what have I started, what
          else is there. The right column takes the things you glance at rather
          than act on.

          It collapses to one column below lg, in this same order, so a phone
          still gets the live things first.
          --------------------------------------------------------------- */}
      <div className="grid gap-x-8 gap-y-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
        {/* --- what they are working on ------------------------------------- */}
        {activeGoals.length > 0 && (
          <>
            <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
              What you are working on
            </h2>
            <ul className="space-y-3">
              {activeGoals.slice(0, 2).map((goal) => {
                const last = [...goal.individual_goal_checkins].sort(
                  (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
                )[0]
                return (
                  <li
                    key={goal.id}
                    className="rounded-card border border-border bg-card p-5 shadow-raised"
                  >
                    <h3 className="font-semibold text-foreground">{goal.title}</h3>
                    {goal.why && (
                      <p className="mt-1 max-w-prose border-l-2 border-brand-green pl-3 text-sm text-muted-foreground italic">
                        {goal.why}
                      </p>
                    )}
                    <p className="mt-2 text-sm text-muted-foreground">
                      {/* THE LAST CHECK-IN, NOT A COUNT. "3 check-ins" says
                          nothing; when they last came back and how it went is
                          the thing that tells them where they are. */}
                      {last
                        ? `Last check-in ${new Date(last.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })} — ${
                            last.how_it_went === 'good'
                              ? 'went well'
                              : last.how_it_went === 'mixed'
                                ? 'mixed'
                                : 'hard going'
                          }`
                        : 'No check-ins yet.'}
                    </p>
                    <Link
                      to="/individual/goals"
                      className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                    >
                      Check in &rarr;
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {/* --- what they have started ----------------------------------------
            THE HEADING WAS BELOW ITS OWN LIST. It sat after the closing tag of
            the <ul>, so whenever somebody actually had a course on the go the
            card rendered under "What you are working on" — reading as a goal —
            and "What you have started" then introduced "Also for you", which
            is the opposite thing. It only labelled the right content in the two
            states where the list does not render at all: the error and the
            empty one. A screen reader got the same wrong grouping, worse. */}
        <h2 className="mt-8 mb-3 text-lg font-semibold text-foreground">
          What you have started
        </h2>

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

                  {/* Opens the course it is sitting under, rather than the
                      index. The card names a course and says how far through
                      it you are; landing on a list and hunting for it again is
                      the link not keeping its own promise. */}
                  <Link
                    to={`/individual/academy?open=${course.id}`}
                    className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                  >
                    {finished ? 'Read it again →' : 'Carry on →'}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
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
                    to={`/individual/academy?open=${course.id}`}
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
        </div>

        <aside className="lg:col-span-1">
        {/* A NEW SCREEN WITH ONLY A NAV ICON IS A SCREEN NOBODY OPENS, which is
            the same fault as the missing public page db/088 shipped without. */}
        <section className="mt-8 rounded-card border border-border bg-card p-5 shadow-raised">
          <h2 className="font-semibold text-foreground">Stuck on something?</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Describe it and get a few practical things to try. It will not tell
            you what you have and it gives no medical advice &mdash; and nobody
            else can read what you write there.
          </p>
          <Link
            to="/individual/suggestions"
            className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Ask for suggestions &rarr;
          </Link>
        </section>
        {/* ------------------------------------------------------------------
            WHAT IT COSTS, ON THE SCREEN PEOPLE ACTUALLY OPEN.
            ------------------------------------------------------------------
            The price lived on the public pricing page and on the Payments tab
            in Settings — the first is for people deciding whether to make an
            account, the second is where you go to change something you already
            have. So a signed-in person could use MiZanova for months without
            knowing a subscription existed.

            THREE STATES, BECAUSE "PAID" HAS TWO CAUSES.
            `my_ai_tier()` answers paid for a live subscription OR a course
            already bought (db/099, db/111). The first version of this card
            simply hid itself from anybody on the paid tier, which meant the
            one account with test receipts on it — the demo — never saw the
            price at all, and neither would a real customer who had bought a
            single course.

            Hiding it also hid something worth knowing: one course purchase
            grants the capable model permanently, so it overlaps a subscription
            almost entirely. Saying that out loud is more honest than quietly
            withholding an offer, and it is the sort of thing Special Miles
            should see rather than discover from a support email.
            ------------------------------------------------------------------ */}
        {/* `tier.data` is in the condition, not just the ternary below. A
            ternary on `=== 'free'` sends undefined down the ELSE branch, so
            while the tier query is in flight — or if it fails — a free account
            would be told "you already have this", which is both wrong and the
            one thing that would stop them subscribing. No answer means no
            card. */}
        {plan.data?.is_offered && plan.data.price_cents !== null && tier.data && (
          <section className="mt-4 rounded-card border border-primary bg-primary-subtle p-5">
            {tier.data === 'free' ? (
              <>
                <p className="text-xs font-bold tracking-wider text-primary uppercase">
                  If you want more of them
                </p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {formatMoney(plan.data.price_cents, plan.data.currency)}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    a {plan.data.bill_every}
                  </span>
                </p>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                  {plan.data.trial_days
                    ? `Free for the first ${plan.data.trial_days} days. `
                    : ''}
                  More suggestions a day, answered by the model that does not
                  give up on the hard ones. Everything else here stays free
                  either way.
                </p>
                <Link
                  to="/account/payments"
                  className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                >
                  What you get &rarr;
                </Link>
              </>
            ) : (
              <>
                <p className="text-xs font-bold tracking-wider text-primary uppercase">
                  You already have this
                </p>
                <p className="mt-1 max-w-prose text-sm text-foreground">
                  {hasLiveSubscription
                    ? 'You subscribe, so your suggestions are answered by the more capable model and you can ask more times a day.'
                    : 'Because you have bought a course, your suggestions are answered by the more capable model and you can ask more times a day.'}
                </p>
                {/* THE PRICE IS STILL SHOWN. Somebody on the paid tier through
                    a course has not been told what the subscription costs, and
                    withholding it because they happen not to need it today
                    makes the figure feel like something being kept from them. */}
                <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                  {hasLiveSubscription
                    ? `${formatMoney(plan.data.price_cents, plan.data.currency)} a ${plan.data.bill_every}.`
                    : `The subscription is ${formatMoney(plan.data.price_cents, plan.data.currency)} a ${plan.data.bill_every} and would give you the same thing, so there is nothing to pay for now.`}
                </p>
                <Link
                  to="/account/payments"
                  className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                >
                  {hasLiveSubscription ? 'Manage it' : 'See the details'} &rarr;
                </Link>
              </>
            )}
          </section>
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
              Yours to keep, even if a course stops being offered to anybody
              else.
            </p>
            {/* The way through, now that receipts live in the account menu
                rather than the main nav. */}
            <Link
              to="/individual/receipts"
              className="mt-2 inline-block text-sm font-semibold text-primary hover:underline"
            >
              Receipts &rarr;
            </Link>
          </>
        )}
        {/* THIS PANEL HAS NOW OUTLIVED BOTH THINGS IT WAS WRITTEN ABOUT.
            Paying went first (db/092), and booking went with db/102-104. What is
            left is narrower and true: you can ask for a session, and nothing
            sends anybody an email about it. Kept and narrowed rather than
            deleted, because a note about what is missing has to be maintained as
            carefully as the features or it becomes the most confident wrong
            sentence on the page. */}
        <section className="mt-10 rounded-card border border-border bg-background p-6">
          <h2 className="font-semibold text-foreground">Worth knowing</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            You can ask a specialist for a session, and they answer here. You
            are emailed when they do, so you do not have to keep checking &mdash;
            though what you wrote about what you are finding hard stays in this
            account and never goes in the email. There is no price for a session
            either, so nobody will ask you for a card.
          </p>
        </section>
        </aside>
      </div>
    </div>
  )
}
