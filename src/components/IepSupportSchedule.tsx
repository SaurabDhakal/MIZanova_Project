import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createIepSupportSession,
  deleteIepSupportSession,
  fetchIepSupportSessions,
  fetchIepSupportTotal,
  IEP_WEEKDAY_LABEL,
  IEP_WEEKDAYS,
  queryKeys,
  type IepWeekday,
} from '../lib/api'
import { ErrorState, LoadingCards } from './QueryState'
import { showToast } from '../lib/toast'

/**
 * Who supports this child, on which day, for how long — db/054.
 *
 * ---------------------------------------------------------------------------
 * THE SCHEDULE IS NOT FROZEN BY AGREEMENT, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------
 * db/054 puts a freeze trigger on `iep_plans` and `iep_goals` and none on this
 * table. The goals are what the family agreed to and must not move; the roster
 * is who happens to be covering Tuesday this term, and a teaching assistant
 * leaving must not require a new plan and another meeting.
 *
 * So this section stays editable on an agreed plan while everything above it
 * goes read-only. That looks inconsistent on the screen, which is why it says
 * so rather than leaving somebody to wonder whether the freeze is broken.
 *
 * ---------------------------------------------------------------------------
 * A FAMILY DOES NOT SEE THIS
 * ---------------------------------------------------------------------------
 * db/054's policy is staff-only, and its comment gives the reason: a parent
 * needs to know their child gets four hours a week, not which teaching
 * assistant covers Tuesday — that is other people's working hours. This
 * component is mounted only on the staff editor for that reason, and the
 * database would refuse it anyway.
 */

export default function IepSupportSchedule({ planId }: { planId: string }) {
  const queryClient = useQueryClient()
  const [weekday, setWeekday] = useState<IepWeekday>('monday')
  const [staffName, setStaffName] = useState('')
  const [staffRole, setStaffRole] = useState('')
  const [intervention, setIntervention] = useState('')
  const [hours, setHours] = useState('1')
  const [error, setError] = useState<string | null>(null)

  const sessions = useQuery({
    queryKey: queryKeys.iepSupport(planId),
    queryFn: () => fetchIepSupportSessions(planId),
  })

  const total = useQuery({
    queryKey: [...queryKeys.iepSupport(planId), 'total'],
    queryFn: () => fetchIepSupportTotal(planId),
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.iepSupport(planId),
    })
  }

  const add = useMutation({
    mutationFn: () =>
      createIepSupportSession({
        planId,
        weekday,
        staffName,
        staffRole,
        intervention,
        hours: Number(hours),
      }),
    onSuccess: async () => {
      await refresh()
      setStaffName('')
      setStaffRole('')
      setIntervention('')
      setHours('1')
      setError(null)
      showToast('Session added.')
    },
    onError: (e) => setError(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteIepSupportSession(id),
    onSuccess: async () => {
      await refresh()
      showToast('Session removed.')
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  return (
    <section className="mt-8 rounded-card border border-border bg-card p-5 shadow-raised">
      <h2 className="text-section text-foreground">Support each week</h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        Who works with this child, on which day, and for how long. The weekly
        total is what a funding conversation asks for, so it is added up by the
        database rather than by hand.
      </p>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        This stays editable after the plan is agreed — staffing changes without
        the plan changing. The family sees the total hours, not the roster.
      </p>

      {/*
        A FAILED TOTAL IS NOT A MISSING ONE.

        This banner was written as `total.isSuccess && total.data && (...)`,
        which renders nothing when the query fails — so the sessions below
        would still list and the weekly figure would simply be absent. This is
        the number db/054 says goes in front of a funder; it vanishing quietly
        is worse than it being wrong, because nothing prompts anybody to look
        again. Said out loud instead.
      */}
      {total.isError && (
        <p className="mt-4 rounded-card border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          The weekly total could not be read, so it is unknown rather than
          zero. The sessions below are still what is recorded.
        </p>
      )}

      {/* The number that leaves the building, said once and prominently. */}
      {total.isSuccess && total.data && (
        <p className="mt-4 rounded-card border border-primary bg-primary-subtle px-4 py-3 text-foreground">
          <span className="text-lg font-semibold">
            {total.data.hours_per_week} hour
            {total.data.hours_per_week === 1 ? '' : 's'} a week
          </span>{' '}
          <span className="text-sm text-muted-foreground">
            across {total.data.days_covered} day
            {total.data.days_covered === 1 ? '' : 's'} · {total.data.sessions}{' '}
            session{total.data.sessions === 1 ? '' : 's'}
          </span>
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
        >
          {error}
        </p>
      )}

      {sessions.isPending && <LoadingCards count={1} />}
      {sessions.isError && (
        <ErrorState
          message={sessions.error.message}
          onRetry={() => void sessions.refetch()}
        />
      )}

      {sessions.isSuccess &&
        (sessions.data.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No support recorded yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {IEP_WEEKDAYS.map((d) => {
              const onDay = sessions.data.filter((s) => s.weekday === d)
              if (onDay.length === 0) return null
              return (
                <div key={d}>
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {IEP_WEEKDAY_LABEL[d]}
                  </h3>
                  <ul className="mt-1 space-y-1">
                    {onDay.map((s) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center gap-2 rounded-btn border border-border bg-background/60 px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-foreground">
                          {s.staff_name}
                        </span>
                        {s.staff_role && (
                          <span className="text-muted-foreground">
                            {s.staff_role}
                          </span>
                        )}
                        {s.intervention && (
                          <span className="text-muted-foreground">
                            · {s.intervention}
                          </span>
                        )}
                        <span className="ml-auto tabular-nums text-foreground">
                          {s.hours} h
                        </span>
                        <button
                          type="button"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(s.id)}
                          className="rounded-btn border border-border px-2 py-1 text-xs font-semibold text-foreground disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        ))}

      <form
        className="mt-5 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (staffName.trim() === '')
            return setError('Name who is providing it.')
          const h = Number(hours)
          /* db/054 bounds this at 0 < hours <= 24 and would refuse it anyway.
             Said here so somebody who typed 80 finds out before a round trip. */
          if (!Number.isFinite(h) || h <= 0 || h > 24)
            return setError('Hours must be more than 0 and no more than 24.')
          setError(null)
          add.mutate()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label
              htmlFor="support-day"
              className="block text-sm font-medium text-foreground"
            >
              Day
            </label>
            <select
              id="support-day"
              value={weekday}
              onChange={(e) => setWeekday(e.target.value as IepWeekday)}
              className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            >
              {IEP_WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {IEP_WEEKDAY_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="support-name"
              className="block text-sm font-medium text-foreground"
            >
              Who
            </label>
            <input
              id="support-name"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="Marta Silva"
              className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            />
          </div>
          <div>
            <label
              htmlFor="support-role"
              className="block text-sm font-medium text-foreground"
            >
              Their role
            </label>
            <input
              id="support-role"
              value={staffRole}
              onChange={(e) => setStaffRole(e.target.value)}
              placeholder="Learning support assistant"
              className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="support-what"
              className="block text-sm font-medium text-foreground"
            >
              What they do
            </label>
            <input
              id="support-what"
              value={intervention}
              onChange={(e) => setIntervention(e.target.value)}
              placeholder="Small group social skills"
              className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            />
          </div>
          <div>
            <label
              htmlFor="support-hours"
              className="block text-sm font-medium text-foreground"
            >
              Hours
            </label>
            <input
              id="support-hours"
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Quarter hours are fine.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={add.isPending}
          className="mt-4 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {add.isPending ? 'Adding…' : 'Add to the schedule'}
        </button>
      </form>
    </section>
  )
}
