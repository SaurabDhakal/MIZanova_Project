import { useState } from 'react'

/**
 * Joe's mark, beside the name.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SUPPLIED FILE IS NOT USED WHOLE
 * ---------------------------------------------------------------------------
 * The artwork is a 4000×4000 square: the brain on top, then "MiZanova" and
 * "BALANCE. DISCOVER. THRIVE." beneath it. A page header is about 48px tall, and
 * a square scaled to fit that renders the wordmark at roughly twelve pixels and
 * the tagline at four. Shrinking a logo until its own words cannot be read is
 * not using it.
 *
 * So the mark is cropped out — measured, not eyeballed: the artwork has a clean
 * 128px band of white between the brain and the type, and the crop is taken
 * there — and the name is set in text beside it. That is an ordinary horizontal
 * lockup, and it is legible at the size a header actually is.
 *
 * ASK JOE FOR A HORIZONTAL VERSION and this component gets simpler. A square
 * logo is made for a business card, not a navigation bar.
 *
 * ---------------------------------------------------------------------------
 * THE SOURCE FILE IS 4.6 MB AND IS NOT SHIPPED
 * ---------------------------------------------------------------------------
 * It stays in `docs/` as the original. What ships is a 256px crop, because a
 * service worker caches whatever the app loads — a 4.6 MB logo would be
 * downloaded once per install and then carried in the offline bundle forever,
 * to be displayed at forty pixels.
 *
 * ---------------------------------------------------------------------------
 * THE COLOUR BREAK IS THE LOGO'S OWN
 * ---------------------------------------------------------------------------
 * In the artwork "MiZa" is navy and "nova" resolves to green, following the
 * gradient across the brain. The text here does the same with the brand tokens
 * taken from that gradient, so the two halves agree instead of merely sitting
 * near each other.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE ARE TWO MARK FILES
 * ---------------------------------------------------------------------------
 * The supplied artwork is drawn for white. Its white is not a background that
 * can simply be deleted: the circuit traces, the scales and the channel between
 * the hemispheres are all PAINTED white, so a global "remove white" punches
 * holes through the linework. The shipped file is instead flood-filled inward
 * from the four corners, which takes only the white connected to the outside
 * and leaves every interior stroke intact.
 *
 * Removing the plate then exposes a second problem, which is the one Saurab
 * predicted: the mark's dark hemisphere is hue 215, the sidebar is hue 214.
 * Measured on the transparent file, the darkest ink came out at 1.13:1 against
 * #0d1b2e and 13.7% of the mark fell under the 3:1 a graphic needs to be seen
 * at all. A seventh of the logo was invisible.
 *
 * So `logo-mark-reversed.png` lifts the shadows and leaves the highlights
 * alone (L' = 0.375 + 0.625L, applied in HLS so hue and saturation are
 * untouched). It is the same gradient read in a lighter register, not a
 * different logo, and it measures 3.61:1 on the sidebar. This is the ordinary
 * light-and-dark pair any brand ships; it is generated here only because Joe
 * supplied one file. An SVG from him would replace both.
 */
export default function Logo({
  /** `full` is mark + name. `mark` is the brain alone, where the name is set. */
  variant = 'full',
  /** On the dark sidebar the name has to be light, not navy. */
  tone = 'light-background',
  className = '',
}: {
  variant?: 'full' | 'mark'
  tone?: 'light-background' | 'dark-background'
  className?: string
}) {
  const [markFailed, setMarkFailed] = useState(false)

  const mark = markFailed ? null : (
    <img
      src={
        tone === 'dark-background'
          ? '/logo-mark-reversed.png'
          : '/logo-mark.png'
      }
      onError={() => setMarkFailed(true)}
      // Decorative: the name is written beside it in `full`, and the link that
      // wraps this carries its own label. An <img> announcing "MiZanova" next
      // to the word MiZanova is the same thing said twice.
      alt=""
      aria-hidden="true"
      className="h-9 w-9 shrink-0 object-contain"
      loading="eager"
      decoding="async"
    />
  )

  if (variant === 'mark') {
    return markFailed ? null : <span className={className}>{mark}</span>
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {mark}
      <span className="text-xl leading-none font-bold tracking-tight">
        <span
          className={
            tone === 'dark-background'
              ? 'text-sidebar-foreground'
              : 'text-brand-navy'
          }
        >
          MiZa
        </span>
        <span className="text-brand-green">nova</span>
      </span>
    </span>
  )
}
