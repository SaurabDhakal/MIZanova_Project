import Icon from './Icon'
import {
  ANTECEDENTS,
  SETTING_EVENTS,
  WHAT_HELPED,
  labelFor,
  type Antecedent,
  type SettingEvent,
  type WhatHelped,
} from '../lib/behaviourContext'

/**
 * The shape this needs, named separately from any one query's row type.
 *
 * Both the staff timeline and the family's shared-log list render this, and
 * they come from different selects. Tying it to either one would mean the other
 * could not use it — which is how the family ended up seeing a bare
 * "Physical · high" while the same incident on a teacher's screen said what
 * happened and what helped.
 */
export type ContextRow = {
  antecedent: Antecedent | null
  what_helped: WhatHelped | null
  setting_events: SettingEvent[] | null
  antecedent_note: string | null
  what_helped_note: string | null
  setting_events_note: string | null
}

/**
 * What was going on around one incident — db/122, read back on the screen it
 * was recorded from.
 *
 * WRITTEN AS PROSE BECAUSE IT IS READ, NOT SCANNED. A colleague picking up a
 * class tomorrow wants "after changing activity — a quieter space helped", not
 * three labelled fields to decode. The vocabulary exists so the database can
 * count these; the sentence exists so a person can use them.
 *
 * Renders nothing at all when nothing was recorded. Every log written before
 * db/122 is in that state, and a row of empty labels would turn a year of
 * history into a page of blanks — which reads as data lost rather than data
 * never asked for.
 */
export default function ContextLine({
  row,
}: {
  row: Pick<
    ContextRow,
    | 'antecedent'
    | 'what_helped'
    | 'setting_events'
    | 'antecedent_note'
    | 'what_helped_note'
    | 'setting_events_note'
  >
}) {
  /*
   * db/126. 'other' RENDERS ITS WORDS, NOT ITS LABEL.
   *
   * The label for that code is "Something else…", so without this a teacher who
   * dictated "the fire alarm went off" reads back "after something else" — an
   * answer-shaped sentence carrying none of what they said.
   */
  const before =
    row.antecedent === 'other' && row.antecedent_note
      ? row.antecedent_note
      : labelFor(ANTECEDENTS, row.antecedent)
  const helped =
    row.what_helped === 'other' && row.what_helped_note
      ? row.what_helped_note
      : labelFor(WHAT_HELPED, row.what_helped)
  const events = (row.setting_events ?? [])
    .map((e) =>
      e === 'other' && row.setting_events_note
        ? row.setting_events_note
        : labelFor(SETTING_EVENTS, e),
    )
    .filter((e): e is string => Boolean(e))

  if (!before && !helped && events.length === 0) return null

  const parts: string[] = []
  if (before) parts.push(`After ${before.toLowerCase()}`)
  if (helped) parts.push(helped.toLowerCase())
  if (events.length > 0) parts.push(events.join(', ').toLowerCase())

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Icon name="bolt" className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{parts.join(' · ')}</span>
    </p>
  )
}
