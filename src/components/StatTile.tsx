import Icon, { type IconName } from './Icon'

/**
 * A number on a dashboard, and the one component allowed to draw one.
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS: THIRTY-FIVE OF THESE WERE WRITTEN BY HAND
 * ---------------------------------------------------------------------------
 * Four dashboards, four different treatments of the same element. The educator
 * one padded to two digits and carried a decoration; the specialist one did
 * neither; the school admin one showed an em-dash while loading; the parent one
 * showed a percentage. Nobody decided any of that — they were written weeks
 * apart, and the drift is invisible until somebody puts two screens side by
 * side.
 *
 * ---------------------------------------------------------------------------
 * `value` IS `number | undefined`, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 * The school admin dashboard renders `s?.flagged_total ?? 0`. That is 0 when
 * there are none — and also 0 when the query failed, which reads as "no
 * flagged incidents" on a safeguarding screen. It is the fault this project
 * has now caught twelve times, and no amount of care at each call site fixes a
 * shape that makes it easy.
 *
 * So this takes `undefined` for "not known" and renders an em-dash with a
 * title saying so. A caller cannot accidentally turn a failure into a zero,
 * because they cannot pass a number they do not have.
 *
 * ---------------------------------------------------------------------------
 * THE ICON REPLACED A BLANK SQUARE
 * ---------------------------------------------------------------------------
 * The educator dashboard drew `<span className="h-9 w-9 rounded-btn bg-…" />`
 * beside each figure: an empty coloured box, aria-hidden, meaning nothing. It
 * was an icon slot nobody had filled, and it had been on the busiest screen in
 * the product since it was written.
 */

const TONE = {
  default: { tile: 'bg-brand-navy/10 text-brand-navy', value: 'text-foreground' },
  danger: {
    tile: 'bg-danger-subtle text-danger-foreground',
    value: 'text-danger-foreground',
  },
  warning: {
    tile: 'bg-warning-subtle text-warning-foreground',
    value: 'text-foreground',
  },
  success: {
    tile: 'bg-success-subtle text-success-foreground',
    value: 'text-foreground',
  },
} as const

export default function StatTile({
  label,
  value,
  icon,
  hint,
  tone = 'default',
  suffix,
}: {
  label: string
  /**
   * `undefined` means NOT KNOWN — still loading, or the query failed. It
   * renders an em-dash, never a zero. See the note above.
   */
  value: number | undefined
  icon: IconName
  hint?: React.ReactNode
  /** `danger` only where a non-zero figure is genuinely bad news. */
  tone?: keyof typeof TONE
  /** '%' or similar. Kept out of `value` so the type stays a number. */
  suffix?: string
}) {
  const look = TONE[tone]
  const known = value !== undefined

  return (
    <div className="rounded-card border border-border bg-card shadow-raised p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <span className={`inline-flex shrink-0 rounded-btn p-2 ${look.tile}`}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
      </div>

      <p
        className={`mt-2 text-4xl font-bold ${known ? look.value : 'text-muted-foreground'}`}
        // Said out loud, because an em-dash on its own is read as a dash and
        // a sighted user has only the shape to go on.
        title={known ? undefined : 'Not known — this could not be loaded'}
      >
        {known ? value : '—'}
        {known && suffix ? (
          <span className="text-2xl">{suffix}</span>
        ) : null}
      </p>

      {hint && <p className="mt-1 text-sm">{hint}</p>}
      {!known && (
        <p className="mt-1 text-sm text-muted-foreground">
          This could not be loaded, which is not the same as zero.
        </p>
      )}
    </div>
  )
}
