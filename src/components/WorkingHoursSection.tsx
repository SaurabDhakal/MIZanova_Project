import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addAvailability,
  fetchAvailability,
  queryKeys,
  removeAvailability,
  WEEKDAYS,
} from '../lib/api'
import { showToast } from '../lib/toast'

/**
 * Setting when somebody actually works — db/102.
 *
 * ---------------------------------------------------------------------------
 * THE SENTENCE THIS EXISTS TO DELETE
 * ---------------------------------------------------------------------------
 * Schedule.tsx has carried this since it was written:
 *
 *     An empty slot in the grid means nothing is booked in it, not that you
 *     are free — working hours are recorded nowhere in MiZanova.
 *
 * That was true and it is the reason nobody could book anything. Joe's brief
 * sells bookable advisory sessions; the product had a calendar that could only
 * show what had already happened.
 *
 * ---------------------------------------------------------------------------
 * A PATTERN, NOT A DIARY
 * ---------------------------------------------------------------------------
 * "Tuesday mornings" is what a person knows about their own week. The screen
 * asks for exactly that and nothing more — no dates, no recurrence rules, no
 * end date. What is free on a particular Tuesday is this minus what is booked,
 * worked out when somebody asks.
 *
 * The overlap rule is enforced by an exclusion constraint in the database, so
 * this component does not check it. It just reports the refusal in a sentence
 * a person can act on, which is the only part Postgres cannot do.
 */
export default function WorkingHoursSection({
  specialistId,
  canEdit,
}: {
  specialistId: string
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const [weekday, setWeekday] = useState(1)
  const [startsAt, setStartsAt] = useState('09:00')
  const [endsAt, setEndsAt] = useState('12:00')

  const bands = useQuery({
    queryKey: queryKeys.availability(specialistId),
    queryFn: () => fetchAvailability(specialistId),
  })

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.availability(specialistId),
    })

  const add = useMutation({
    mutationFn: addAvailability,
    onSuccess: refresh,
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: removeAvailability,
    onSuccess: refresh,
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const byDay = WEEKDAYS.map((label, i) => ({
    label,
    weekday: i,
    bands: (bands.data ?? []).filter((b) => b.weekday === i),
  }))

  /* Monday first. The database stores 0 = Sunday to match Postgres, and a
     working week that opens on Sunday reads as a mistake to everybody who
     uses it. The storage order and the reading order are different problems. */
  const week = [...byDay.slice(1), byDay[0]]

  const hhmm = (t: string) => t.slice(0, 5)

  return (
    <section className="mt-8 rounded-card border border-border bg-card p-6 shadow-raised">
      <h2 className="text-lg font-bold text-foreground">Your working hours</h2>
      <p className="mt-1 max-w-prose text-muted-foreground">
        When you are available in an ordinary week. This is what a family or an
        individual sees when they look for a time &mdash; an empty day means you
        are not offering one, rather than that nothing happens to be booked.
      </p>

      {bands.isError && (
        <p className="mt-3 text-sm text-danger-foreground">
          {bands.error.message}
        </p>
      )}

      <ul className="mt-5 divide-y divide-border border-y border-border">
        {week.map((day) => (
          <li
            key={day.label}
            className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3"
          >
            <span className="w-28 font-medium text-foreground">{day.label}</span>
            {day.bands.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                Not available
              </span>
            ) : (
              <span className="flex flex-wrap gap-2">
                {day.bands.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-2 rounded-btn bg-primary-subtle px-3 py-1 text-sm font-medium text-foreground"
                  >
                    <span className="tabular-nums">
                      {hhmm(b.starts_at)}&ndash;{hhmm(b.ends_at)}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => remove.mutate(b.id)}
                        className="text-muted-foreground hover:text-danger-foreground"
                        aria-label={`Remove ${day.label} ${hhmm(b.starts_at)} to ${hhmm(b.ends_at)}`}
                      >
                        &times;
                      </button>
                    )}
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="av-day" className="block text-sm font-medium text-foreground">
              Day
            </label>
            <select
              id="av-day"
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              className="mt-1 rounded-btn border border-input-border bg-background p-2.5 text-foreground"
            >
              {[...WEEKDAYS.slice(1), WEEKDAYS[0]].map((label) => (
                <option key={label} value={WEEKDAYS.indexOf(label)}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="av-from" className="block text-sm font-medium text-foreground">
              From
            </label>
            <input
              id="av-from"
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 rounded-btn border border-input-border bg-background p-2.5 text-foreground"
            />
          </div>
          <div>
            <label htmlFor="av-to" className="block text-sm font-medium text-foreground">
              To
            </label>
            <input
              id="av-to"
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 rounded-btn border border-input-border bg-background p-2.5 text-foreground"
            />
          </div>
          <button
            type="button"
            disabled={add.isPending || endsAt <= startsAt}
            onClick={() =>
              add.mutate({ specialistId, weekday, startsAt, endsAt })
            }
            className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {add.isPending ? 'Adding…' : 'Add hours'}
          </button>
          {endsAt <= startsAt && (
            <p className="w-full text-sm text-muted-foreground">
              The finish has to be after the start.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
