import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  answerBooking,
  fetchIncomingBookings,
  queryKeys,
} from '../lib/api'
import { showToast } from '../lib/toast'

/**
 * Answering somebody who asked for an hour — db/103.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SHIPPED WITH THE ASKING
 * ---------------------------------------------------------------------------
 * A request that lands nowhere is the first of the four faults this codebase
 * keeps finding in itself: a capability with no consumer. An individual
 * pressing "ask" and never hearing back would be worse than not offering it.
 *
 * ---------------------------------------------------------------------------
 * DECLINING NEEDS A REASON, AND THE FORM MAKES THAT AWKWARD TO SKIP
 * ---------------------------------------------------------------------------
 * A refusal with no explanation is the thing people remember about a product,
 * and this is a person who wrote down something they were finding hard. The
 * note is not compulsory — a specialist with nothing to add should not be
 * blocked — but declining opens the box first, so writing one line is the path
 * of least resistance rather than an extra step.
 */
export default function SessionRequestsSection() {
  const queryClient = useQueryClient()
  const [answering, setAnswering] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const incoming = useQuery({
    queryKey: queryKeys.incomingBookings,
    queryFn: fetchIncomingBookings,
  })

  const answer = useMutation({
    mutationFn: answerBooking,
    onSuccess: async () => {
      setAnswering(null)
      setNote('')
      showToast('Answered.')
      await queryClient.invalidateQueries({
        queryKey: queryKeys.incomingBookings,
      })
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const waiting = (incoming.data ?? []).filter((b) => b.status === 'requested')
  const settled = (incoming.data ?? []).filter(
    (b) => b.status === 'accepted' && new Date(b.starts_at) > new Date(),
  )

  // Nothing to show and nothing to explain — an empty section here would be
  // clutter on a screen that already has a calendar on it.
  if (incoming.isPending || (waiting.length === 0 && settled.length === 0)) {
    return null
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
    })

  return (
    <section className="mt-8 rounded-card border border-border bg-card p-6 shadow-raised">
      <h2 className="text-lg font-bold text-foreground">Session requests</h2>
      <p className="mt-1 max-w-prose text-muted-foreground">
        People with no school attached, asking for time with you. Accepting puts
        it in your calendar; nothing emails either of you yet.
      </p>

      {waiting.length === 0 && (
        <p className="mt-4 text-muted-foreground">
          Nothing waiting for an answer.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {waiting.map((b) => (
          <li
            key={b.id}
            className="rounded-card border border-border bg-background p-4"
          >
            <p className="font-semibold text-foreground">{when(b.starts_at)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {b.profiles?.full_name ?? 'Somebody'} asked
            </p>
            {b.purpose && (
              <p className="mt-2 max-w-prose border-l-2 border-brand-green pl-3 text-sm text-foreground">
                {b.purpose}
              </p>
            )}

            {answering === b.id ? (
              <div className="mt-3">
                <label
                  htmlFor={`note-${b.id}`}
                  className="block text-sm font-medium text-foreground"
                >
                  Anything to say to them?
                </label>
                <textarea
                  id={`note-${b.id}`}
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-btn border border-input-border bg-card p-2.5 text-foreground"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={answer.isPending}
                    onClick={() =>
                      answer.mutate({ id: b.id, status: 'declined', note })
                    }
                    className="rounded-btn bg-danger px-4 py-2 font-semibold text-danger-foreground disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnswering(null)
                      setNote('')
                    }}
                    className="rounded-btn border border-border bg-card px-4 py-2 font-semibold text-foreground"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={answer.isPending}
                  onClick={() =>
                    answer.mutate({ id: b.id, status: 'accepted', note: '' })
                  }
                  className="rounded-btn bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnswering(b.id)
                    setNote('')
                  }}
                  className="rounded-btn border border-border bg-card px-4 py-2 font-semibold text-foreground"
                >
                  Decline&hellip;
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {settled.length > 0 && (
        <>
          <p className="mt-6 text-sm font-semibold text-foreground">
            Coming up
          </p>
          <ul className="mt-2 space-y-1">
            {settled.map((b) => (
              <li key={b.id} className="text-sm text-muted-foreground">
                {when(b.starts_at)} &mdash;{' '}
                {b.profiles?.full_name ?? 'somebody'}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
