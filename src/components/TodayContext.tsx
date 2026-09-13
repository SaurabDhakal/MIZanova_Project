import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTodayContext, queryKeys, setTodayContext } from '../lib/api'
import { SETTING_EVENTS, type SettingEvent } from '../lib/behaviourContext'
import ChipRow from './ChipRow'
import Icon from './Icon'
import { showToast } from '../lib/toast'

/**
 * Anything different about today — db/125, docs/19 §3.3.
 *
 * ---------------------------------------------------------------------------
 * A SETTING EVENT IS A FACT ABOUT A DAY, NOT ABOUT A CHILD
 * ---------------------------------------------------------------------------
 * db/122 put these on the behaviour log, which meant a relief teacher covering
 * a room of thirty would tap "Relief staff today" thirty times, and a wet
 * lunchtime was the same fact repeated for every child in the building.
 *
 * That is not a data-entry annoyance, it is a category error — and its
 * consequence is that the field stays empty. Which matters more than it
 * sounds: a setting event is the most common reason a strategy that worked on
 * Tuesday fails on Wednesday, and an empty field makes a tired fortnight look
 * like a child getting worse.
 *
 * Said once here, copied onto every log written afterwards today.
 *
 * ---------------------------------------------------------------------------
 * COLLAPSED UNTIL IT IS TRUE, WHICH IS MOST DAYS
 * ---------------------------------------------------------------------------
 * Most days nothing is different, and a permanently open panel of eight
 * options on the roster would be eight options nobody reads by Wednesday. Shut,
 * it is one line. Open, it is one row of chips.
 *
 * When something IS set, the collapsed line says so — because a teacher who
 * flagged "relief staff" on Monday and forgot needs to see it on Tuesday, and
 * a fact silently attaching itself to every log is exactly the sort of thing
 * that should be visible.
 */
export default function TodayContext() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const today = useQuery({
    queryKey: queryKeys.todayContext,
    queryFn: fetchTodayContext,
  })

  /*
   * NULL UNTIL SOMEBODY TOUCHES IT, and the server's answer shows through
   * until then.
   *
   * The obvious shape — useState seeded from an effect when the query resolves
   * — is an anti-pattern the linter rejects, and rightly: it renders once with
   * the wrong value, and it silently discards a choice made while the request
   * was still in flight. A draft that starts as null has neither problem and
   * needs no effect at all.
   */
  const [draft, setDraft] = useState<{
    events: SettingEvent[]
    note: string
  } | null>(null)

  const events = draft?.events ?? today.data?.setting_events ?? []
  const note = draft?.note ?? today.data?.note ?? ''
  const setEvents = (next: SettingEvent[]) => setDraft({ events: next, note })
  const setNote = (next: string) => setDraft({ events, note: next })

  const save = useMutation({
    mutationFn: () => setTodayContext({ settingEvents: events, note }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.todayContext })
      showToast(
        events.length === 0
          ? 'Cleared. Nothing will be attached to today’s logs.'
          : 'Saved. It will be attached to the logs you write today.',
      )
      // Dropped so the freshly-refetched server value is what shows.
      setDraft(null)
      setOpen(false)
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  const current = (today.data?.setting_events ?? [])
    .map((e) => SETTING_EVENTS.find((s) => s.value === e)?.label)
    .filter((e): e is string => Boolean(e))

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable flex w-full items-center gap-2 rounded-card border border-border bg-card px-4 py-2.5 text-left text-sm hover:bg-background"
      >
        <Icon name="bolt" className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        {current.length > 0 ? (
          <span className="text-foreground">
            Today:{' '}
            <span className="font-semibold">
              {current.join(', ').toLowerCase()}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            Anything different today? Say it once and it is attached to every
            log you write.
          </span>
        )}
        <span className="ml-auto text-xs font-semibold text-primary">
          {current.length > 0 ? 'Change' : 'Set'}
        </span>
      </button>
    )
  }

  return (
    <section className="rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Anything different today?
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:underline"
        >
          Close
        </button>
      </div>
      <p className="mt-1 max-w-prose text-xs text-muted-foreground">
        Attached to every log you write today, so you do not have to say it for
        each child. It does not change anything already saved, and a single log
        can still disagree with it.
      </p>

      <div className="mt-3">
        <ChipRow
          name="today-events"
          label=""
          options={SETTING_EVENTS}
          selected={events}
          onSelect={setEvents}
          multi
          otherValue={note}
          onOtherChange={setNote}
          otherLabel="What was it?"
        />
      </div>

      <button
        type="button"
        disabled={save.isPending}
        onClick={() => save.mutate()}
        className="pressable min-h-11 mt-3 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {save.isPending ? 'Saving…' : 'Save for today'}
      </button>
    </section>
  )
}
