import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  cancelMyBooking,
  fetchBookableSpecialists,
  fetchFreeSlots,
  fetchMyBookings,
  markBookingAnswersSeen,
  queryKeys,
  requestBooking,
} from '../../lib/api'
import { showToast } from '../../lib/toast'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import Avatar from '../../components/Avatar'
import Icon from '../../components/Icon'

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
  /* Read once when the screen mounts, and up here with the other hooks rather
     than beside the code that uses it — "in 3 days" must not change while
     somebody is choosing a time, and a hook after an early return is not a
     hook at all. */
  const [now] = useState(() => Date.now())
  const [showAllDays, setShowAllDays] = useState(false)

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

  /*
   * CLEARS THE BELL — db/105.
   *
   * Runs once when this screen opens, because opening it IS having seen the
   * answer: the requests are the first thing on the page. Not awaited and its
   * failure is swallowed on purpose — somebody reading their answer should not
   * meet an error about a notification badge.
   */
  useEffect(() => {
    void markBookingAnswersSeen()
      // The bell's own key, so its badge drops without waiting for its
      // two-minute staleness to expire.
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.workQueue('individual'),
        }),
      )
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
   * ---------------------------------------------------------------------
   * A CONFIRMED SESSION IS NOT A REQUEST, AND WAS FILED AS ONE
   * ---------------------------------------------------------------------
   * Everything sat in one list called "Your requests" at equal weight. But an
   * accepted session is an appointment — a thing somebody has to be somewhere
   * for — and a pending one is a question waiting on an answer. Reading them
   * as the same kind of object is how you miss the Tuesday you agreed to.
   *
   * Past ones drop out of "coming up" on their own, because an appointment
   * that has happened is not something to remember.
   */
  const comingUp = live
    .filter((b) => b.status === 'accepted' && +new Date(b.starts_at) > now)
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
  const waiting = live.filter((b) => b.status === 'requested')
  const answeredNo = live.filter((b) => b.status === 'declined')

  /** "in 3 days", "tomorrow" — the thing somebody actually wants to know. */
  const howSoon = (iso: string) => {
    const days = Math.round((+new Date(iso) - now) / 86400000)
    if (days <= 0) return 'today'
    if (days === 1) return 'tomorrow'
    if (days < 14) return `in ${days} days`
    return `in ${Math.round(days / 7)} weeks`
  }

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
      {/* TWO PARAGRAPHS OF CAVEATS BECAME THREE CHIPS. The facts are the same
          and they are the facts somebody actually wants — how long, what it
          costs, whether pressing the button commits them — but as things you
          can take in at a glance rather than prose to read before you are
          allowed to start. */}
      <header className="mb-8">
        <h1 className="text-title text-foreground">Ask for a session</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Time with a verified specialist from the Special Miles network.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {[
            ['stopwatch', '45 minutes'],
            ['tick', 'Nothing to pay'],
            ['hand', 'They decide — you are asking'],
          ].map(([icon, label]) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-btn bg-primary-subtle px-3 py-1.5 text-sm font-medium text-foreground"
            >
              <Icon
                name={icon as 'tick'}
                className="h-4 w-4 shrink-0 text-primary"
              />
              {label}
            </li>
          ))}
        </ul>
      </header>

      {/* ---------------------------------------------------------------
          COMING UP — an appointment, given the weight of one.
          --------------------------------------------------------------- */}
      {comingUp.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Coming up
          </h2>
          <ul className="space-y-3">
            {comingUp.map((b) => {
              const who = specialists.data.find((s) => s.id === b.specialist_id)
              return (
                <li
                  key={b.id}
                  className="rounded-card border border-success bg-success-subtle p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-bold tracking-wider text-success-foreground uppercase">
                        Confirmed &middot; {howSoon(b.starts_at)}
                      </p>
                      <p className="mt-1 text-xl font-bold text-foreground">
                        {when(b.starts_at)}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-sm text-foreground">
                        <Avatar
                          id={b.specialist_id}
                          name={who?.full_name ?? ''}
                          size="sm"
                        />
                        with {who?.full_name ?? 'a specialist'}
                      </p>
                      {b.purpose && (
                        <p className="mt-3 max-w-prose border-l-2 border-success pl-3 text-sm text-foreground">
                          {b.purpose}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => cancel.mutate(b.id)}
                      className="shrink-0 text-sm font-semibold text-muted-foreground hover:text-danger-foreground hover:underline"
                    >
                      Withdraw this
                    </button>
                  </div>
                  {/* NOTHING EMAILS EITHER OF YOU — said on the card that
                      matters, not only in a note at the bottom of the home
                      screen. Somebody who thinks a reminder is coming will
                      miss this. */}
                  <p className="mt-4 text-xs text-muted-foreground">
                    No reminder will be sent for this. It is worth putting in
                    your own calendar.
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* --- still waiting, and answered no --------------------------------- */}
      {[...waiting, ...answeredNo].length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            {waiting.length > 0 ? 'Waiting for an answer' : 'Answered'}
          </h2>
          <ul className="mb-10 space-y-3">
            {[...waiting, ...answeredNo].map((b) => {
              const who = specialists.data.find((s) => s.id === b.specialist_id)
              return (
                <li
                  key={b.id}
                  className="rounded-card border border-border bg-card p-5 shadow-raised"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar
                        id={b.specialist_id}
                        name={who?.full_name ?? ''}
                        size="sm"
                      />
                      <div>
                        <p className="font-semibold text-foreground">
                          {when(b.starts_at)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          with {who?.full_name ?? 'a specialist'}
                        </p>
                      </div>
                    </div>
                    {/* A PILL WITH A DOT, not coloured text — docs/14 §"Small
                        things that add up". The dot carries the state at a
                        glance and the word carries it for anybody who cannot
                        tell the colours apart. */}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-btn px-2.5 py-1 text-xs font-semibold ${
                        b.status === 'accepted'
                          ? 'bg-success-subtle text-success-foreground'
                          : b.status === 'declined'
                            ? 'bg-danger-subtle text-danger-foreground'
                            : 'bg-warning-subtle text-warning-foreground'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 rounded-full ${
                          b.status === 'accepted'
                            ? 'bg-success-foreground'
                            : b.status === 'declined'
                              ? 'bg-danger-foreground'
                              : 'bg-warning-foreground'
                        }`}
                      />
                      {b.status === 'requested'
                        ? 'Waiting for an answer'
                        : b.status === 'accepted'
                          ? 'Confirmed'
                          : 'Declined'}
                    </span>
                  </div>
                  {b.purpose && (
                    <p className="mt-3 max-w-prose border-l-2 border-border pl-3 text-sm text-muted-foreground">
                      {b.purpose}
                    </p>
                  )}
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
                  <span className="flex items-center gap-3">
                    <Avatar id={s.id} name={s.full_name ?? ''} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-foreground">
                        {s.full_name ?? 'A specialist'}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-sm text-success-foreground">
                        <Icon name="verification" className="h-4 w-4 shrink-0" />
                        Verified by Special Miles
                      </span>
                      {/* THEIR ACTUAL HOURS, not a generic line. It is the one
                          fact that decides whether asking them is worth it,
                          and the view already carries the count. */}
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {s.availability_bands === 1
                          ? 'Available one part of the week'
                          : `Available ${s.availability_bands} parts of the week`}
                      </span>
                    </span>
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

          {/* THREE DAYS, THEN THE REST ON ASK. Three weeks of a specialist's
              week is twenty-four buttons in nine groups, which is a wall
              somebody scrolls past rather than a choice they make. The nearest
              days are the ones most people want anyway, and the rest are one
              press away. */}
          {[...byDay.entries()]
            .slice(0, showAllDays ? undefined : 3)
            .map(([day, times]) => (
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

          {byDay.size > 3 && !showAllDays && (
            <button
              type="button"
              onClick={() => setShowAllDays(true)}
              className="mt-4 rounded-btn border border-border bg-card px-4 py-2 font-semibold text-foreground"
            >
              Show the other {byDay.size - 3} day
              {byDay.size - 3 === 1 ? '' : 's'}
            </button>
          )}
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
