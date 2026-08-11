import { PATHS, type IconName } from '../lib/icons'

export type { IconName }

/**
 * One icon. See `lib/icons.ts` for the set and why it is drawn inline.
 *
 * DECORATIVE BY DEFAULT. Almost every icon sits beside a word that already
 * says the same thing — a sidebar link reading "Students" does not become
 * clearer when a screen reader announces "picture of two people, Students".
 * So `aria-hidden` is the default.
 *
 * `label` opts out, for the rare icon carrying meaning no text repeats. If
 * you find yourself passing a label that matches adjacent text, do not.
 */
export default function Icon({
  name,
  label,
  className = 'h-5 w-5',
}: {
  name: IconName
  /**
   * Only when the icon says something no nearby text says. Leaving it off is
   * the normal case and makes the icon invisible to a screen reader.
   */
  label?: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // A decorative icon that announces itself is noise; one that carries
      // meaning and does not is a gap. Which it is comes from the caller.
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      // Icons must not scale with the text of a badge they sit inside.
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
