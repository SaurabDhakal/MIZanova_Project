import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchChildSpecialists,
  fetchFreeSlots,
  queryKeys,
  requestAppointment,
} from '../lib/api'
import { ErrorState, LoadingCards } from './QueryState'
import { showToast } from '../lib/toast'

/**
 * A family asking their child's specialist for a time — db/115, FR6, P05.
 *
 * ---------------------------------------------------------------------------
 * ONLY THE SPECIALISTS ALREADY WORKING WITH THIS CHILD
 * ---------------------------------------------------------------------------
 * P05 says "assigned specialists", and db/115's insert policy refuses anybody
 * else. This offers the same list rather than the verified directory db/104
 * built for individuals: a family should not be able to put a clinician they
 * have never met into their child's diary, and a screen that offered the
 * choice and then failed would be worse than one that never offered it.
 *
 * ---------------------------------------------------------------------------
 * IT SAYS "ASK", NOT "BOOK"
 * ---------------------------------------------------------------------------
 * Pressing this creates a request, not an appointment. A specialist has to
 * agree, and until they do nothing is held — db/115's overlap constraints
 * apply to confirmed bookings only, so the slot stays on offer to everybody
 * else. Calling it "Book" would promise a time the product has not committed
 * to, which is the exact fault the Appointments screen's own header warns
 * about: "a time on a dashboard reads as a promise".
 */
export default function AskForATimeSection({
  studentId,
  childName,
}: {
  studentId: string
  childName: string
}) {
  const queryClient = useQueryClient()
  const [specialistId, setSpecialistId] = useState('')
  const [slot, setSlot] = useState('')
  const [purpose, setPurpose] = useState('')

  const specialists = useQuery({
    queryKey: queryKeys.childSpecialists(studentId),
    queryFn: () => fetchChildSpecialists(studentId),
  })

  const slots = useQuery({
    queryKey: queryKeys.freeSlots(specialistId),
    queryFn: () => fetchFreeSlots(specialistId),
    enabled: Boolean(specialistId),
  })

  const ask = useMutation({
    mutationFn: () =>
      requestAppointment({ studentId, specialistId, startsAt: slot, purpose }),
    onSuccess: async () => {
      setSlot('')
      setPurpose('')
      showToast('Asked. You will see it here once they answer.')
      await queryClient.invalidateQueries({
        queryKey: queryKeys.appointmentsForChild(studentId),
      })
      await queryClient.invalidateQueries({ queryKey: queryKeys.freeSlots(specialistId) })
    },
  })

  if (specialists.isPending) return <LoadingCards count={1} />
  if (specialists.isError) return <ErrorState message={specialists.error.message} />

  /*
   * NOT AN EMPTY DROPDOWN. A child with no specialist on their caseload has
   * nobody to ask, and the honest answer names who can change that — the
   * school assigns specialists, not the family and not this screen.
   */
  if (specialists.data.length === 0) {
    return (
      <section className="mt-8 rounded-card border border-border bg-card shadow-raised p-5">
        <h2 className="font-bold text-foreground">Asking for a session</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          No specialist is working with {childName} at the moment, so there is
          nobody to ask yet. Specialists are assigned by the school — your
          child&rsquo;s teacher can tell you where that stands.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-8 rounded-card border border-border bg-card shadow-raised p-5">
      <h2 className="font-bold text-foreground">Ask for a session</h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        Choose a time that suits you and say what you would like to cover. The
        specialist has to agree before it is booked, so nothing is held until
        they do.
      </p>

      {ask.isError && (
        <p
          role="alert"
          className="mt-3 rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
        >
          {ask.error.message}
        </p>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="ask-specialist"
            className="block text-sm font-semibold text-foreground"
          >
            Who with
          </label>
          <select
            id="ask-specialist"
            value={specialistId}
            onChange={(e) => {
              setSpecialistId(e.target.value)
              setSlot('')
            }}
            className="mt-1 min-h-11 w-full rounded-btn border border-input-border bg-card px-3 py-2 text-foreground"
          >
            <option value="">Choose a specialist…</option>
            {specialists.data.map((s) => (
              <option key={s.profile_id} value={s.profile_id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>

        {specialistId && (
          <div>
            <label
              htmlFor="ask-slot"
              className="block text-sm font-semibold text-foreground"
            >
              When
            </label>
            {slots.isPending && (
              <p className="mt-1 text-sm text-muted-foreground">
                Looking at their diary…
              </p>
            )}
            {slots.isError && (
              <p className="mt-1 text-sm text-danger-foreground">
                Their available times could not be loaded. This is a problem
                reaching the server rather than a full diary.
              </p>
            )}
            {slots.isSuccess && slots.data.length === 0 && (
              /* An empty diary and a broken query must not look the same. */
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                They have no free times in the next three weeks. That usually
                means their working hours are full rather than unset — message
                them and they can make room.
              </p>
            )}
            {slots.isSuccess && slots.data.length > 0 && (
              <select
                id="ask-slot"
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-btn border border-input-border bg-card px-3 py-2 text-foreground"
              >
                <option value="">Choose a time…</option>
                {slots.data.map((s) => (
                  <option key={s} value={s}>
                    {new Date(s).toLocaleString('en-AU', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {slot && (
          <div>
            <label
              htmlFor="ask-purpose"
              className="block text-sm font-semibold text-foreground"
            >
              What you would like to cover
            </label>
            <textarea
              id="ask-purpose"
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Mornings have been hard since the term started."
              className="mt-1 w-full rounded-btn border border-input-border bg-card px-3 py-2 text-foreground"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              This stays in your child&rsquo;s record where the specialist reads
              it. It is not sent by email.
            </p>
          </div>
        )}

        {/* A GREYED BUTTON WITH NO REASON IS A DEAD END. It is disabled until
            a specialist and a time are both chosen, which is right — but from
            the outside that is indistinguishable from a button that does not
            work. Saying which step is outstanding costs one line. */}
        <div>
          <button
            type="button"
            disabled={!specialistId || !slot || ask.isPending}
            aria-describedby={!specialistId || !slot ? 'ask-blocked' : undefined}
            onClick={() => ask.mutate()}
            className="inline-flex min-h-11 items-center rounded-btn bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {ask.isPending ? 'Asking…' : 'Ask for this time'}
          </button>
          {(!specialistId || !slot) && (
            <p id="ask-blocked" className="mt-2 text-sm text-muted-foreground">
              {!specialistId
                ? 'Choose a specialist first, then a time.'
                : 'Choose a time and this will send.'}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
