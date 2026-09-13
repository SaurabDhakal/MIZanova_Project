/**
 * Controls too small to hit — found without signing in.
 *
 *   node scripts/tap-target-check.mjs
 *
 * ---------------------------------------------------------------------------
 * WHY A STATIC CHECK WHEN THERE IS ALREADY A BROWSER PROBE
 * ---------------------------------------------------------------------------
 * The probe in the sweep protocol measures the real thing — getBoundingClientRect
 * on a rendered page — and that is the better measurement. It has one structural
 * blind spot it can never fix: it can only see controls that are ON SCREEN, in a
 * role somebody is signed in as, in the state the page happens to be in.
 *
 * Every miss found so far lived in that blind spot:
 *
 *   - StudentTimeline's "Show fewer" renders ONLY once the list is expanded.
 *     Its "Show all" twin, four lines above it, had been fixed. The probe had
 *     never had both on screen at once.
 *   - Parent Dashboard's "See N earlier updates" needs more than three shared
 *     updates to exist at all.
 *   - AccountMenu's "Sign out" is inside a closed popover — 36px, on every
 *     page, for every role in the product.
 *   - Courses' "Save" is on a platform-admin page no session had reached.
 *
 * Reading the class strings has the opposite blind spot: it knows nothing about
 * content, so a link wrapped round an image looks 24px tall. That is what the
 * exclusions at the bottom are for, and each one names the reason. Run both.
 *
 * ---------------------------------------------------------------------------
 * THE ARITHMETIC, AND THE MISTAKE THAT HID TWO THIRDS OF THE RESULTS
 * ---------------------------------------------------------------------------
 * height = 2 × vertical padding + line-height.
 *
 * In Tailwind ONE SPACING UNIT IS 4px, not 8. Written with 8 the first run of
 * this check reported 3 controls; corrected, the same code reported 13. A
 * detector that is wrong in the safe-looking direction is worse than no
 * detector, because it is believed.
 *
 * WCAG 2.5.8 asks for 24px and the AAA target is 44px; this product uses 44
 * (`min-h-11`) because it is used on tablets in classrooms by people holding
 * something else.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TARGET = 44

/** One Tailwind spacing unit is 0.25rem. See the header. */
const unit = (n) => n * 4
const SPACING = Object.fromEntries(
  [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8].flatMap((n) => [
    [`py-${n}`, unit(n)],
    [`p-${n}`, unit(n)],
  ]),
)

/** Tailwind's default line-height for each size. No text-* class means base. */
const LINE_HEIGHT = {
  'text-xs': 16,
  'text-sm': 20,
  'text-base': 24,
  'text-lg': 28,
  'text-xl': 28,
  'text-2xl': 32,
}

/**
 * Known false positives: the class string cannot reach 44px but the CONTENT
 * does. Each is a file:line plus the reason it is not a defect, so that a real
 * regression at the same place is not waved through by a stale entry.
 */
const CONTENT_IS_TALLER = {
  'src/components/Messenger.tsx:86':
    'wraps an attachment <img max-h-72>; the link is as tall as the image',
  'src/components/Messenger.tsx:634':
    'two stacked spans — name over role — so ~52px',
  'src/pages/educator/AddStudent.tsx:238':
    'a heading span over a three-line paragraph span',
}

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path)
    else if (path.endsWith('.tsx')) files.push(path.replaceAll('\\', '/'))
  }
})('src')

const findings = []
const staleExclusions = new Set(Object.keys(CONTENT_IS_TALLER))

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')

  lines.forEach((line, i) => {
    const match = line.match(/className=[{`"]([^"`}]*)/)
    if (!match) return

    const classes = match[1].split(/\s+/).filter(Boolean)
    const has = (c) => classes.includes(c)

    // Only things drawn as a control, and never a visually hidden one.
    if (!has('rounded-btn') && !has('pressable') && !has('rounded-card')) return
    if (has('sr-only')) return

    // An explicit floor is the guarantee this check exists to ask for.
    if (classes.some((c) => /^(min-)?h-(1[1-9]|2\d)$/.test(c))) return
    if (classes.some((c) => /^min-h-\[(4[4-9]|[5-9]\d|\d{3,})px\]$/.test(c)))
      return
    if (has('aspect-square')) return

    /*
     * Which element does this className belong to?
     *
     * Scan back for the opening tag, past long onClick bodies — a 12-line
     * limit was not enough and hid a platform-admin Save button. But a long
     * scan alone walks straight out of the element: a <ul className="…
     * rounded-card"> nested inside a <Link> was reported as the Link. So the
     * scan also refuses to cross a line that ENDS an opening tag. If the tag
     * above was already closed, this className belongs to something else.
     */
    let tag = null
    for (let j = i - 1; j >= Math.max(0, i - 45); j--) {
      const text = lines[j].trim()
      const opener = text.match(
        /<(button|a|Link|NavLink|summary|input|select|textarea|span|div|li|ul|dl|p|pre|section|form)\b/,
      )
      if (opener) {
        tag = opener[1]
        break
      }
      // `>` or `/>` at the end of a line closes whatever opening tag is above.
      if (/\/?>$/.test(text)) return
    }
    if (!['button', 'a', 'Link', 'NavLink', 'summary'].includes(tag)) return

    const padding = classes.map((c) => SPACING[c]).find((v) => v !== undefined)
    const lineHeight = classes
      .map((c) => LINE_HEIGHT[c])
      .find((v) => v !== undefined)

    const height = (padding ?? 0) * 2 + (lineHeight ?? LINE_HEIGHT['text-base'])
    if (height >= TARGET) return

    const at = `${file}:${i + 1}`
    if (CONTENT_IS_TALLER[at]) {
      staleExclusions.delete(at)
      return
    }

    findings.push({ at, tag, height, text: line.trim().slice(0, 60) })
  })
}

for (const at of staleExclusions) {
  console.log(
    `note: the exclusion for ${at} no longer matches anything — the control ` +
      `moved or was fixed. Remove it so it cannot hide a future regression.`,
  )
}

if (findings.length === 0) {
  console.log(`No control is under ${TARGET}px. ${files.length} files read.`)
  process.exit(0)
}

console.log(`${findings.length} controls cannot reach ${TARGET}px:\n`)
for (const f of findings.sort((a, b) => a.height - b.height)) {
  console.log(`  ${String(f.height).padStart(2)}px  <${f.tag}>  ${f.at}`)
  console.log(`        ${f.text}`)
}
console.log(
  '\nAdd min-h-11. A <button> centres its own content; a <Link> needs ' +
    'inline-flex items-center with it, or the text sits at the top.',
)
process.exit(1)
