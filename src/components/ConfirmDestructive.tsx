import { useEffect, useId, useRef, useState } from 'react'

/**
 * Confirming something that cannot be taken back.
 *
 * REPLACES `window.confirm`, which this app used in three places. A browser
 * alert cannot say what will happen, cannot be told apart from the twenty
 * harmless ones a person has already dismissed today, and is accepted by the
 * same Enter key they were already pressing.
 *
 * Built on the native <dialog>, like BehaviourLogModal, which gives focus
 * trapping, Escape and an inert background for free.
 *
 * ---------------------------------------------------------------------------
 * THE TYPED PHRASE IS OPTIONAL, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 * Ask for it only where the blast radius is more than one record. Requiring it
 * to remove one person's access would teach everybody to type without reading,
 * and the next time it appeared — on something that mattered — it would mean
 * nothing.
 *
 * `confirmPhrase` should be the NAME OF THE THING: a school, a file. Never a
 * random string. Random text gets copied and pasted without being read, while
 * a name forces somebody to check WHICH row they are about to destroy, and
 * that is the mistake actually worth preventing. Nobody deletes a school
 * meaning to delete nothing; they delete the wrong one.
 *
 * Matching is case-insensitive and trimmed. Being strict about capitals would
 * add frustration and no safety — the reading is the safeguard, not the typing.
 *
 * ---------------------------------------------------------------------------
 * FOCUS NEVER STARTS ON THE DESTRUCTIVE BUTTON
 * ---------------------------------------------------------------------------
 * It starts on the phrase box, or on Cancel when there is none. Somebody
 * holding Enter from the screen before must not be able to destroy anything.
 */
export default function ConfirmDestructive({
  title,
  detail,
  consequences,
  confirmPhrase,
  confirmLabel,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  title: string
  detail: string
  /** Facts counted from the database, not adjectives. "4 students, 128 logs". */
  consequences?: string[]
  confirmPhrase?: string
  confirmLabel: string
  pending?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const phraseRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [typed, setTyped] = useState('')
  const titleId = useId()
  const phraseId = useId()

  useEffect(() => {
    dialogRef.current?.showModal()
    ;(phraseRef.current ?? cancelRef.current)?.focus()
  }, [])

  const unlocked =
    confirmPhrase === undefined ||
    typed.trim().toLowerCase() === confirmPhrase.trim().toLowerCase()

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      aria-labelledby={titleId}
      // m-auto centres it: a browser positions a modal <dialog> with
      // `margin: auto`, and Tailwind's reset zeroes margin on everything.
      className="m-auto w-full max-w-lg rounded-card border border-border bg-card p-0 shadow-lifted backdrop:bg-black/50"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-lg font-bold text-foreground">
          {title}
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {detail}
        </p>

        {consequences && consequences.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-card border border-danger bg-danger-subtle p-4 text-sm font-medium text-danger-foreground">
            {consequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        {confirmPhrase !== undefined && (
          <div className="mt-4">
            <label
              htmlFor={phraseId}
              className="block text-sm font-semibold text-foreground"
            >
              Type <span className="font-bold">{confirmPhrase}</span> to confirm
            </label>
            <input
              id={phraseId}
              ref={phraseRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
            />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={pending}
            className="rounded-btn border border-border px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!unlocked || pending}
            className="rounded-btn bg-danger-strong px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
