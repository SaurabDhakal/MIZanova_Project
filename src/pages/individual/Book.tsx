import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelMyBooking,
  fetchBookableSpecialists,
  fetchFreeSlots,
  fetchMyBookings,
  queryKeys,
  requestBooking,
} from '../../lib/api'
import { showToast } from '../../lib/toast'
import { ErrorState, LoadingCards } from '../../components/QueryState'

/**
 * Asking a specialist for an hour — db/102, db/103, db/104.
 *
 * ---------------------------------------------------------------------------
 * ASKING, NOT BUYING, AND THE SCREEN SAYS SO
 * ---------------------------------------------------------------------------
 * The obvious design takes a card and confirms instantly. It would invent two
 * things nobody has decided: what a session costs, and that Special Miles will
 * see anybody who pays. plans.ts is explicit that figures come from the client,
 * and a one-to-one session is somebody's afternoon rather than a product on a
 * shelf — whether they take a particular referral is their call.
 *
 * So this asks. The specialist answers. When Special Miles sets a price, the
 * answering step gains a payment and this screen barely changes.
 *
 * ---------------------------------------------------------------------------
 * ONLY REAL TIMES ARE OFFERED
 * ---------------------------------------------------------------------------
 * The slots come from `free_slots`, which subtracts BOTH diaries — an hour
 * taken by a school appointment is not free for an individual. That check
 * happens in the database because reading a specialist's school appointments
 * is not something this browser may do; it learns that 2pm is taken and never
 * who is in it.
 */
