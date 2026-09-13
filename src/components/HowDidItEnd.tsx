import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys, updateBehaviourLog } from '../lib/api'
import {
  WHAT_HELPED,
  type WhatHelped,
} from '../lib/behaviourContext'
import SuggestedText from './SuggestedText'
import { showToast } from '../lib/toast'

/**
 * The question that could not be asked while it was happening — docs/19 §3.2.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT IN THE LOG MODAL
 * ---------------------------------------------------------------------------
 * `what_helped` was one of three chips db/122 put at the bottom of the logging
 * screen, and it was the wrong question in the wrong place for a reason no
 * amount of layout would fix: at the moment a teacher is logging, the incident
 * has not ended. There is no answer yet.
 *
 * Asked here — on the row, after the save, when the room is calm — it is a
 * question somebody can actually answer, and it is its own moment rather than
 * the seventh item on a form.
 *
 * ---------------------------------------------------------------------------
 * IT IS ALSO THE ONLY OUTCOME DATA THIS PRODUCT GETS FOR FREE
 * ---------------------------------------------------------------------------
 * Everything else about whether something worked has to be asked for later,
 * and later means never. This is captured seconds afterwards by the one person
 * who watched it, and it is what lets the strategy prompt say "movement has
 * helped this child six times" instead of guessing from general practice.
 *
 * DISMISSIBLE, AND HONESTLY SO. A prompt that cannot be refused is a demand,
 * and this is optional.
 *
 * "Not now" hides it until the page is next loaded — it is component state, not
 * a stored decision, so it WILL come back tomorrow on a log that still has no
 * outcome. That is deliberate rather than a gap: the row disappears the moment
 * the question is answered, and a teacher who never wants to answer it can keep
 * saying no at no cost. Storing a permanent refusal per log would be a table
 * whose only purpose is to remember that somebody was not interested.
 */
export default function HowDidItEnd({
  logId,
  studentId,
  behaviourType,
  intensity,
  notes,
}: {
  logId: string
  studentId: string
  /* Sent back unchanged because updateBehaviourLog rewrites these three
     unconditionally. The ABC fields are NOT passed at all — omitting a key
     leaves that column alone, which is what stops this component wiping the
     antecedent and the day's setting events off a log it was only meant to
     add an outcome to. */
  behaviourType: Parameters<typeof updateBehaviourLog>[1]['behaviourType']
  intensity: Parameters<typeof updateBehaviourLog>[1]['intensity']
  notes: string | null
}) {
  const queryClient = useQueryClient()
  const [dismissed, setDismissed] = useState(false)
  const [choice, setChoice] = useState<WhatHelped | null>(null)
  const [note, setNote] = useState('')

  const save = useMutation({
    mutationFn: (value: WhatHelped) =>
      updateBehaviourLog(logId, {
        behaviourType,
        intensity,
        notes: notes ?? '',
        whatHelped: value,
        whatHelpedNote: note,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['timeline', studentId] })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.studentPatterns(studentId),
      })
      showToast('Thanks — that is what makes the next suggestion specific.')
      setDismissed(true)
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  if (dismissed) return null

  /*
   * 'other' NEEDS ITS TEXT BEFORE IT CAN SAVE, so that one waits for a button.
   * Every other answer saves on the tap itself — a confirm step on a one-tap
   * question is the sort of thing that makes people stop answering.
   */
  const needsText = choice === 'other'

  /*
   * A TAPPED SUGGESTION SAVES ITSELF; TYPED WORDS WAIT FOR THE BUTTON.
   *
   * Saving on every keystroke would be absurd, and a confirm step on a
   * one-tap question is the sort of friction that makes people stop answering.
   * The two cases are distinguishable because a tap arrives with text equal to
   * the option's own label.
   */
  const pick = (next: { code: WhatHelped | null; text: string }) => {
    setChoice(next.code)
    setNote(next.text)
    const tapped =
      next.code !== null &&
      next.code !== 'other' &&
      WHAT_HELPED.some((o) => o.value === next.code && o.label === next.text)
    if (tapped) save.mutate(next.code!)
  }

  return (
    <div className="mt-2 rounded-card border border-border bg-background p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">How did it end?</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-muted-foreground hover:underline"
        >
          Not now
        </button>
      </div>

      <div className="mt-2">
        <SuggestedText
          name={`ended-${logId}`}
          label="What did you do?"
          placeholder="Say or type it — or tap one below"
          options={WHAT_HELPED}
          code={choice}
          text={note}
          onChange={pick}
        />
      </div>

      {needsText && (
        <button
          type="button"
          disabled={note.trim() === '' || save.isPending}
          onClick={() => save.mutate('other')}
          className="pressable min-h-11 mt-2 rounded-btn bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  )
}
