import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  answerAppointmentRequest,
  fetchIncomingAppointmentRequests,
  queryKeys,
} from '../lib/api'
import { showToast } from '../lib/toast'

/**
 * Answering a family who asked for a time — db/115.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SHIPPED WITH THE ASKING
 * ---------------------------------------------------------------------------
 * `SessionRequestsSection` next to this one says it best about db/103: "a
 * request that lands nowhere is the first of the four faults this codebase
 * keeps finding in itself — a capability with no consumer." A parent pressing
 * "Ask for this time" and never hearing back would be worse than an
 * Appointments screen that stayed read-only.
 *
 * Two sections rather than one, because they are two different tables and two
 * different people: db/103's asker has no school and no child, and answering
 * them creates nothing new. Answering this one turns a request into a booking
 * in the specialist's own calendar, which is why it is an update rather than
 * an insert.
 *
 * ---------------------------------------------------------------------------
 * DECLINING OPENS THE BOX FIRST
 * ---------------------------------------------------------------------------
 * Copied deliberately from the section beside it. A refusal with no
 * explanation is the thing people remember about a product, and this is a
 * family who wrote down what they are finding hard. The note is not
 * compulsory — a specialist with nothing to add should not be blocked — but
 * writing one line is the path of least resistance rather than an extra step.
 */
export default function FamilyRequestsSection() {
  const queryClient = useQueryClient()
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const requests = useQuery({
    queryKey: queryKeys.incomingAppointmentRequests,
    queryFn: fetchIncomingAppointmentRequests,
  })

  const answer = useMutation({
    mutationFn: (input: {
      id: string
      decision: 'scheduled' | 'declined'
      note?: string
    }) => answerAppointmentRequest(input.id, input.decision, input.note),
    onSuccess: async (_data, input) => {
      setDecliningId(null)
      setNote('')
      showToast(
        input.decision === 'scheduled'
          ? 'Agreed. It is in your calendar and the family has been told.'
          : 'Declined, and the family has been told.',
      )
      await queryClient.invalidateQueries({
        queryKey: queryKeys.incomingAppointmentRequests,
      })
      await queryClient.invalidateQueries({ queryKey: ['appointments'] })
    },
  })

  // Nothing waiting is the ordinary state and does not need a box drawn round
  // it. An error does — silence would read as "no requests".
  if (requests.isSuccess && requests.data.length === 0) return null

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        Families asking for a time
      </h2>

      {requests.isError && (
        <p
          role="alert"
          className="rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
        >
          Requests could not be loaded, so this is unknown rather than empty.
          {' '}
          {requests.error.message}
        </p>
      )}

      <ul className="space-y-3">
        {(requests.data ?? []).map((r) => {
          const child = r.students
            ? `${r.students.first_name} ${r.students.last_name}`
            : 'A student'
          return (
            <li
              key={r.id}
              className="rounded-card border border-border bg-card shadow-raised p-4"
            >
              <p className="font-semibold text-foreground">
                {child} &middot;{' '}
                {new Date(r.starts_at).toLocaleString('en-AU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {r.duration_minutes} minutes
              </p>
              {r.purpose && (
                <p className="mt-2 max-w-prose text-foreground">{r.purpose}</p>
              )}

              {decliningId === r.id ? (
                <div className="mt-3">
                  <label
                    htmlFor={`decline-${r.id}`}
                    className="block text-sm font-semibold text-foreground"
                  >
                    Why not, in a line
                  </label>
                  <textarea
                    id={`decline-${r.id}`}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="I am on leave that week — try the following Tuesday."
                    className="mt-1 w-full rounded-btn border border-input-border bg-card px-3 py-2 text-foreground"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={answer.isPending}
                      onClick={() =>
                        answer.mutate({ id: r.id, decision: 'declined', note })
                      }
                      className="pressable inline-flex min-h-11 items-center rounded-btn bg-danger-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Send the decline
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDecliningId(null)
                        setNote('')
                      }}
                      className="pressable inline-flex min-h-11 items-center rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground"
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
                    onClick={() => answer.mutate({ id: r.id, decision: 'scheduled' })}
                    className="pressable inline-flex min-h-11 items-center rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Agree to this time
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecliningId(r.id)}
                    className="pressable inline-flex min-h-11 items-center rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground"
                  >
                    Cannot make it
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {answer.isError && (
        <p
          role="alert"
          className="mt-3 rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
        >
          {answer.error.message}
        </p>
      )}
    </section>
  )
}
