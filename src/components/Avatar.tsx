/**
 * A person, shown as a coloured monogram.
 *
 * ---------------------------------------------------------------------------
 * THIS IS NOT A PROFILE PHOTO, AND THE DIFFERENCE MATTERS
 * ---------------------------------------------------------------------------
 * Saurab asked for profile pictures. There is no photo: `profiles` has no
 * avatar column anywhere in `db/`, no bucket holds one, and nothing has ever
 * asked anybody to upload one. So this draws initials, which is a fact the
 * system actually holds, rather than a face it does not.
 *
 * The alternative — a generic silhouette icon, or a face pulled from a service
 * like Gravatar — would put something on screen that looks like a person's
 * photograph and is not. This product has been bitten by exactly that before: a
 * placeholder expiry date rendered as "expires 5 September 2026" on a real
 * child's record and read as a real claim. A placeholder a screen will render
 * is not a placeholder, it is a claim.
 *
 * REAL PHOTOS ARE A DATABASE JOB, not a component one: a column on `profiles`, a
 * storage bucket with policies that let somebody write only their own file, an
 * upload control, and a decision about whether staff photographs of people
 * working with children should be visible across a whole school at all. That
 * last question is why this is not a quick win.
 *
 * ---------------------------------------------------------------------------
 * COLOUR IS DERIVED FROM THE ID, NOT THE NAME
 * ---------------------------------------------------------------------------
 * Two people called J Smith get different colours, and somebody who marries and
 * changes their surname keeps theirs. Every colour in the palette was measured
 * against white text: the lowest is 5.57:1, so the initials are legible as TEXT
 * rather than merely visible as shape.
 */

const PALETTE = [
  '#1b3a6b', // 11.27:1 with white
  '#2b6f8f', //  5.57:1
  '#3f7233', //  5.73:1
  '#5b4b8a', //  7.45:1
  '#8a4b2f', //  6.71:1
  '#7d2f4f', //  8.78:1
  '#2f6b5e', //  6.20:1
  '#4a5568', //  7.53:1
]

const SIZES = {
  sm: 'h-7 w-7 text-[0.65rem]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-base',
}

/** Stable across reloads and machines; `id` is a uuid, so any bucket is fine. */
function colourFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

/**
 * Up to two initials. `Array.from` rather than `[0]` because a name beginning
 * with an emoji or a character outside the basic plane would otherwise be cut
 * in half and render as a replacement box.
 */
function initialsFor(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    const first = Array.from(email.trim())[0]
    return first ? first.toUpperCase() : '?'
  }
  const first = Array.from(parts[0])[0] ?? ''
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export default function Avatar({
  id,
  name = '',
  email = '',
  size = 'md',
  className = '',
}: {
  /** Anything stable and unique — a profile id. Decides the colour. */
  id: string
  name?: string
  email?: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const label = name.trim() || email.trim()

  return (
    <span
      // Decorative BY DEFAULT. Every place this is used, the person's name is
      // written next to it, and a screen reader announcing "UC, UI Check" reads
      // the same person twice. Where it appears alone, the control that wraps
      // it carries the name instead.
      aria-hidden="true"
      title={label || undefined}
      style={{ backgroundColor: colourFor(id) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none ${SIZES[size]} ${className}`}
    >
      {initialsFor(name, email)}
    </span>
  )
}
