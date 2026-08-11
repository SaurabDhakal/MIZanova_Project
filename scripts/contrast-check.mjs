/**
 * WCAG AA colour contrast check.
 *
 *   npm run contrast-check
 *
 * Reads the design tokens straight out of src/index.css and measures every
 * foreground/background pair the interface actually uses. Not a linter for
 * colours in the abstract — a list of the real combinations on screen, so a
 * pass here means something.
 *
 * WCAG 2.1 AA thresholds:
 *   4.5:1  normal text
 *   3.0:1  large text (>= 24px, or >= 18.66px bold) and UI component edges
 *
 * Exits non-zero if anything required fails, so it can gate a deploy.
 */
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

const tokens = Object.fromEntries(
  [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [
    m[1],
    m[2],
  ]),
)

/** sRGB relative luminance, per the WCAG definition. */
function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/**
 * Every pair that appears on screen, and the size it appears at.
 *
 * `large` marks text that is genuinely rendered at 24px+ or bold 18.66px+, and
 * `ui` marks non-text things — borders, focus rings — which AA holds to 3:1.
 * Claiming "large" for text that is not is the easiest way to make a contrast
 * report say what you want instead of what is true, so each one below names
 * where it is used.
 */
const PAIRS = [
  // --- Core text ---------------------------------------------------------
  ['foreground', 'background', 'body text on the page', {}],
  ['foreground', 'card', 'body text on a card', {}],
  ['muted-foreground', 'background', 'helper text on the page', {}],
  ['muted-foreground', 'card', 'helper text on a card', {}],

  // --- Sidebar -----------------------------------------------------------
  ['sidebar-foreground', 'sidebar', 'active nav label', {}],
  ['sidebar-muted', 'sidebar', 'inactive nav label', {}],

  // --- Buttons -----------------------------------------------------------
  ['primary-foreground', 'primary', 'text on a primary button', {}],
  ['sidebar-foreground', 'success-strong', 'text on the Save log button', {}],
  ['sidebar-foreground', 'danger-strong', 'text on a destructive button', {}],

  // --- Links and status text --------------------------------------------
  ['primary', 'card', 'link on a card', {}],
  ['primary', 'background', 'link on the page', {}],
  ['primary', 'primary-subtle', 'link on a tinted row', {}],
  ['success-foreground', 'success-subtle', 'success message', {}],
  ['success-foreground', 'card', 'success text on a card', {}],
  ['warning-foreground', 'warning-subtle', 'warning message', {}],
  ['warning-foreground', 'card', 'warning text on a card', {}],
  ['danger-foreground', 'danger-subtle', 'error message', {}],
  ['danger-foreground', 'card', 'error text on a card', {}],
  ['accent-foreground', 'accent-subtle', 'IEP chip', {}],
  ['accent-foreground', 'card', 'accent text on a card', {}],

  // --- Controls: 1.4.11 applies, 3:1 ------------------------------------
  // The edge of a text box is the only thing telling you a text box is there.
  ['input-border', 'card', 'input border on a card', { ui: true }],
  ['input-border', 'background', 'input border on the page', { ui: true }],
  ['danger', 'card', 'invalid field border', { ui: true }],
  ['ring', 'background', 'focus ring on the page', { ui: true }],
  ['ring', 'card', 'focus ring on a card', { ui: true }],
  ['primary', 'card', 'selected radio card outline', { ui: true }],
]

/**
 * Reported, not enforced.
 *
 * WCAG 1.4.11 covers "visual information required to identify user interface
 * components and states". A card outline and a table rule are neither: they
 * group and separate content, and removing them entirely would cost tidiness
 * rather than meaning. Holding decoration to a control's threshold would push
 * heavy grey lines through every screen and make the report pass for the wrong
 * reason.
 *
 * They are printed anyway, because "we decided this one does not count" should
 * be visible rather than silently dropped from the list.
 */
const DECORATIVE = [
  ['border', 'card', 'card outline / divider on a card'],
  ['border', 'background', 'card outline against the page'],
  ['card', 'background', 'card fill against the page'],
]

let failures = 0
let warnings = 0

