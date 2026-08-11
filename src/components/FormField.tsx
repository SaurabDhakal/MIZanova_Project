import { useId } from 'react'

/**
 * A labelled input.
 *
 * Accessibility is the whole point of this component existing rather than
 * writing <input> directly on each page:
 *   - useId() generates a unique id so <label htmlFor> genuinely points at its
 *     input. Clicking the label focuses the field, and screen readers read the
 *     label when the field gets focus.
 *   - aria-invalid and aria-describedby connect an error message to the field
 *     it belongs to, so the error is announced instead of being a red string
 *     floating nearby.
 *   - The error text uses a darkened red token: the Figma red is 3.8:1 on
 *     white and fails WCAG AA for small text.
 */
export default function FormField({
  label,
  error,
  hint,
  ...inputProps
}: {
  label: string
  error?: string
  hint?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-foreground">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-0.5 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <input
        {...inputProps}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className={`mt-1.5 w-full rounded-btn border bg-card px-3 py-2.5 text-foreground placeholder:text-muted-foreground ${
          error ? 'border-danger' : 'border-border'
        }`}
      />
      {/* role="alert" as well as aria-describedby, because they answer
          different moments. describedby reads the error when the field is
          focused; alert announces it the instant it appears, which is what a
          failed submit needs — the error arrives while focus is still on the
          button that was pressed. */}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-sm font-medium text-danger-foreground"
        >
          {error}
        </p>
      )}
    </div>
  )
}
