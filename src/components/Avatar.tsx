import { colourFor } from '../lib/monogram'
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

const SIZES = {
  sm: 'h-7 w-7 text-[0.65rem]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-base',
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
  photoUrl = null,
}: {
  /** Anything stable and unique — a profile id. Decides the colour. */
  id: string
  name?: string
  email?: string
  size?: keyof typeof SIZES
  className?: string
  /**
   * A SIGNED url, from `avatarUrl()`. Null means no photo, which is the normal
   * case and draws the monogram below.
   *
   * A URL RATHER THAN A PATH, and that is not laziness. The bucket is private,
   * so a path has to be exchanged for a signed URL over the network — and a
   * component that does that per instance would fire one request per face on a
   * roster of thirty. The caller signs what it needs, once, and passes it in.
   */
  photoUrl?: string | null
}) {
  const label = name.trim() || email.trim()

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        aria-hidden="true"
        title={label || undefined}
        /*
         * object-cover, because a portrait cropped to a circle by the browser's
         * default would squash rather than crop, and a squashed face is worse
         * than initials.
         *
         * No onError fallback to the monogram, deliberately: a signed URL that
         * has expired should look broken for the moment it takes the page to
         * refetch, rather than silently pretend the person never uploaded one.
         */
        className={`inline-flex shrink-0 rounded-full object-cover ${SIZES[size]} ${className}`}
      />
    )
  }

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
