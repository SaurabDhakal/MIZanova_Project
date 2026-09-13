import { useState } from 'react'
import DictatedTextarea from './DictatedTextarea'

/**
 * A wrapped row of toggle buttons for one closed vocabulary — db/122, db/125.
 *
 * Shared by the log modal, the correction dialog and the evidence editor,
 * because the same questions are asked in all three. A teacher mid-incident
 * usually cannot answer them; the same teacher at lunchtime can, and two copies
 * of this would drift the moment a vocabulary gained an option.
 *
 * ---------------------------------------------------------------------------
 * CHOOSING THE SAME ONE AGAIN CLEARS IT
 * ---------------------------------------------------------------------------
 * There is no "none of these" option and there should not be. A tap made by
 * accident, or a mind changed, has to be undoable without hunting for an escape
 * hatch — and the difference between "not answered" and "answered none" is one
 * the database already draws: null against a value.
 *
 * Radio inputs cannot deselect, which is why these are buttons carrying
 * aria-pressed rather than a radiogroup. Buttons over a <select> for the same
 * reason: a dropdown on a tablet covers the screen and costs three
 * interactions, where this costs one and stays readable at a glance while
 * somebody is still watching the room.
 *
 * ---------------------------------------------------------------------------
 * 'other' COSTS NOTHING UNTIL IT IS CHOSEN — db/125
 * ---------------------------------------------------------------------------
 * The input appears only once somebody taps "Something else…", so the row is
 * the same height it always was for everybody who did not need it. That
 * matters: docs/19 measured this modal at 1428px against a 529px window, and
 * three permanently-visible text boxes would have added roughly 300px to a
 * screen that was already the problem.
 *
 * Dictation comes from DictatedTextarea, which already exists — a teacher
 * holding a tablet one-handed is the case the market research calls the primary
 * market, and it was solved in this codebase before this row existed.
 */
export default function ChipRow<T extends string>(props: {
  /**
   * Unique on the page, and separate from `label` because several of these
   * rows have no visible label at all.
   *
   * Deriving the id from the label text produced `chips-` for every unlabelled
   * row — so the log modal's "Something else" input and the roster's carried
   * the SAME id whenever the modal was open over the roster, which is the
   * normal case. Duplicate ids break the label-to-input association that a
   * screen reader relies on, and `document.getElementById` starts answering
   * with whichever one happens to be first.
   */
  name: string
  label: string
  options: { value: T; label: string }[]
  className?: string
  /** Several may be true at once — setting events, and nothing else so far. */
  multi?: boolean
  selected: T | null | T[]
  onSelect: ((next: T | null) => void) | ((next: T[]) => void)
  /**
   * Put these first, and say why.
   *
   * docs/19 §3.4: confirming "usually a transition for this child" is faster
   * than scanning ten options, and the pattern layer already knows it.
   *
   * RANK, NEVER PRE-SELECT. A default that gets saved unchanged is not
   * evidence — it is the system agreeing with itself, and it would corrupt the
   * very counts the ranking was drawn from.
   */
  usual?: T | null
  usualHint?: string
  /**
   * Show only this many, with the rest behind a "More" toggle.
   *
   * The antecedent row is 13 options. On a 375px screen that wrapped to EIGHT
   * rows and 359px — 21% of the whole modal's scroll — for a question that is
   * optional and answered with one tap. A list that long also stops being a
   * glance and becomes reading, which is the opposite of what this row is for.
   *
   * Ranking does the real work: `usual` floats this child's most frequent
   * answer to the front, so the visible few are the likely few.
   */
  maxVisible?: number
  /** Free text for 'other'. Absent means the row has no escape hatch. */
  otherValue?: string
  onOtherChange?: (value: string) => void
  otherLabel?: string
}) {
  const { label, options, className = '', multi = false, usual = null } = props

  const chosen = Array.isArray(props.selected)
    ? props.selected
    : props.selected === null
      ? []
      : [props.selected]

  // Stable: the usual one moves to the front and everything else keeps the
  // order it was written in, so the row does not reshuffle under a finger.
  const ordered =
    usual && options.some((o) => o.value === usual)
      ? [
          ...options.filter((o) => o.value === usual),
          ...options.filter((o) => o.value !== usual),
        ]
      : options

  const toggle = (value: T) => {
    if (multi) {
      const next = chosen.includes(value)
        ? (chosen as T[]).filter((v) => v !== value)
        : [...(chosen as T[]), value]
      ;(props.onSelect as (n: T[]) => void)(next)
      return
    }
    ;(props.onSelect as (n: T | null) => void)(
      chosen[0] === value ? null : value,
    )
  }

  /*
   * A CHOSEN OPTION IS NEVER HIDDEN. Collapsing the list must not hide the
   * answer somebody already gave — they would see an unanswered row and no way
   * to find what they had picked.
   */
  const [showAll, setShowAll] = useState(false)
  const overflowing =
    props.maxVisible !== undefined && ordered.length > props.maxVisible
  const shown =
    !overflowing || showAll
      ? ordered
      : ordered.filter(
          (o, i) => i < props.maxVisible! || chosen.includes(o.value),
        )

  const otherChosen = chosen.includes('other' as T)
  const showOther = otherChosen && props.onOtherChange !== undefined

  /*
   * The group is labelled by an id derived from the label text. These rows sit
   * inside a fieldset that already has a <legend>, and a second legend would be
   * invalid — so the sub-heading is a <p> that aria-labelledby points at.
   */
  const groupId = `chips-${props.name}`

  return (
    <div className={className}>
      {/* Hidden rather than absent when there is no visible label: the group
          still needs something to be labelled BY, or a screen reader announces
          an unnamed group of eleven buttons. */}
      <p
        id={groupId}
        className={
          label
            ? 'text-xs font-semibold text-foreground'
            : 'sr-only'
        }
      >
        {label || props.otherLabel || 'Options'}
      </p>
      <div
        role="group"
        aria-labelledby={groupId}
        className="mt-1.5 flex flex-wrap gap-1.5"
      >
        {shown.map((option) => {
          const on = chosen.includes(option.value)
          const isUsual = option.value === usual
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(option.value)}
              className={`pressable rounded-btn border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isUsual
                    ? 'border-primary/50 bg-primary-subtle text-primary'
                    : 'border-border bg-card text-foreground hover:bg-background'
              }`}
            >
              {option.label}
              {/* Said, not just coloured — a border tint alone tells a
                  screen-reader user nothing, and tells a colour-blind user
                  very little. */}
              {isUsual && !on && props.usualHint && (
                <span className="ml-1 font-normal opacity-80">
                  · {props.usualHint}
                </span>
              )}
            </button>
          )
        })}

        {overflowing && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="pressable min-h-11 rounded-btn border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-background"
          >
            {showAll ? 'Fewer' : `More (${ordered.length - shown.length})`}
          </button>
        )}
      </div>

      {showOther && (
        <div className="mt-2">
          <DictatedTextarea
            id={`${groupId}-other`}
            label={props.otherLabel ?? 'What was it?'}
            multiline={false}
            value={props.otherValue ?? ''}
            onChange={props.onOtherChange!}
            placeholder="A few words is plenty"
          />
        </div>
      )}
    </div>
  )
}
