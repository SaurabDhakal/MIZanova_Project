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

/* ---------------------------------------------------------------------------
 * db/122 — the coded fields, which are asserted rather than redacted
 * ---------------------------------------------------------------------------
 * Redaction is a filter and therefore a guess, which is why everything above
 * exists to check its work. A closed vocabulary needs no guessing: 'transition'
 * cannot be a name in any school, ever.
 *
 * So the test is not "was it cleaned" but "would an unknown value be REFUSED".
 * A field that quietly dropped what it did not recognise would pass a leak
 * check while sending nothing, and the next person to read the code would
 * believe the value had travelled.
 * ------------------------------------------------------------------------ */
console.log('\nCoded fields must refuse anything outside their vocabulary')

const codedCases = [
  ['antecedent', { antecedent: 'Ethan was cross' }],
  ['what_helped', { whatHelped: 'sat with Mitchell' }],
  ['setting_event', { settingEvents: ['called 0412 345 678'] }],
]

for (const [field, extra] of codedCases) {
  let refused = false
  try {
    buildAnonymousPayload({
      behaviourType: 'disruptive',
      intensity: 'high',
      notes: '',
      namesToRemove: ROSTER,
      ...extra,
    })
  } catch {
    refused = true
  }
  if (refused) {
    console.log(`  ok  unrecognised ${field} refused`)
  } else {
    failures++
    console.log(`  *** FAIL *** an unrecognised ${field} was accepted`)
  }
}

// And the legitimate values must survive, or the fields are decorative.
const coded = buildAnonymousPayload({
  behaviourType: 'physical',
  intensity: 'high',
  notes: 'Ethan Mitchell threw a chair.',
  namesToRemove: ROSTER,
  antecedent: 'other',
  whatHelped: 'movement',
  settingEvents: ['poor_sleep'],
  /* db/125. The escape hatch is the ONE part of these fields that is prose,
     so it is the one part that can carry a name — and a teacher reaching for
     "something else" is describing something unusual, which is exactly when a
     name is likeliest to appear. */
  antecedentNote: 'Ethan Mitchell arrived late and Maya had taken his seat.',
  // A title the model wrote. It never saw a name, so in principle this cannot
  // carry one — "in principle" is how leaks happen, and it makes a second trip
  // to the API, so it is redacted like any other prose.
  priorOutcomes: [{ title: 'Visual timetable for Ethan', outcome: 'did_not_help' }],
  /* db/127. The profile is the most name-dense text in the payload: an incident
     note describes a moment, a profile invites the sentences that carry other
     people into it. */
  profile: {
    interests: 'Trains. Also anything Maya is doing.',
    strengths: 'Reads better than Annabelle.',
    finds_hard: 'Being rushed. Ring 0412 345 678 to discuss.',
    helps: ['movement'],
    triggers: ['transition'],
  },
})

const codedLeaks = findLeaks(JSON.stringify(coded), ROSTER)
if (codedLeaks.length > 0) {
  failures++
  console.log('  *** FAIL *** identifiers found in the db/122 payload')
  for (const leak of codedLeaks) console.log(`      ${leak}`)
} else if (
  coded.antecedent !== 'other' ||
  coded.whatHelped !== 'movement' ||
  coded.settingEvents[0] !== 'poor_sleep'
) {
  failures++
  console.log('  *** FAIL *** valid coded values did not survive')
} else if (!coded.antecedentNote || !/\[STUDENT\]/.test(coded.antecedentNote)) {
  failures++
  console.log(
    `  *** FAIL *** the 'other' note was dropped or not redacted: ${coded.antecedentNote}`,
  )
} else if (
  !coded.profile ||
  /Maya|Annabelle/.test(JSON.stringify(coded.profile)) ||
  coded.profile.helps[0] !== 'movement'
) {
  failures++
  console.log(
    `  *** FAIL *** the profile leaked or was dropped: ${JSON.stringify(coded.profile)}`,
  )
} else {
  console.log('  ok  profile prose redacted, profile codes survived')
  console.log(`      ${JSON.stringify(coded.profile)}`)
  console.log('  ok  valid coded values survived; notes and prior titles redacted')
  console.log(`      note: ${coded.antecedentNote}`)
  console.log(`      ${JSON.stringify(coded.priorOutcomes)}`)
}

/* A note without its code is an orphaned sentence the model cannot place, and
   it must not travel just because somebody typed it and changed their mind. */
const orphan = buildAnonymousPayload({
  behaviourType: 'disruptive',
  intensity: 'high',
  notes: '',
  namesToRemove: ROSTER,
  antecedent: 'transition',
  antecedentNote: 'Ethan Mitchell said something',
})
if (orphan.antecedentNote !== null) {
  failures++
  console.log("  *** FAIL *** a note travelled without its 'other' code")
} else {
  console.log("  ok  a note is dropped when 'other' was not the answer")
}

console.log(
  failures === 0
    ? '\nPASS — no identifier reached the payload in any case.'
    : `\nFAIL — ${failures} problem(s). Do not send anything to the AI.`,
)
process.exit(failures === 0 ? 0 : 1)
