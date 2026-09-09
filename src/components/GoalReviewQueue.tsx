import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { answerGoalReview, fetchOpenGoalReviews, queryKeys } from '../lib/api'
import { showToast } from '../lib/toast'

/**
 * Families who have asked a specialist to look at a goal — db/117, FR24.
 *
 * Shipped with the asking, for the reason `SessionRequestsSection` gives about
 * itself: a request that lands nowhere is a capability with no consumer, and a
 * parent pressing "ask a specialist" and never hearing back would be worse
 * than the message they would otherwise have sent.
 *
 * ---------------------------------------------------------------------------
 * DECLINING IS NOT REFUSING TO HELP
 * ---------------------------------------------------------------------------
 * A specialist may be the wrong person — the goal is a classroom one, or the
 * child is not on their caseload for that area. "Could not take this on" says
 * that without implying the family was wrong to ask, and it still carries the
 * box to say where to go instead. The database keeps both outcomes; neither
 * deletes the question.
 */
export default function GoalReviewQueue() {
  const queryClient = useQueryClient()
  const [answeringId, setAnsweringId] = useState<string | null>(null)
  const [response, setResponse] = useState('')

  const requests = useQuery({
    queryKey: queryKeys.openGoalReviews,
    queryFn: fetchOpenGoalReviews,
  })

  const answer = useMutation({
    mutationFn: (input: { id: string; status: 'answered' | 'declined' }) =>
      answerGoalReview(input.id, input.status, response),
    onSuccess: async () => {
      setAnsweringId(null)
      setResponse('')
      showToast('Answered. The family sees it on their goals screen.')
      await queryClient.invalidateQueries({ queryKey: queryKeys.openGoalReviews })
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  // Nothing waiting needs no box drawn round it; a failed lookup does, because
  // silence would read as "no families are asking".
  if (requests.isSuccess && requests.data.length === 0) return null

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        Families asking about a goal
      </h2>

      {requests.isError && (
        <p
          role="alert"
          className="rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
        >
          These could not be loaded, so this is unknown rather than empty.{' '}
          {requests.error.message}
        </p>
      )}

      <ul className="space-y-3">
        {(requests.data ?? []).map((r) => (
          <li
            key={r.id}
            className="rounded-card border border-border bg-card shadow-raised p-4"
          >
            <p className="font-semibold text-foreground">
              {r.students
                ? `${r.students.first_name} ${r.students.last_name}`
                : 'A student'}{' '}
              &middot; {r.goals?.title ?? 'a goal'}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Asked{' '}
              {new Date(r.created_at).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'long',
              })}
            </p>
            {r.note && (
              <p className="mt-2 max-w-prose text-foreground">{r.note}</p>
            )}

            {answeringId === r.id ? (
              <div className="mt-3">
                <label
                  htmlFor={`answer-${r.id}`}
                  className="block text-sm font-semibold text-foreground"
                >
                  What you want the family to know
                </label>
                <textarea
                  id={`answer-${r.id}`}
                  rows={3}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="I will watch this in Thursday's session and we can talk after."
                  className="mt-1 w-full rounded-btn border border-input-border bg-card px-3 py-2 text-foreground"
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  This goes to the family. Clinical notes belong in the session
                  record, which they never see.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={answer.isPending}
                    onClick={() => answer.mutate({ id: r.id, status: 'answered' })}
                    className="pressable inline-flex min-h-11 items-center rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Send the answer
                  </button>
                  <button
                    type="button"
                    disabled={answer.isPending}
                    onClick={() => answer.mutate({ id: r.id, status: 'declined' })}
                    className="pressable inline-flex min-h-11 items-center rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
                  >
                    Not the right person
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnsweringId(null)
                      setResponse('')
                    }}
                    className="inline-flex min-h-11 items-center rounded-btn px-4 py-2 text-sm font-semibold text-foreground"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAnsweringId(r.id)
                  setResponse('')
                }}
                className="pressable mt-3 inline-flex min-h-11 items-center rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Answer this
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
