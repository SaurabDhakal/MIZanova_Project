import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addMyGoal,
  checkInOnGoal,
  deleteMyGoal,
  fetchMyGoalsPersonal,
  queryKeys,
  setMyGoalStatus,
  type GoalCheckin,
  type IndividualGoal,
} from '../../lib/api'
import { showToast } from '../../lib/toast'
import { ErrorState, LoadingCards } from '../../components/QueryState'

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
  const [title, setTitle] = useState('')
  const [why, setWhy] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [adding, setAdding] = useState(false)

  const goals = useQuery({
    queryKey: queryKeys.myPersonalGoals,
    queryFn: fetchMyGoalsPersonal,
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.myPersonalGoals })

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
        <p className="mt-1 max-w-prose text-muted-foreground">
          One thing at a time, in your own words. Nobody else can see any of
          this &mdash; there is no score and nothing is reported anywhere.
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
                  <button
                    type="button"
                    onClick={() => remove.mutate(goal.id)}
                    className="text-sm font-semibold text-muted-foreground hover:text-danger-foreground hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
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

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-btn bg-primary px-4 py-2 font-semibold text-primary-foreground"
        >
          How is it going?
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-btn border border-border bg-background px-4 py-2 font-semibold text-foreground"
        >
          Done with this
        </button>
        <button
          type="button"
          onClick={onPark}
          className="rounded-btn border border-border bg-background px-4 py-2 font-semibold text-foreground"
        >
          Park it
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto text-sm font-semibold text-muted-foreground hover:text-danger-foreground hover:underline"
        >
          Delete
        </button>
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
          <p className="mt-5 text-sm font-semibold text-foreground">
            {checkins.length} check-in{checkins.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-2 space-y-2">
            {checkins.slice(0, 5).map((c) => (
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
                {c.note && (
                  <span className="ml-3 text-muted-foreground">{c.note}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </li>
  )
}
