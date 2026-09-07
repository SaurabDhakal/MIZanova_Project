import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addMyGoal,
  goalNeedsAsking,
  sinceLastLook,
  snoozeGoalNudge,
  checkInOnGoal,
  deleteMyGoal,
  fetchAiMemory,
  fetchMyGoalsPersonal,
  queryKeys,
  setMyGoalStatus,
  type GoalCheckin,
  type IndividualGoal,
} from '../../lib/api'
import { Link } from 'react-router-dom'
import { showToast } from '../../lib/toast'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import WhatWorksLink from '../../components/WhatWorksLink'

/**
 * What somebody is working on — db/101.
 *
 * ---------------------------------------------------------------------------
 * THE THING THAT MAKES THIS AN ACCOUNT RATHER THAN A READING LIST
 * ---------------------------------------------------------------------------
 * Everything else an individual has answers a question once and forgets it. A
 * goal is the only part of the product that holds a thread from one week to
 * the next, which is what Joe's brief means by "capacity-building rather than
 * one-off intervention".
 *
 * ---------------------------------------------------------------------------
 * THREE DECISIONS WORTH DEFENDING
 * ---------------------------------------------------------------------------
 * THE REASON IS SHOWN, NOT FILED. A goal somebody sets for themselves at
 * eleven at night is abandoned when they forget why they set it. Their own
 * words, six weeks later, are the most useful thing this screen can put in
 * front of them, so the "why" sits under the title rather than behind an edit
 * button.
 *
 * NO STREAK, NO PERCENTAGE. A broken streak punishes the person who most needs
 * to come back, and a percentage implies somebody is measuring. Nobody is
 * reporting on an adult who decided to work on something.
 *
 * "HARD" IS AN ANSWER, NOT A FAILURE. The three check-in options are weighted
 * so the honest one is easy to press — a scale where the bottom option feels
 * like an admission gets pressed as "mixed" forever and the record stops being
 * true.
 */

const HOW: { value: GoalCheckin['how_it_went']; label: string; tone: string }[] =
  [
    { value: 'good', label: 'Went well', tone: 'text-success-foreground' },
    { value: 'mixed', label: 'Mixed', tone: 'text-foreground' },
    { value: 'hard', label: 'Hard going', tone: 'text-warning-foreground' },
  ]

