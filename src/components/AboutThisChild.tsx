import DictatedTextarea from './DictatedTextarea'
import ChipRow from './ChipRow'
import {
  ANTECEDENTS,
  WHAT_HELPED,
  type Antecedent,
  type WhatHelped,
} from '../lib/behaviourContext'
import type { StudentProfile } from '../lib/api'

/**
 * What a school knows about a child before anything goes wrong — db/127.
 *
 * ---------------------------------------------------------------------------
 * FOUR FIELDS, AND WHY IT IS NOT FORTY
 * ---------------------------------------------------------------------------
 * docs/17 §3 designs a much larger profile and docs/19 §5 explains why almost
 * none of it belongs on an intake form: a school administrator typing six
 * hundred children off a spreadsheet does not know which one loves horses.
 * Asking them guarantees empty fields, and empty fields that LOOK filled in are
 * worse than no fields, because the completeness indicator then lies.
 *
 * These four are the ones that change the advice most for the least typing, and
 * they are the ones an educator has by the second week.
 *
 * ---------------------------------------------------------------------------
 * INTERESTS FIRST, NOT LAST
 * ---------------------------------------------------------------------------
 * A special interest is the strongest engagement lever there is, and it is the
 * field most likely to be skipped if it sits under two boxes about difficulty.
 * Putting it first also sets what this screen is: a description of a child, not
 * a list of problems. A record with nothing good in it is not a description of
 * anybody.
 *
 * ---------------------------------------------------------------------------
 * THE CHIPS ARE db/122'S VOCABULARIES, DELIBERATELY
 * ---------------------------------------------------------------------------
 * "What helps" and "what sets it off" use the exact values a teacher taps when
 * they log an incident. That is what lets the Patterns panel compare a school's
 * BELIEF against its recorded EVIDENCE — "you flagged transitions; the logs say
 * demands, 6 of 9" — which is often the most useful sentence at a review.
 *
 * 'other' and 'unknown' are absent here on purpose: a standing profile has no
 * incident to be uncertain about, and prose belongs in the boxes above.
 */
export default function AboutThisChild({
  value,
  onChange,
  idPrefix,
  firstName,
}: {
  value: StudentProfile
  onChange: (next: StudentProfile) => void
  /** Unique per mount — this appears on the intake form and the record. */
  idPrefix: string
  /** Used in the labels, because a name reads like a person and a noun does not. */
  firstName?: string
}) {
  /*
   * THE FALLBACK HAS TO SURVIVE EVERY SENTENCE IT IS DROPPED INTO.
   *
   * It was 'them', which is only grammatical in one of the four labels below:
   *
   *     What them loves          What usually helps them
   *     What them is good at
   *     What them finds hard
   *
   * Three of them are broken English, and they are what somebody sees before
   * they have typed a name — which on the intake form is most of the time they
   * spend looking at it. 'this child' is correct in all four, and in the two
   * headings on the forms that mount this.
   *
   * A name is still much better, which is why it wins whenever there is one.
   */
  const who = firstName?.trim() || 'this child'
  const set = (patch: Partial<StudentProfile>) =>
    onChange({ ...value, ...patch })

  return (
    <div className="space-y-4">
      <DictatedTextarea
        id={`${idPrefix}-interests`}
        label={`What ${who} loves`}
        rows={2}
        value={value.interests ?? ''}
        onChange={(v) => set({ interests: v })}
        placeholder="Trains, and anything with a timetable."
        hint="The single most useful thing you can write here. A suggestion built around something they love is one they will actually take up."
      />

      <DictatedTextarea
        id={`${idPrefix}-strengths`}
        label={`What ${who} is good at`}
        rows={2}
        value={value.strengths ?? ''}
        onChange={(v) => set({ strengths: v })}
        placeholder="Remembers everything. Kind to the younger children."
      />

      <DictatedTextarea
        id={`${idPrefix}-finds-hard`}
        /* NOT "weaknesses". Same data; but a family opens this record, and one
           of those words is a verdict on their child while the other is what a
           teacher would say out loud in the meeting. */
        label={`What ${who} finds hard`}
        rows={2}
        value={value.finds_hard ?? ''}
        onChange={(v) => set({ finds_hard: v })}
        placeholder="Noisy rooms. Being rushed."
      />

      <ChipRow
        name={`${idPrefix}-helps`}
        label={`What usually helps ${who}`}
        options={WHAT_HELPED.filter(
          (o) =>
            !['other', 'nothing_tried', 'still_escalated'].includes(o.value),
        )}
        selected={value.helps}
        onSelect={(next: WhatHelped[]) => set({ helps: next })}
        multi
      />

      <ChipRow
        name={`${idPrefix}-triggers`}
        label="What usually sets it off"
        options={ANTECEDENTS.filter(
          (o) => !['other', 'unknown'].includes(o.value),
        )}
        selected={value.triggers}
        onSelect={(next: Antecedent[]) => set({ triggers: next })}
        multi
      />

      <p className="text-xs text-muted-foreground">
        All optional, and it can be added any time. These are the same words the
        logging screen uses, so what you record here can be compared with what
        actually gets logged.
      </p>
    </div>
  )
}
