/**
 * Automated proof that no student identifier can reach the AI.
 *
 *   npm run anonymisation-check     (also runs inside npm run security-check)
 *
 * Every case below feeds real-looking identifiers through the anonymiser and
 * asserts none survive. Exits non-zero on any leak, so a regression fails
 * loudly instead of quietly sending a child's surname overseas.
 *
 * The awkward cases are here on purpose: possessives, an apostrophe surname,
 * a hyphenated surname, a second child mentioned in passing, and a name that
 * is a prefix of a longer word.
 */
import {
  buildAnonymousPayload,
  findLeaks,
  redact,
} from '../server/anonymise.js'

const ROSTER = [
  'Ethan',
  'Mitchell',
  'Maya',
  'Rodriguez',
  'Sofia',
  "L'Estrange",
  'Julian',
  'Okafor-Bright',
  'Ann',
  'Annabelle',
]

const CASES = [
  {
    name: 'plain first name',
    notes: 'Ethan left his seat four times during reading.',
  },
  {
    name: 'full name',
    notes: 'Ethan Mitchell became upset after the bell.',
  },
  {
    name: 'possessive with straight apostrophe',
    notes: "Ethan's pencil case was thrown across the desk.",
  },
  {
    name: 'possessive with curly apostrophe',
    notes: 'Ethan’s group work went much better today.',
  },
  {
    name: 'a SECOND child mentioned in passing',
    notes: 'He pushed Maya while lining up, then apologised.',
  },
  {
    name: 'apostrophe surname',
    notes: "Sofia L'Estrange sat alone at lunch again.",
  },
  {
    name: 'hyphenated surname',
    notes: 'Julian Okafor-Bright refused to start the task.',
  },
  {
    name: 'name that is a prefix of a longer word',
    notes: 'Ann and Annabelle both needed a reset break.',
  },
  {
    name: 'lower case and shouty case',
    notes: 'ethan was fine but MAYA was not.',
  },
  {
    name: 'contact details in the notes',
    notes:
      'Parent emailed sarah.mitchell@example.com and rang 0412 345 678 about Ethan.',
  },
  // The formats below were added after the first version of this check passed
  // while leaving a mobile number sitting in the payload. Each is a real
  // Australian number shape.
  { name: 'mobile with spaces', notes: 'Call the carer on 0412 345 678.' },
  { name: 'mobile unspaced', notes: 'Best number is 0412345678 after 3pm.' },
  { name: 'landline with area code', notes: 'Front office is (02) 9876 5432.' },
  { name: 'international format', notes: 'Reachable on +61 412 345 678.' },
  {
    name: 'plain email, no roster name inside',
    notes: 'Follow up with carer.contact@example.org tomorrow.',
  },
  {
    name: 'date of birth',
    notes: 'Ethan (DOB 14/03/2016) needed extra support.',
  },
]

let failures = 0

console.log('Anonymisation — no identifier may survive\n')

for (const testCase of CASES) {
  const { text } = redact(testCase.notes, ROSTER)
  const leaks = findLeaks(text, ROSTER)

  if (leaks.length > 0) {
    failures++
    console.log(`  *** FAIL *** ${testCase.name}`)
    console.log(`      in:  ${testCase.notes}`)
    console.log(`      out: ${text}`)
    for (const leak of leaks) console.log(`      ${leak}`)
  } else {
    console.log(`  ok  ${testCase.name}`)
    console.log(`      → ${text}`)
  }
}

// The payload as a whole must also be clean, not just the notes field. This
// catches a future change that adds a field carrying a name along with it.
console.log('\nWhole payload must contain no identifiers')
const payload = buildAnonymousPayload({
  behaviourType: 'disruptive',
  intensity: 'high',
  notes: "Ethan Mitchell shouted at Maya. Contact 0412 345 678.",
  durationSeconds: 247,
  yearLevel: '4',
  namesToRemove: ROSTER,
})

const payloadLeaks = findLeaks(JSON.stringify(payload), ROSTER)
if (payloadLeaks.length > 0) {
  failures++
  console.log('  *** FAIL *** identifiers found in the payload')
  console.log(`      ${JSON.stringify(payload)}`)
  for (const leak of payloadLeaks) console.log(`      ${leak}`)
} else {
  console.log('  ok  payload is clean')
  console.log(`      ${JSON.stringify(payload)}`)
}

// The payload must still be USEFUL. An anonymiser that redacted everything
// would pass every test above and make the product worthless.
console.log('\nPayload must still be useful')
if (payload.behaviourType !== 'disruptive' || payload.intensity !== 'high') {
  failures++
  console.log('  *** FAIL *** behaviour context was lost')
} else if (payload.approximateDurationMinutes !== 4) {
  failures++
  console.log(
    `  *** FAIL *** duration wrong: ${payload.approximateDurationMinutes}`,
  )
} else {
  console.log('  ok  behaviour, intensity and duration survived')
}

console.log(
  failures === 0
    ? '\nPASS — no identifier reached the payload in any case.'
    : `\nFAIL — ${failures} problem(s). Do not send anything to the AI.`,
)
process.exit(failures === 0 ? 0 : 1)
