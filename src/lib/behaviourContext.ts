/**
 * The A and the C of ABC — db/122.
 *
 * `behaviour_logs` recorded the behaviour in four ways and recorded nothing
 * about what came immediately before it, or what the adult did that ended it.
 * Those two are where the precision lives: "threw a chair" supports almost no
 * specific advice, and "threw a chair after being asked to stop an activity he
 * was absorbed in, and settled when a familiar adult moved him somewhere
 * quieter" supports a great deal.
 *
 * ---------------------------------------------------------------------------
 * WHY BUTTONS AND NOT A TEXT BOX
 * ---------------------------------------------------------------------------
 * The market research sells this product on three-second logging and finds
 * that teachers reject anything that adds admin — and its primary market, early
 * childhood, has staff supervising children one-handed. Prose is slow to write
 * under pressure and impossible to count afterwards.
 *
 * A closed list is also the privacy answer. 'transition' cannot contain a
 * child's name, so these travel to the model as they are, while free-text notes
 * have to be redacted and then checked. server/anonymise.js holds the same
 * lists and refuses to send a value that is not on them.
 *
 * ---------------------------------------------------------------------------
 * 'other' IS AN ESCAPE HATCH THAT MEASURES ITSELF — db/125
 * ---------------------------------------------------------------------------
 * The list cannot hold everything: "the fire alarm went off" is not one of the
 * ten and never will be. Without a way out, a teacher either picks something
 * untrue or answers nothing, and both are worse than an honest 'other'.
 *
 * Choosing it reveals one short dictated input, and the text goes to a
 * `*_note` column — free text, redacted before the model exactly like the
 * observation notes, because it is the only part of these fields that can
 * carry a name.
 *
 * It is also a MEASUREMENT. A term in which a fifth of incidents did not fit
 * is a term in which this vocabulary needs revising, and `did_not_fit` in the
 * pattern function is the only thing that would ever say so. 'other' is
 * deliberately excluded from the rankings — "most often happens after: other"
 * is not advice.
 *
 * KEEP THIS FILE AND db/122 IN STEP. The database check constraint is the real
 * gate; these are the labels a person reads. Adding a value here alone produces
 * a save that fails at the database, which is the safe direction but still a
 * bug worth avoiding.
 *
 * Data only, in its own file, because the log modal, the edit dialog and the
 * timeline all need it — and a module that exports both a component and a
 * constant breaks React Fast Refresh.
 */

export type Antecedent =
  | 'demand'
  | 'transition'
  | 'denied'
  | 'peer'
  | 'correction'
  | 'too_hard'
  | 'attention_elsewhere'
  | 'waiting'
  | 'sensory'
  | 'change'
  | 'discomfort'
  | 'other'
  | 'unknown'

export type WhatHelped =
  | 'quiet_space'
  | 'familiar_adult'
  | 'movement'
  | 'choice_offered'
  | 'demand_reduced'
  | 'helped_with_task'
  | 'attention_given'
  | 'waited_quietly'
  | 'sensory_item'
  | 'redirected'
  | 'other'
  | 'nothing_tried'
  | 'still_escalated'

export type SettingEvent =
  | 'poor_sleep'
  | 'unwell'
  | 'medication_change'
  | 'substitute_adult'
  | 'routine_disrupted'
  | 'family_event'
  | 'first_day_back'
  | 'indoor_play'
  | 'other'

/**
 * What was happening immediately before.
 *
 * ORDERED BY HOW OFTEN IT ACTUALLY HAPPENS, not alphabetically and not by when
 * somebody thought of it. A teacher taps one of these while still watching the
 * room, so the common answers belong where the thumb already is. (The child's
 * own most frequent antecedent is floated to the very front separately, by the
 * pattern layer — see ChipRow's `usual`.)
 *
 * db/130 added the two that were missing against the standard model of why
 * behaviour happens: nothing here named ATTENTION, which is a quarter of it,
 * and 'demand' was doing the work of both "I asked them to line up" and "I set
 * them work they could not do" — two events with opposite remedies.
 *
 * 'unknown' is last and is a real answer: a teacher who arrived after it
 * started should be able to say so. It is different from leaving this blank,
 * which means nobody was asked — and the pattern function excludes 'unknown'
 * from its counts for exactly that reason.
 */
export const ANTECEDENTS: { value: Antecedent; label: string }[] = [
  { value: 'demand', label: 'Asked to do something' },
  { value: 'transition', label: 'Changing activity' },
  { value: 'denied', label: 'Told no' },
  { value: 'peer', label: 'Another child' },
  { value: 'correction', label: 'Being corrected' },
  // db/130. Both were unnameable before, so they were being logged as
  // 'other', 'unknown', or not at all.
  { value: 'too_hard', label: 'Work was too hard' },
  { value: 'attention_elsewhere', label: 'My attention was elsewhere' },
  { value: 'waiting', label: 'Waiting, nothing to do' },
  { value: 'sensory', label: 'Noise, crowd or light' },
  { value: 'change', label: 'Something changed unexpectedly' },
  { value: 'discomfort', label: 'Tired, hungry or unwell' },
  { value: 'other', label: 'Something else…' },
  { value: 'unknown', label: 'Did not see' },
]

/**
 * What the adult did, and whether it worked.
 *
 * The last two are failures on purpose. A list where every option is a success
 * teaches the database that everything works, and the most useful thing a
 * teacher can record is the afternoon when nothing did.
 */
export const WHAT_HELPED: { value: WhatHelped; label: string }[] = [
  { value: 'quiet_space', label: 'Quieter space' },
  { value: 'familiar_adult', label: 'A familiar adult' },
  { value: 'movement', label: 'Movement or a job' },
  { value: 'choice_offered', label: 'Offered a choice' },
  { value: 'demand_reduced', label: 'Asked for less' },
  // db/130. 'Asked for less' is not the same act as sitting down and doing it
  // with them, and the pair answers 'Work was too hard'.
  { value: 'helped_with_task', label: 'Sat and helped them' },
  // Answers 'My attention was elsewhere'.
  { value: 'attention_given', label: 'A minute of my full attention' },
  { value: 'waited_quietly', label: 'Waited nearby, said nothing' },
  { value: 'sensory_item', label: 'Headphones or a fidget' },
  { value: 'redirected', label: 'Moved onto something else' },
  { value: 'other', label: 'Something else…' },
  { value: 'nothing_tried', label: 'Settled on its own' },
  { value: 'still_escalated', label: 'Nothing worked' },
]

/**
 * The backdrop, not the trigger.
 *
 * These do not cause an incident; they lower the threshold for one. Recording
 * them is what stops a tired fortnight reading like a child getting worse.
 */
export const SETTING_EVENTS: { value: SettingEvent; label: string }[] = [
  { value: 'poor_sleep', label: 'Slept badly' },
  { value: 'unwell', label: 'Unwell' },
  { value: 'medication_change', label: 'Medication changed' },
  { value: 'substitute_adult', label: 'Relief staff today' },
  { value: 'routine_disrupted', label: 'Routine disrupted' },
  { value: 'family_event', label: 'Something at home' },
  { value: 'first_day_back', label: 'First day back' },
  { value: 'indoor_play', label: 'Stuck inside' },
  { value: 'other', label: 'Something else…' },
]

/** The label for one stored value, for read-only screens. */
export function labelFor(
  list: { value: string; label: string }[],
  value: string | null | undefined,
): string | null {
  if (!value) return null
  return list.find((o) => o.value === value)?.label ?? value
}
