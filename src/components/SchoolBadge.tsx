import { colourFor } from '../lib/monogram'

/**
 * A school's mark — its initials on a colour of its own.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT JUST USE Avatar
 * ---------------------------------------------------------------------------
 * The hashing and the palette ARE Avatar's, imported rather than copied. Two
 * things differ, and both are about a school not being a person.
 *
 * IT IS A ROUNDED SQUARE, NOT A CIRCLE. Circles read as faces everywhere else
 * in this product — the account menu, the roster, the caseload — and a school
 * sitting in a row of them would be read as somebody. The shape is the only
 * thing carrying that distinction at 28 pixels.
 *
 * THE INITIALS COME OUT DIFFERENTLY. Avatar takes the first and last word,
 * which is right for "Prabin Bhandari" and wrong for "Parramatta West Primary
 * School" — that gives PS, and so does "Penrith South Primary School". Schools
 * share their last words; what distinguishes them is at the front.
 *
 * ---------------------------------------------------------------------------
 * THIS IS NOT A LOGO, AND IS NOT PRETENDING TO BE
 * ---------------------------------------------------------------------------
 * No school has uploaded anything. `organisations` has no logo column, no
 * bucket holds one, and nobody has been asked. This draws a fact the system
 * holds — the name — rather than a crest it does not have.
 *
 * Avatar makes the same argument about faces, and it is the one this product
 * has been bitten by: a placeholder a screen will render is not a placeholder,
 * it is a claim. A generic building icon on every row would say "no logo yet"
 * in a way that looks like the school chose it.
 *
 * Real crests are a database job — a column, a bucket, a policy letting a
 * school admin write only their own school's file, and an upload control on
 * Settings → School. The avatar bucket already proves that shape works. When it
 * arrives this component grows a `logoUrl` prop exactly as Avatar has
 * `photoUrl`, and every caller below is already passing a school.
 */

/*
 * Words that identify a school TYPE rather than the school. Dropped when
 * picking initials so the letters come from the part of the name that is
 * actually distinguishing.
 *
 * Order matters to nothing here — it is a membership test. "The" is in the list
 * because it leads a handful of real names and carries nothing.
 */
const GENERIC = new Set([
  'the',
  'school',
  'schools',
  'primary',
  'public',
  'college',
  'academy',
  'centre',
  'center',
  'early',
  'learning',
  'childhood',
  'education',
  'services',
  'group',
  'and',
  'of',
  'for',
  'pty',
  'ltd',
])

const SIZES = {
  sm: 'h-7 w-7 rounded-md text-[0.65rem]',
  md: 'h-9 w-9 rounded-lg text-xs',
  lg: 'h-12 w-12 rounded-xl text-base',
}

/**
 * Up to two letters, taken from the first words that mean something.
 *
 * `Array.from` rather than `[0]`, the same reason Avatar gives: a name starting
 * outside the basic plane would otherwise be cut in half and render as a
 * replacement box.
 */
function schoolInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const meaningful = words.filter((w) => !GENERIC.has(w.toLowerCase()))

  // A school genuinely called "The Academy" has nothing left after filtering,
  // and two letters of something beat none of the right thing.
  const source = meaningful.length > 0 ? meaningful : words
  if (source.length === 0) return '?'

  const first = Array.from(source[0])[0] ?? ''
  const second = source.length > 1 ? (Array.from(source[1])[0] ?? '') : ''
  return (first + second).toUpperCase()
}

export default function SchoolBadge({
  id,
  name,
  size = 'md',
  className = '',
}: {
  /** The school id. Decides the colour, so it survives a rename. */
  id: string
  name: string
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      /*
       * aria-hidden, and that is deliberate rather than lazy. Every place this
       * is used sits beside the school's name in text. Announcing "P W" before
       * "Parramatta West Primary School" gives a screen reader user the same
       * thing twice, the first time as noise.
       */
      aria-hidden="true"
      title={name}
      style={{ backgroundColor: colourFor(id) }}
      className={`inline-flex shrink-0 items-center justify-center font-semibold text-white ${SIZES[size]} ${className}`}
    >
      {schoolInitials(name)}
    </span>
  )
}
