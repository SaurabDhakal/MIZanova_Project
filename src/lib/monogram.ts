/**
 * The colour a monogram gets, and the palette it comes from.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 * ---------------------------------------------------------------------------
 * It lived in Avatar.tsx and SchoolBadge needed exactly the same guarantee for a
 * different shape. Exporting it from a component file trips
 * `react-refresh/only-export-components` — a file that exports both a component
 * and a helper cannot be hot-reloaded — and the lint rule is right for a better
 * reason than hot reload: two things now depend on this, and it belongs where
 * neither owns it.
 *
 * Shared rather than copied. Every colour here was MEASURED against white text
 * and the lowest is 5.57:1, so the letters are legible as text rather than
 * merely visible as shape. A second copy would be measured once and then edited
 * by somebody who did not know that, and nothing would look wrong until an
 * audit found 3:1 on a screen.
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

/**
 * Stable across reloads and machines; `id` is a uuid, so any bucket is fine.
 *
 * KEYED ON THE ID RATHER THAN THE NAME, which is the point. Two people called
 * J Smith get different colours, somebody who marries keeps theirs, and a
 * school that corrects its own spelling on Settings → School does not silently
 * become a different colour on every screen that lists it.
 */
export function colourFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
