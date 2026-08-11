import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { reviewSystemEventsLike, type SystemEvent } from '../lib/api'
import { showToast } from '../lib/toast'

/**
 * Marking system events as looked at — db/041.
 *
 * WHY A NOTE IS COMPULSORY. Without one this is a dismiss button, and a dismiss
 * button on a red number gets pressed because the number is red. The note is
 * what turns "I made this go away" into "we ran the forgery drill on the 4th"
 * or "the webhook secret was wrong, fixed at 14:20" — and the second of those
 * is the most expensive silent failure this product has.
 *
 * REVIEWED IS NOT RESOLVED, and the wording says so. Nothing is edited or
 * deleted; the event stays, with the note and the name beside it.
 *
 * GROUPED BY KIND, because the drill writes three identical rows every run.
 * Asking for three notes teaches people to type "ok" three times, which is
 * worse than one honest note covering all of them.
 */
export default function ReviewEvents({
  events,
  onDone,
}: {
  events: SystemEvent[]
  onDone: () => void
}) {
  const [openKind, setOpenKind] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const review = useMutation({
    mutationFn: ({ source, event }: { source: string; event: string }) =>
      reviewSystemEventsLike(source, event, note),
    onSuccess: (count) => {
      setOpenKind(null)
      setNote('')
      showToast(
        `${count} event${count === 1 ? '' : 's'} marked as reviewed. They stay on the record.`,
      )
      onDone()
    },
    onError: (error) => showToast(error.message),
  })

  // One entry per source.event, with how many are waiting.
  //
  // Counted in a single pass. The first version built a "source.event" string,
  // split it back into its two halves, and re-scanned every event once per
  // distinct kind — taking apart something it had just assembled, quadratically.
  const kinds = new Map<string, { source: string; event: string; count: number }>()
  for (const e of events) {
    const key = `${e.source}.${e.event}`
    const seen = kinds.get(key)
    if (seen) seen.count++
    else kinds.set(key, { source: e.source, event: e.event, count: 1 })
  }

  return (
    <div className="mt-4 border-t border-current/20 pt-3">
      {[...kinds].map(([key, kind]) => (
        <div key={key} className="mt-2">
          {openKind === key ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                review.mutate({ source: kind.source, event: kind.event })
              }}
            >
              <label
                htmlFor={`note-${key}`}
                className="block text-sm font-semibold"
              >
                What was {key}?
              </label>
              <input
                id={`note-${key}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoFocus
                placeholder="npm run webhook-check — the forgery drill. Refusals are the endpoint working."
                className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={review.isPending || note.trim() === ''}
                  className="rounded-btn bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {review.isPending
                    ? 'Recording…'
                    : `Mark ${kind.count} as reviewed`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenKind(null)
                    setNote('')
                  }}
                  className="rounded-btn border border-border px-3 py-1.5 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpenKind(key)
                setNote('')
              }}
              className="text-sm font-semibold underline"
            >
              I have looked at {key}
              {kind.count > 1 && ` (${kind.count})`}
            </button>
          )}
        </div>
      ))}

      <p className="mt-3 text-xs opacity-80">
        Reviewing records that somebody looked and what they decided. It does
        not delete anything or mark it fixed.
      </p>
    </div>
  )
}