export default function Book() {
  const queryClient = useQueryClient()
  const [chosen, setChosen] = useState<string | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [purpose, setPurpose] = useState('')

  const specialists = useQuery({
    queryKey: queryKeys.bookableSpecialists,
    queryFn: fetchBookableSpecialists,
  })
  const slots = useQuery({
    queryKey: queryKeys.freeSlots(chosen ?? 'none'),
    queryFn: () => fetchFreeSlots(chosen!),
    enabled: !!chosen,
  })
  const bookings = useQuery({
    queryKey: queryKeys.myBookings,
    queryFn: fetchMyBookings,
  })

  const ask = useMutation({
    mutationFn: requestBooking,
    onSuccess: async () => {
      setSlot(null)
      setPurpose('')
      showToast('Asked. They will let you know.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.myBookings }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.freeSlots(chosen ?? 'none'),
        }),
      ])
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const cancel = useMutation({
    mutationFn: cancelMyBooking,
    onSuccess: async () => {
      showToast('Withdrawn.')
      await queryClient.invalidateQueries({ queryKey: queryKeys.myBookings })
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  if (specialists.isPending) return <LoadingCards count={2} />
  if (specialists.isError) {
    return (
      <ErrorState
        message={specialists.error.message}
        onRetry={() => void specialists.refetch()}
      />
    )
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
    })

  const byDay = new Map<string, string[]>()
  for (const s of slots.data ?? []) {
    const day = new Date(s).toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    byDay.set(day, [...(byDay.get(day) ?? []), s])
  }

  const live = (bookings.data ?? []).filter((b) => b.status !== 'cancelled')

  /*
   * SLOTS THIS PERSON HAS ALREADY ASKED FOR.
   *
   * `free_slots` deliberately only subtracts ACCEPTED bookings — two people
   * may ask for the same hour, which is a queue rather than a clash, and
   * refusing the second would hand the slot to whoever was quicker instead of
   * to whoever the specialist chooses.
   *
   * True of the database and confusing on the screen: somebody who has just
   * asked for Tuesday at nine should not be offered Tuesday at nine as though
   * nothing happened. So the slot stays in the list and says what it is.
   */
  const alreadyAsked = new Set(
    live
      .filter((b) => b.status === 'requested' || b.status === 'accepted')
      .map((b) => new Date(b.starts_at).getTime()),
  )

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Ask for a session</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Forty-five minutes with a specialist from the Special Miles network.
          You are asking, not booking &mdash; they decide, and you will see
          their answer here.
        </p>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Nothing is charged. There is no price for a session yet, so nobody
          will ask you for a card, and asking does not commit you to anything.
        </p>
      </header>

      {/* --- what they have already asked ---------------------------------- */}
      {live.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Your requests
          </h2>
          <ul className="mb-10 space-y-3">
            {live.map((b) => {
              const who = specialists.data.find((s) => s.id === b.specialist_id)
              return (
                <li
                  key={b.id}
                  className="rounded-card border border-border bg-card p-5 shadow-raised"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-semibold text-foreground">
                      {when(b.starts_at)}
                    </p>
                    <span
                      className={`rounded-btn px-2 py-0.5 text-xs font-semibold ${
                        b.status === 'accepted'
                          ? 'bg-success-subtle text-success-foreground'
                          : b.status === 'declined'
                            ? 'bg-danger-subtle text-danger-foreground'
                            : 'bg-warning-subtle text-warning-foreground'
                      }`}
                    >
                      {b.status === 'requested'
                        ? 'Waiting for an answer'
                        : b.status === 'accepted'
                          ? 'Confirmed'
                          : 'Declined'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    with {who?.full_name ?? 'a specialist'}
                    {b.purpose ? ` — ${b.purpose}` : ''}
                  </p>
                  {/* A REFUSAL WITH NO REASON IS THE THING PEOPLE REMEMBER. */}
                  {b.outcome_note && (
                    <p className="mt-2 max-w-prose border-l-2 border-border pl-3 text-sm text-foreground">
                      {b.outcome_note}
                    </p>
                  )}
                  {b.status !== 'declined' && (
                    <button
                      type="button"
                      onClick={() => cancel.mutate(b.id)}
                      className="mt-3 text-sm font-semibold text-muted-foreground hover:text-danger-foreground hover:underline"
                    >
                      Withdraw this
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* --- nobody to ask -------------------------------------------------- */}
      {specialists.data.length === 0 && (
        <div className="rounded-card border border-border bg-card p-6 shadow-raised">
          <p className="max-w-prose text-muted-foreground">
            Nobody in the network has published hours yet, so there is nothing
            to ask for. This is not a fault with your account &mdash; when a
            specialist sets their availability they appear here.
          </p>
        </div>
      )}

      {/* --- who --------------------------------------------------------- */}
      {specialists.data.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold text-foreground">Who</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {specialists.data.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setChosen(s.id)
                    setSlot(null)
                  }}
                  aria-pressed={chosen === s.id}
                  className={`w-full rounded-card border p-5 text-left shadow-raised ${
                    chosen === s.id
                      ? 'border-primary bg-primary-subtle'
                      : 'border-border bg-card'
                  }`}
                >
                  <span className="block font-semibold text-foreground">
                    {s.full_name ?? 'A specialist'}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Verified by Special Miles
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* --- when --------------------------------------------------------- */}
      {chosen && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
            When
          </h2>

          {slots.isPending && (
            <p className="text-muted-foreground">Looking for free times…</p>
          )}
          {slots.isError && (
            <ErrorState
              message={slots.error.message}
              onRetry={() => void slots.refetch()}
            />
          )}
          {slots.isSuccess && byDay.size === 0 && (
            <p className="max-w-prose text-muted-foreground">
              Nothing free in the next three weeks. That is genuinely their
              diary rather than a limit on this screen.
            </p>
          )}

          {[...byDay.entries()].map(([day, times]) => (
            <div key={day} className="mt-4">
              <p className="text-sm font-semibold text-foreground">{day}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {times.map((t) => {
                  const asked = alreadyAsked.has(new Date(t).getTime())
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={asked}
                      onClick={() => setSlot(t)}
                      aria-pressed={slot === t}
                      className={`rounded-btn border px-4 py-2 font-medium tabular-nums ${
                        asked
                          ? 'border-border bg-background text-muted-foreground'
                          : slot === t
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-foreground'
                      }`}
                    >
                      {new Date(t).toLocaleTimeString('en-AU', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {asked && (
                        <span className="ml-2 text-xs">already asked</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {/* --- what for ----------------------------------------------------- */}
      {slot && (
        <div className="mt-8 rounded-card border border-border bg-card p-5 shadow-raised">
          <label htmlFor="purpose" className="block font-semibold text-foreground">
            What would you like out of it?
          </label>
          <p className="mt-1 text-sm text-muted-foreground">
            Optional, and it helps them come prepared. A sentence is plenty.
          </p>
          <textarea
            id="purpose"
            rows={3}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="mt-2 w-full rounded-btn border border-input-border bg-background p-3 text-foreground"
          />
          <button
            type="button"
            disabled={ask.isPending}
            onClick={() =>
              ask.mutate({
                specialistId: chosen!,
                startsAt: slot,
                purpose,
              })
            }
            className="mt-4 rounded-btn bg-primary px-5 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {ask.isPending ? 'Asking…' : `Ask for ${when(slot)}`}
          </button>
        </div>
      )}
    </div>
  )
}
