import DictatedTextarea from './DictatedTextarea'

/**
 * A field you can dictate into, with the common answers underneath as one-tap
 * suggestions — db/125, docs/19.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FIELD IS ON TOP AND THE CHIPS ARE UNDERNEATH
 * ---------------------------------------------------------------------------
 * The first version was chips only, with "Something else…" as the tenth chip
 * revealing an input. That got the priority backwards for the person this
 * product is sold to.
 *
 * Dictation is the feature. An early-childhood educator holding a tablet
 * one-handed while supervising a room cannot hunt for the tenth chip to reach a
 * microphone — and early childhood is the primary market in the client's own
 * research. Putting the field first makes speaking the fastest route, and
 * leaves tapping exactly as fast as it was.
 *
 * ---------------------------------------------------------------------------
 * TAPPING A SUGGESTION FILLS THE FIELD, WHICH IS WHAT KEEPS THE DATA COUNTABLE
 * ---------------------------------------------------------------------------
 * The obvious risk of a text box is that everybody types, nothing is coded, and
 * the pattern layer starves — the whole reason db/122 chose a vocabulary.
 *
 * So a suggestion is not a separate control. Tapping one writes its words into
 * the field AND sets the code, so the fast path produces a coded answer without
 * anybody thinking about it. Typing something the list does not contain is
 * recorded as 'other' with the words kept, which is the honest reading and is
 * itself counted (`did_not_fit`) so we learn when the list is failing people.
 *
 * The field always shows the answer in words. There is no state a person can
 * see only as a highlighted button.
 */
export default function SuggestedText<T extends string>(props: {
  /** Unique on the page. Several of these rows have no visible label. */
  name: string
  label: string
  placeholder?: string
  options: { value: T; label: string }[]
  code: T | null
  text: string
  onChange: (next: { code: T | null; text: string }) => void
  className?: string
  /**
   * Shown first and marked, because the pattern layer already knows what is
   * usually true for this child. RANKED, NEVER PRE-FILLED — a default saved
   * unchanged is not evidence, it is the system agreeing with itself.
   */
  usual?: T | null
  usualHint?: string
}) {
  const {
    name,
    label,
    options,
    code,
    text,
    usual = null,
    className = '',
  } = props

  const ordered =
    usual && options.some((o) => o.value === usual)
      ? [
          ...options.filter((o) => o.value === usual),
          ...options.filter((o) => o.value !== usual),
        ]
      : options

  /*
   * WHAT THE TYPED WORDS MEAN.
   *
   * Text identical to a suggestion is that suggestion — so tapping one and then
   * dictating an extra clause degrades to 'other' the moment it stops matching,
   * which is the truthful answer rather than a code that no longer describes
   * what it says. Empty means unanswered, which is different from 'other' and
   * different from 'unknown'.
   */
  const codeFor = (value: string): T | null => {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const match = options.find(
      (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
    )
    return match ? match.value : ('other' as T)
  }

  const type = (value: string) =>
    props.onChange({ code: codeFor(value), text: value })

  const tap = (option: { value: T; label: string }) => {
    // Tapping the one already chosen clears it — the same undo the chips had,
    // and the only way back to "unanswered" without deleting text by hand.
    if (code === option.value) {
      props.onChange({ code: null, text: '' })
      return
    }
    props.onChange({ code: option.value, text: option.label })
  }

  const suggestionsId = `${name}-suggestions`

  return (
    <div className={className}>
      <DictatedTextarea
        id={name}
        label={label}
        multiline={false}
        value={text}
        onChange={type}
        placeholder={props.placeholder}
      />

      <p id={suggestionsId} className="mt-2 text-xs text-muted-foreground">
        or tap one
      </p>
      <div
        role="group"
        aria-labelledby={suggestionsId}
        className="mt-1.5 flex flex-wrap gap-1.5"
      >
        {ordered.map((option) => {
          const on = code === option.value
          const isUsual = option.value === usual
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => tap(option)}
              className={`pressable rounded-btn border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isUsual
                    ? 'border-primary/50 bg-primary-subtle text-primary'
                    : 'border-border bg-card text-foreground hover:bg-background'
              }`}
            >
              {option.label}
              {/* Said, not only coloured — a tint tells a screen-reader user
                  nothing and a colour-blind user very little. */}
              {isUsual && !on && props.usualHint && (
                <span className="ml-1 font-normal opacity-80">
                  · {props.usualHint}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