console.log('WCAG AA contrast — tokens from src/index.css\n')
console.log('  ratio   need   pair')
console.log('  ' + '-'.repeat(70))

for (const [fg, bg, where, opts] of PAIRS) {
  const fgHex = tokens[fg]
  const bgHex = tokens[bg]

  if (!fgHex || !bgHex) {
    console.log(`  ??      —      MISSING TOKEN: ${fg} on ${bg}`)
    failures++
    continue
  }

  const need = opts.large || opts.ui ? 3 : 4.5
  const value = ratio(fgHex, bgHex)
  const ok = value >= need
  if (!ok) failures++

  const mark = ok ? 'ok ' : '***'
  console.log(
    `  ${value.toFixed(2).padStart(5)}  ${need.toFixed(1)}   ${mark} ${where} (${fg} on ${bg})`,
  )
}

console.log('\nDecorative — separation only, not held to 3:1 (see the note in this file):')
for (const [fg, bg, where] of DECORATIVE) {
  console.log(
    `  --  ${ratio(tokens[fg], tokens[bg]).toFixed(2).padStart(5)}:1  ${where}`,
  )
}

// The mid-tone status colours are documented in index.css as shape-only. Prove
// that comment is still true rather than trusting it — if one of them ever
// passes for text, the warning in the CSS has become misleading.
console.log('\nShape-only colours — these are EXPECTED to fail as small text:')
for (const name of ['success', 'warning', 'danger', 'accent']) {
  const value = ratio(tokens[name], tokens.card)
  const readable = value >= 4.5
  if (readable) {
    console.log(
      `  *** ${name} is now ${value.toFixed(2)}:1 on white — the "shapes only" note in index.css is out of date.`,
    )
    warnings++
  } else {
    console.log(
      `  ok  ${name.padEnd(8)} ${value.toFixed(2)}:1 on white — use ${name}-foreground for words.`,
    )
  }
}

/*
 * THE BRAND COLOURS WERE NEVER CHECKED BY THIS SCRIPT. It printed PASS while
 * measuring nothing about Joe's navy, blue or green — and those are exactly the
 * colours somebody will adjust when the brand is revisited, which is precisely
 * when a silent drop below the floor would happen.
 *
 * They are held to 3:1, not 4.5:1, because of how they are used: the green
 * draws tick icons and the "nova" half of the wordmark, the navy draws icon
 * tiles. Those are non-text graphics and large display type, where 3:1 is the
 * WCAG floor. If one ever clears 4.5:1 the note in index.css saying "never for
 * a sentence" has gone stale and should be rewritten rather than quietly relied
 * on.
 */
console.log('\nBrand colours — held to the 3:1 graphic floor, on the surfaces they are used on:')
for (const [name, bg, where, restricted] of [
  ['brand-navy', 'card', 'icon tiles on white', false],
  ['brand-blue', 'card', 'diagram strokes on white', false],
  ['brand-green', 'card', 'tick icons and the wordmark on white', true],
  ['brand-green', 'sidebar', 'the "nova" half of the wordmark on the sidebar', false],
]) {
  const value = ratio(tokens[name], tokens[bg])
  if (value < 3) {
    console.log(`  FAIL ${name} ${value.toFixed(2)}:1 — ${where} is below the 3:1 floor.`)
    failures++
  } else {
    console.log(`  ok   ${name.padEnd(11)} ${value.toFixed(2).padStart(5)}:1  ${where}`)
    // Only the green carries a "never for a sentence" note in index.css. Navy
    // is 11:1 and is perfectly good for body text, so flagging it would be a
    // warning that can never be actioned — the kind everyone learns to ignore.
    if (restricted && value >= 4.5) {
      console.log(`       note: ${name} now clears 4.5:1 — the "never for a sentence" note in index.css is out of date.`)
      warnings++
    }
  }
}

console.log(
  failures === 0
    ? `\nPASS — every pair in use meets WCAG AA.${warnings ? ` ${warnings} note(s) above.` : ''}`
    : `\nFAIL — ${failures} pair(s) below AA. Fix the token or stop using the pair.`,
)
process.exit(failures === 0 ? 0 : 1)
