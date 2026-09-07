import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  askForGoalReview,
  fetchGoalReviewRequests,
  queryKeys,
  type GoalRow,
} from '../lib/api'
import { showToast } from '../lib/toast'

/**
 * A family asking a specialist to look at a goal — db/117, FR24.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A MESSAGE
 * ---------------------------------------------------------------------------
 * A family can already message the specialist, and that is what they have had
 * to do. The difference is where it lands: a message is a conversation
 * somebody has to be reading, and this is a queue on the specialist's own
 * screen that stays there until it is answered. The request the school most
 * needs to see should not depend on who opened the thread.
 *
 * ---------------------------------------------------------------------------
 * ONE OPEN QUESTION PER GOAL, AND THE SCREEN SAYS SO BEFORE THE DATABASE DOES
 * ---------------------------------------------------------------------------
 * db/117 has a partial unique index for this, because a worried parent presses
 * a button again. The form is replaced by the pending request rather than left
 * available to press — a refusal you could have prevented is a worse answer
 * than not offering the control.
 */
export default function GoalReviewSection({
  studentId,
  goals,
}: {
  studentId: string
  goals: GoalRow[]
}) {
  const queryClient = useQueryClient()
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const requests = useQuery({
    queryKey: queryKeys.goalReviews(studentId),
    queryFn: () => fetchGoalReviewRequests(studentId),
  })

  const ask = useMutation({
    mutationFn: (goalId: string) =>
      askForGoalReview({ goalId, studentId, note }),
    onSuccess: async () => {
      setOpenFor(null)
      setNote('')
      showToast('Asked. The specialist will answer here.')
      await queryClient.invalidateQueries({
        queryKey: queryKeys.goalReviews(studentId),
      })
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  const forGoal = (goalId: string) =>
    (requests.data ?? []).filter((r) => r.goal_id === goalId)

  if (goals.length === 0) return null

  return (
    <>
      <h2 className="mt-10 mb-1 text-lg font-semibold text-foreground">
        Asking a specialist
      </h2>
      <p className="mb-3 max-w-prose text-sm text-muted-foreground">
        If a goal does not seem to be moving, you can ask the specialist working
        with your child to look at it. It goes onto their list rather than into
        a conversation, so it waits there until they answer.
      </p>

      <ul className="space-y-3">
        {goals.map((goal) => {
          const history = forGoal(goal.id)
          const pending = history.find((r) => r.status === 'open')
          const answered = history.filter((r) => r.status !== 'open')

          return (
            <li
              key={goal.id}
              className="rounded-card border border-border bg-card shadow-raised p-4"
            >
              <p className="font-semibold text-foreground">{goal.title}</p>

              {pending && (
                <div className="mt-2 rounded-btn bg-warning-subtle px-3 py-2">
                  <p className="text-sm font-medium text-warning-foreground">
                    Waiting for an answer
                  </p>
                  {pending.note && (
                    <p className="mt-0.5 text-sm text-foreground">
                      You wrote: {pending.note}
                    </p>
                  )}
                </div>
              )}

              {answered.map((r) => (
                <div key={r.id} className="mt-2 rounded-btn bg-background px-3 py-2">
                  <p className="text-sm font-medium text-foreground">
                    {r.status === 'answered'
                      ? 'The specialist answered'
                      : 'The specialist could not take this on'}
                  </p>
                  {r.response ? (
                    <p className="mt-0.5 text-sm text-foreground">{r.response}</p>
                  ) : (
                    /* An answer with no words is still an answer, and saying so
                       beats an empty box that reads as a loading state. */
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      They marked it looked at without writing anything.
                    </p>
                  )}
                </div>
              ))}

              {!pending &&
                (openFor === goal.id ? (
                  <div className="mt-3">
                    <label
                      htmlFor={`review-note-${goal.id}`}
                      className="block text-sm font-semibold text-foreground"
                    >
                      What has you worried, if you want to say
                    </label>
                    <textarea
                      id={`review-note-${goal.id}`}
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="It has been at the same point since term 3 and mornings are getting harder."
                      className="mt-1 w-full rounded-btn border border-input-border bg-card px-3 py-2 text-foreground"
                    />
                    <p className="mt-1 text-sm text-muted-foreground">
                      Optional. &ldquo;Please look at this&rdquo; is a complete
                      request.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={ask.isPending}
                        onClick={() => ask.mutate(goal.id)}
                        className="inline-flex min-h-11 items-center rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        {ask.isPending ? 'Asking…' : 'Send the request'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenFor(null)
                          setNote('')
                        }}
                        className="inline-flex min-h-11 items-center rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenFor(goal.id)
                      setNote('')
                    }}
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
                  >
                    Ask a specialist to look at this
                  </button>
                ))}
            </li>
          )
        })}
      </ul>
    </>
  )
}