export default function Goals() {
  const queryClient = useQueryClient()
  /* Which finished/parked goal is asking to be confirmed. One id rather than a
     set: two confirmations open at once is not a state worth supporting. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [why, setWhy] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [adding, setAdding] = useState(false)

  const goals = useQuery({
    queryKey: queryKeys.myPersonalGoals,
    queryFn: fetchMyGoalsPersonal,
  })
  /* db/107. This screen promises nobody else can see any of this, and that
     stops being true the moment somebody lets the AI read it. The promise has
     to know. */
  const memory = useQuery({ queryKey: queryKeys.aiMemory, queryFn: fetchAiMemory })

  /*
   * THE BELL COUNTS THE SAME GOALS THIS SCREEN SHOWS, so it has to be told
   * when they change. Without this, snoozing a nudge cleared the prompt here
   * and left the badge lit for two minutes — the bell reporting one thing
   * while the screen it points at showed another, which is the one thing
   * NotificationBell.tsx says must never happen.
   */
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.myPersonalGoals }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.workQueue('individual'),
      }),
    ])

  const add = useMutation({
    mutationFn: addMyGoal,
    onSuccess: async () => {
      setTitle('')
      setWhy('')
      setTargetDate('')
      setAdding(false)
      await refresh()
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const status = useMutation({
    mutationFn: ({ id, to }: { id: string; to: IndividualGoal['status'] }) =>
      setMyGoalStatus(id, to),
    onSuccess: refresh,
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: deleteMyGoal,
    onSuccess: async () => {
      showToast('Deleted.')
      await refresh()
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  if (goals.isPending) return <LoadingCards count={2} />
  if (goals.isError) {
    return (
      <ErrorState
        message={goals.error.message}
        onRetry={() => void goals.refetch()}
      />
    )
  }

  const active = goals.data.filter((g) => g.status === 'active')
  // Open when asked for, and open anyway when there is nothing else on the
  // screen — an empty page with a button that reveals a form is a step nobody
  // needs.
  const showForm = adding || goals.data.length === 0
  const finished = goals.data.filter((g) => g.status !== 'active')

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">What you are working on</h1>
        {/* THE PROMISE CHANGES WITH THE SWITCH, because otherwise it is a
            lie the moment somebody turns memory on — and it would be a lie on
            the screen where they typed the thing. db/107 made that switch
            opt-in; this is the other half of keeping it honest. */}
        <p className="mt-1 max-w-prose text-muted-foreground">
          One thing at a time, in your own words. There is no score and nothing
          is reported anywhere.{' '}
          {memory.data ? (
            <>
              No person can see any of this. You have chosen to let the AI read
              it when you ask it something, so it can build on what you are
              already doing &mdash; you can turn that off on the{' '}
              <Link
                to="/individual/suggestions"
                className="font-medium text-primary hover:underline"
              >
                suggestions page
              </Link>
              .
            </>
          ) : (
            'Nobody else can see any of this, and it is not sent to the AI unless you ask for that.'
          )}
        </p>
      </header>

      {/* ---------------------------------------------------------------
          THE FORM GETS OUT OF THE WAY ONCE THERE IS SOMETHING TO SEE.

          It was open at the top on every visit, so the first thing somebody
          met when coming back to check on their goal was a blank form asking
          for another one. That is backwards: this screen is opened far more
          often to look than to add.

          Open by default only when there is nothing yet — then the form IS the
          screen and hiding it behind a button would be a step for no reason.
          --------------------------------------------------------------- */}
      {!showForm && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-btn border border-border bg-card px-4 py-2.5 font-semibold text-foreground shadow-raised"
        >
          Set something new
        </button>
      )}

      {showForm && (
      <section className="rounded-card border border-border bg-card p-5 shadow-raised">
        <h2 className="font-semibold text-foreground">Set something</h2>
        <label htmlFor="goal-title" className="mt-3 block text-sm font-medium text-foreground">
          What do you want to be different?
        </label>
        <input
          id="goal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Start the day without losing the morning"
          className="mt-1 w-full rounded-btn border border-input-border bg-background p-2.5 text-foreground"
        />

        <label htmlFor="goal-why" className="mt-4 block text-sm font-medium text-foreground">
          Why it matters to you{' '}
          <span className="font-normal text-muted-foreground">
            &mdash; optional, and the part you will be glad of in six weeks
          </span>
        </label>
        <textarea
          id="goal-why"
          rows={2}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Because I keep promising myself Tuesday will be different."
          className="mt-1 w-full rounded-btn border border-input-border bg-background p-2.5 text-foreground"
        />

        <label htmlFor="goal-date" className="mt-4 block text-sm font-medium text-foreground">
          A date to look back on{' '}
          <span className="font-normal text-muted-foreground">&mdash; optional</span>
        </label>
        <input
          id="goal-date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="mt-1 rounded-btn border border-input-border bg-background p-2.5 text-foreground"
        />

        <button
          type="button"
          disabled={!title.trim() || add.isPending}
          onClick={() =>
            add.mutate({ title, why, targetDate: targetDate || null })
          }
          className="mt-4 block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {add.isPending ? 'Saving…' : 'Add it'}
        </button>
        {goals.data.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="mt-2 block text-sm font-semibold text-muted-foreground hover:underline"
          >
            Never mind
          </button>
        )}
      </section>
      )}

      {/* --- the live ones ------------------------------------------------- */}
      {active.length === 0 && (
        <p className="mt-8 max-w-prose text-muted-foreground">
          Nothing on the go. One thing is plenty &mdash; a list of ten is a list
          nobody opens twice.
        </p>
      )}

      {active.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
            On the go
          </h2>
          <ul className="space-y-4">
            {active.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onDone={() => status.mutate({ id: goal.id, to: 'done' })}
                onPark={() => status.mutate({ id: goal.id, to: 'parked' })}
                onDelete={() => remove.mutate(goal.id)}
                onCheckedIn={refresh}
              />
            ))}
          </ul>
        </>
      )}

      {finished.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
            Finished and parked
          </h2>
          <ul className="space-y-3">
            {finished.map((goal) => (
              <li
                key={goal.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-card border border-border bg-background p-4"
              >
                <div>
                  <span className="font-medium text-foreground">
                    {goal.title}
                  </span>
                  <span className="ml-3 text-sm text-muted-foreground">
                    {goal.status === 'done'
                      ? `Finished${
                          goal.done_at
                            ? ' ' +
                              new Date(goal.done_at).toLocaleDateString(
                                'en-AU',
                                { day: 'numeric', month: 'long' },
                              )
                            : ''
                        }`
                      : 'Parked'}
                  </span>
                </div>
                <div className="flex gap-3">
                  {/* PARKED IS NOT DELETED. Somebody who put something down in
                      a bad month should be able to pick it up in a better one
                      without retyping it. */}
                  <button
                    type="button"
                    onClick={() => status.mutate({ id: goal.id, to: 'active' })}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    Pick it back up
                  </button>
                  {/* Guarded for the same reason as the active list, and the
                      case is arguably stronger: a finished or parked goal is
                      the completed record, and its check-ins are the whole of
                      what somebody has to look back on. */}
                  {confirmingId === goal.id ? (
                    <>
                      <span className="text-sm text-danger-foreground">
                        Delete this and its history?
                      </span>
                      <button
                        type="button"
                        onClick={() => remove.mutate(goal.id)}
                        className="text-sm font-semibold text-danger-foreground hover:underline"
                      >
                        Delete it
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="text-sm font-semibold text-foreground hover:underline"
                      >
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(goal.id)}
                      className="text-sm font-semibold text-muted-foreground hover:text-danger-foreground hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <WhatWorksLink from="goals" />
    </div>
  )
}

function GoalCard({
  goal,
  onDone,
  onPark,
  onDelete,
  onCheckedIn,
}: {
  goal: IndividualGoal
  onDone: () => void
  onPark: () => void
  onDelete: () => void
  onCheckedIn: () => void
}) {
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)

  const snooze = useMutation({
    mutationFn: (days: number) => snoozeGoalNudge(goal.id, days),
    onSuccess: onCheckedIn,
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const checkIn = useMutation({
    mutationFn: checkInOnGoal,
    onSuccess: () => {
      setNote('')
      setOpen(false)
      showToast('Noted.')
      onCheckedIn()
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const checkins = [...goal.individual_goal_checkins].sort(
    (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
  )
  /* The ones with something actually written in them. `note` is optional —
     checking in is three buttons and typing is extra — so this is usually a
     much shorter list than `checkins`, and on many goals it is empty. */
  const written = checkins.filter((c) => c.note?.trim())
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <li className="rounded-card border border-border bg-card p-5 shadow-raised">
      <h3 className="text-lg font-bold text-foreground">{goal.title}</h3>
      {goal.why && (
        <p className="mt-1 max-w-prose border-l-2 border-brand-green pl-3 text-muted-foreground italic">
          {goal.why}
        </p>
      )}
      {goal.target_date && (
        <p className="mt-2 text-sm text-muted-foreground">
          Looking back on{' '}
          {new Date(goal.target_date).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      )}

      {/* ---------------------------------------------------------------
          ASKING, NOT TELLING THEM OFF.
          ---------------------------------------------------------------
          Every word here was chosen against the obvious version. Not "you have
          not checked in for 3 weeks" — that is a fact arranged as an
          accusation, and this account is used by people for whom a bad
          fortnight is a symptom rather than a failure of will. The elapsed
          time is still shown, because pretending not to know would be worse,
          but it is offered as context rather than as a score.

          "Not now" is a real answer with a real effect: it is not a dismissal
          somebody has to keep giving, and not a permanent one either. db/106
          has the reasoning.
          --------------------------------------------------------------- */}
      {goalNeedsAsking(goal) && !open && (
        <div className="mt-4 rounded-card border border-primary bg-primary-subtle p-4">
          <p className="font-semibold text-foreground">
            How has this been going?
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            It has been {sinceLastLook(goal)} since you last looked at it. No
            rush &mdash; even &ldquo;hard going&rdquo; is worth writing down.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Tell it how it went
            </button>
            <button
              type="button"
              disabled={snooze.isPending}
              onClick={() => snooze.mutate(7)}
              className="rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-btn bg-primary px-4 py-2 font-semibold text-primary-foreground"
        >
          How is it going?
        </button>
        {/* FOUR EQUAL BUTTONS MEANT NO PRIMARY ACTION. Checking in is the
            thing somebody opens this screen to do and it competed with two
            ways to stop and one way to erase. Finishing and parking are
            occasional and now read as such; deleting sits apart, because it is
            not in the same family as the other three. */}
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <button
            type="button"
            onClick={onDone}
            className="font-semibold text-primary hover:underline"
          >
            Done with this
          </button>
          <button
            type="button"
            onClick={onPark}
            className="font-semibold text-muted-foreground hover:underline"
          >
            Park it
          </button>
          {/* ONE CLICK USED TO DESTROY THE HISTORY. `onDelete` fired the
              mutation immediately, from a button sitting in a row with "Done
              with this" and "Park it" — two harmless status changes — and
              `individual_goal_checkins.goal_id` is ON DELETE CASCADE, so it
              took every check-in with it. The demo goal alone carries eight,
              spanning three weeks, three of them with words the person wrote.
              No undo, no warning, no way to get any of it back.

              Not the type-the-phrase dialog: that guards closing an account,
              and borrowing it here would say these are equally serious. One
              step, in place, naming what actually goes. */}
          {confirmingDelete ? (
            <>
              <span className="text-danger-foreground">
                Delete this
                {checkins.length > 0 &&
                  ` and its ${checkins.length} check-in${
                    checkins.length === 1 ? '' : 's'
                  }`}
                ? This cannot be undone.
              </span>
              <button
                type="button"
                onClick={onDelete}
                className="font-semibold text-danger-foreground hover:underline"
              >
                Delete it
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="font-semibold text-foreground hover:underline"
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="font-semibold text-muted-foreground hover:text-danger-foreground hover:underline"
            >
              Delete
            </button>
          )}
        </span>
      </div>

      {open && (
        <div className="mt-4 rounded-card border border-border bg-background p-4">
          <p className="text-sm font-medium text-foreground">
            How did it go this time?
          </p>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering — optional."
            className="mt-2 w-full rounded-btn border border-input-border bg-card p-2.5 text-foreground"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {HOW.map((h) => (
              <button
                key={h.value}
                type="button"
                disabled={checkIn.isPending}
                onClick={() =>
                  checkIn.mutate({
                    goalId: goal.id,
                    howItWent: h.value,
                    note,
                  })
                }
                className={`rounded-btn border border-border bg-card px-4 py-2 font-semibold disabled:opacity-50 ${h.tone}`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {checkins.length > 0 && (
        <>
          {/* ---------------------------------------------------------------
              THE PATTERN, WHICH IS THE WHOLE POINT OF CHECKING IN
              ---------------------------------------------------------------
              This was a list of dates and words. A list tells you what
              happened on the 6th; it does not tell you that three hard weeks
              have turned into two mixed ones, which is the only thing somebody
              tracking a goal actually wants to know and the reason they came
              back.

              Oldest on the left, so it reads the way time runs.

              NOT COLOUR ALONE. Each bar carries a title, and the counts below
              say the same thing in words — somebody who cannot tell the
              colours apart gets the identical information, which is the rule
              the rest of this product follows for status.
              --------------------------------------------------------------- */}
          {/* Its own panel, and not called "How it has been going" — that sat
              directly under a button reading "How is it going?" and the two
              were read as the same control. */}
          <div className="mt-5 rounded-card border border-border bg-background p-4">
            <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Every check-in, oldest first
            </p>
            {/* Scrolls in its own container rather than pushing the page
                sideways. Six marks fit anywhere; somebody who has checked in
                weekly since March has forty, and the phone is where they will
                be looking at them. */}
            <div
              className="mt-3 flex items-end gap-1.5 overflow-x-auto pb-1"
              aria-hidden
            >
              {[...checkins].reverse().map((c) => (
                <span
                  key={c.id}
                  title={`${new Date(c.created_at).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                  })} — ${HOW.find((h) => h.value === c.how_it_went)?.label}`}
                  /* Tall enough to be a mark rather than a speck. At 12x24 the
                     whole strip was a smear you had to lean in to read, which
                     defeats the one thing it is for. */
                  className={`h-10 w-5 shrink-0 rounded-sm ${
                    c.how_it_went === 'good'
                      ? 'bg-success-foreground'
                      : c.how_it_went === 'mixed'
                        ? 'bg-brand-blue'
                        : 'bg-warning-foreground'
                  }`}
                />
              ))}
            </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {(['good', 'mixed', 'hard'] as const)
              .map((v) => ({
                n: checkins.filter((c) => c.how_it_went === v).length,
                label: HOW.find((h) => h.value === v)!.label.toLowerCase(),
              }))
              .filter((x) => x.n > 0)
              .map((x) => `${x.n} ${x.label}`)
              .join(' · ')}
          </p>
          </div>

          {/* Three, not five. The strip above already carries the shape; this
              is here for the words somebody wrote, and a long list of them
              buries the goal underneath it.

              ONLY CHECK-INS THAT HAVE WORDS IN THEM. This took the most recent
              three regardless, and printed the note only if there was one — so
              a check-in made with the three buttons and nothing typed, which is
              the ordinary case, produced a row under "What you wrote" carrying
              a date and a label and nothing written at all. Both of those are
              already in the strip above, so the section repeated it and broke
              its own heading. On this demo goal, two of the three rows were
              empty. */}
          {written.length > 0 && (
            <>
              <p className="mt-4 text-sm font-semibold text-foreground">
                What you wrote
              </p>
              <ul className="mt-2 space-y-2">
                {written.slice(0, 3).map((c) => (
                  <li key={c.id} className="text-sm">
                    <span className="text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <span
                      className={`ml-3 font-medium ${
                        HOW.find((h) => h.value === c.how_it_went)?.tone ??
                        'text-foreground'
                      }`}
                    >
                      {HOW.find((h) => h.value === c.how_it_went)?.label}
                    </span>
                    <span className="ml-3 text-muted-foreground">{c.note}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </li>
  )
}
