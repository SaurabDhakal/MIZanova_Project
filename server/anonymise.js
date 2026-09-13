/**
 * Anonymisation. This runs on the server, before any request reaches the AI.
 *
 * The design tells teachers: "this AI does not access student PII". This file
 * is the only thing making that true, so it is written defensively and tested
 * automatically by scripts/anonymisation-check.mjs.
 *
 * Plain JavaScript rather than TypeScript on purpose: the server has no build
 * step, so what runs is exactly what you read, and the test script can import
 * this file directly with no compilation in between.
 *
 * WHAT IT REMOVES
 *   - the student's own first name, surname, and possessive forms
 *   - the names of every OTHER student at the same school (a teacher writing
 *     "he pushed Maya" would otherwise leak a second child)
 *   - staff names supplied by the caller
 *   - email addresses, Australian phone numbers, and dates of birth
 *
 * WHAT IT DELIBERATELY KEEPS
 *   - behaviour type, intensity, duration, year level, time of day.
 *     These are what makes a strategy useful, and none of them identify a
 *     child on their own.
 *   - since db/122: the antecedent, what helped, setting events, and the
 *     patterns computed from this child's own history. See below for why
 *     those are safe in a way free text is not.
 */

/* ===========================================================================
 * THE CLOSED VOCABULARIES — db/122
 * ===========================================================================
 * Redaction is a filter: it looks for things that resemble an identifier and
 * removes them. It is the best available answer for prose and it is inherently
 * a guess, which is why findLeaks() exists to check its work.
 *
 * A closed vocabulary needs neither. 'transition' cannot be a child's name, a
 * sibling's name or a clinic's address in any school, ever, because the only
 * values the column accepts are these. So the coded fields are not redacted —
 * they are ASSERTED, and a value that is not on this list stops the request
 * instead of being cleaned up and sent.
 *
 * That is a stronger guarantee than redaction and a stricter failure mode, and
 * it is the reason db/122 added vocabulary rather than another notes field.
 *
 * THESE MUST MATCH THE CHECK CONSTRAINTS IN db/122. If a value is added there
 * and not here, the request fails closed — the payload is refused rather than
 * sent — which is the right way round. The reverse would send a value the
 * database never validated.
 * ========================================================================= */
export const ANTECEDENTS = [
  'demand', 'transition', 'denied', 'peer', 'correction',
  'too_hard', 'attention_elsewhere',
  'waiting', 'sensory', 'change', 'discomfort', 'other', 'unknown',
]

export const WHAT_HELPED = [
  'quiet_space', 'familiar_adult', 'movement', 'choice_offered',
  'demand_reduced', 'helped_with_task', 'attention_given',
  'waited_quietly', 'sensory_item', 'redirected',
  'other', 'nothing_tried', 'still_escalated',
]

export const SETTING_EVENTS = [
  'poor_sleep', 'unwell', 'medication_change', 'substitute_adult',
  'routine_disrupted', 'family_event', 'first_day_back', 'indoor_play',
  'other',
]

/**
 * Refuse anything not in the vocabulary it claims to belong to.
 *
 * Throws rather than dropping the value. A silent drop means a future field
 * that carries something identifying travels as far as this function and then
 * gets quietly removed from the payload but not from the caller's mind — and
 * the next person to read the code believes it was sent.
 *
 * @param {string|null|undefined} value
 * @param {string[]} vocabulary
 * @param {string} field  named in the error, so the message says what to fix
 */
export function assertKnownCode(value, vocabulary, field) {
  if (value === null || value === undefined) return null
  if (!vocabulary.includes(value)) {
    throw new Error(
      `Refusing to send an unrecognised ${field}: "${value}". ` +
        'It is not in the vocabulary this field is validated against ' +
        '(server/anonymise.js and db/122 must agree).',
    )
  }
  return value
}

/** Escape a string so it can be used literally inside a regular expression. */
function escapeForRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a matcher for one name.
 *
 * Handles possessives ("Ethan's", with either apostrophe character) and works
 * for hyphenated and apostrophed surnames such as Okafor-Bright and
 * L'Estrange, which a naive \w+ pattern would split in half and miss.
 */
function nameMatcher(name) {
  return new RegExp(`\\b${escapeForRegex(name)}(?:['’]s)?\\b`, 'gi')
}

// Patterns are built fresh on each use rather than shared as module constants.
// A regex with the /g flag carries a lastIndex between calls, so reusing one
// instance for both redaction and leak-detection makes .test() return false on
// alternate calls — a leak detector that misses every second leak.
const patterns = () => ({
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  // Australian numbers: 0412 345 678, 0412345678, (02) 9876 5432,
  // +61 412 345 678, with spaces or dashes anywhere between digits.
  phone: /(?:\(0\d\)|\+61|\b0)[\s-]?\d(?:[\s-]?\d){6,9}\b/g,
  date: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
})

/**
 * Strip identifying information from free text.
 *
 * @param {string} text  the teacher's observation notes
 * @param {string[]} names  every name that must not survive: the student's own
 *   first and last name, all other students at the school, staff names
 * @param {string} placeholder  what a matched name becomes. Defaults to the
 *   school wording; db/094 passes [ME], because an adult writing about their
 *   own life reading "so [STUDENT] can settle" is being told the product has
 *   mistaken them for a child.
 * @returns {{ text: string, redactions: number }}
 */
export function redact(text, names = [], placeholder = '[STUDENT]') {
  if (!text) return { text: '', redactions: 0 }

  let out = text
  let redactions = 0
  const p = patterns()

  const countReplace = (pattern, replacement) => {
    out = out.replace(pattern, () => {
      redactions++
      return replacement
    })
  }

  // ORDER MATTERS, and getting it wrong is silent.
  //
  // Contact details go FIRST. If names were redacted first, a surname sitting
  // inside an address would turn sarah.mitchell@example.com into
  // sarah.[STUDENT]@example.com — which no longer matches the email pattern,
  // so the rest of a real address survives to the payload.
  countReplace(p.email, '[EMAIL]')
  countReplace(p.phone, '[PHONE]')
  countReplace(p.date, '[DATE]')

  // Longest names first. Otherwise redacting "Ann" inside "Annabelle" leaves
  // "[STUDENT]abelle" sitting in the payload — a partial name is still a leak.
  const sorted = [...names]
    .filter((n) => typeof n === 'string' && n.trim().length > 1)
    .map((n) => n.trim())
    .sort((a, b) => b.length - a.length)

  for (const name of sorted) {
    countReplace(nameMatcher(name), placeholder)
  }

  return { text: out, redactions }
}

/**
 * Build the complete payload sent to the AI for one behaviour log.
 *
 * Note what is NOT in the returned object: no student id, no school id, no
 * teacher id, no timestamps precise enough to correlate against a roster. If a
 * field is not needed to suggest a classroom strategy, it does not travel.
 *
 * @param {object} input
 * @param {string} input.behaviourType
 * @param {string} input.intensity
 * @param {string|null} input.notes
 * @param {number|null} input.durationSeconds
 * @param {string|null} input.yearLevel
 * @param {string|null} [input.antecedent]      db/122, coded
 * @param {string|null} [input.whatHelped]      db/122, coded
 * @param {string[]}    [input.settingEvents]   db/122, coded
 * @param {string|null} [input.antecedentNote]     db/125, FREE TEXT
 * @param {string|null} [input.whatHelpedNote]     db/125, FREE TEXT
 * @param {string|null} [input.settingEventsNote]  db/125, FREE TEXT
 * @param {object|null} [input.patterns]        student_behaviour_patterns()
 * @param {Array|null}  [input.priorOutcomes]   student_strategy_outcomes()
 * @param {object|null} [input.profile]        db/127. Prose is redacted; the
 *   two arrays are asserted against the same vocabularies as the log fields.
 * @param {string[]} [input.rejected]  db/129. Titles already shown for this
 *   incident. Model-written, but they make a second trip, so redacted.
 * @param {string|null} [input.askedFor]  db/129. FREE TEXT, written by staff.
 * @param {string[]} input.namesToRemove
 */
export function buildAnonymousPayload({
  behaviourType,
  intensity,
  notes,
  durationSeconds,
  yearLevel,
  antecedent = null,
  whatHelped = null,
  settingEvents = [],
  antecedentNote = null,
  whatHelpedNote = null,
  settingEventsNote = null,
  patterns = null,
  priorOutcomes = null,
  profile = null,
  rejected = [],
  askedFor = null,
  namesToRemove = [],
}) {
  const { text, redactions } = redact(notes ?? '', namesToRemove)
  let totalRedactions = redactions

  /*
   * THE TITLES ARE REDACTED; THE CODED FIELDS ARE ASSERTED.
   *
   * A prior strategy's title was written by the model, which never received a
   * name — so in principle it cannot contain one. "In principle" is how leaks
   * happen, this text is about to make a second trip to the API, and redacting
   * it costs one pass over eight short strings. The `patterns` object needs
   * none of this: every value in it is a vocabulary term or a number produced
   * by a GROUP BY, and there is no path by which a name enters it.
   */
  const outcomes = (priorOutcomes ?? []).map((o) => {
    const cleaned = redact(String(o.title ?? ''), namesToRemove)
    totalRedactions += cleaned.redactions
    return { title: cleaned.text, outcome: o.outcome }
  })

  /*
   * db/125. THE ONE PART OF THESE FIELDS THAT IS NOT A CODE.
   *
   * 'other' exists because the vocabulary cannot hold everything, and its note
   * is prose written by a teacher — so it can contain a name in a way
   * 'transition' never could. It gets the same treatment as the observation
   * notes: redacted here, and caught by findLeaks before the request goes out.
   */
  const note = (value) => {
    if (!value) return null
    const cleaned = redact(String(value), namesToRemove)
    totalRedactions += cleaned.redactions
    return cleaned.text
  }

  /*
   * db/127. THE PROFILE IS THE MOST NAME-DENSE TEXT IN THE PAYLOAD.
   *
   * An incident note describes a moment; a profile invites exactly the
   * sentences that carry other people — "great with her brother Toby", "best
   * friends with Maya", "settles when Mrs Patel is on duty". So the prose is
   * redacted like any other, and the two arrays are asserted against the same
   * vocabularies the log fields use, which is what makes them safe to send as
   * they are.
   */
  const profileClean = profile
    ? {
        interests: note(profile.interests),
        strengths: note(profile.strengths),
        findsHard: note(profile.finds_hard),
        helps: (profile.helps ?? []).map((h) =>
          assertKnownCode(h, WHAT_HELPED, 'profile helps'),
        ),
        triggers: (profile.triggers ?? []).map((t) =>
          assertKnownCode(t, ANTECEDENTS, 'profile trigger'),
        ),
      }
    : null

  /*
   * db/129. The teacher's own words about why an answer does not fit, and the
   * titles they are rejecting. `askedFor` is prose typed by a member of staff
   * about their own room — "no quiet corner, and Maya sits next to him" — so it
   * is exactly as likely to carry a name as an observation note.
   */
  const rejectedClean = (rejected ?? []).map((title) => {
    const cleaned = redact(String(title), namesToRemove)
    totalRedactions += cleaned.redactions
    return cleaned.text
  })
  const askedForClean = note(askedFor)

  const antecedentNoteClean = note(antecedentNote)
  const whatHelpedNoteClean = note(whatHelpedNote)
  const settingEventsNoteClean = note(settingEventsNote)

  return {
    behaviourType,
    intensity,
    // Coarse, not exact: "about 4 minutes" is as useful to a strategy as 247
    // seconds, and far less useful for matching a row back to a child.
    approximateDurationMinutes:
      durationSeconds === null || durationSeconds === undefined
        ? null
        : Math.round(durationSeconds / 60),
    yearLevel: yearLevel ?? null,
    notes: text,

    // db/122. Each one refuses the request rather than cleaning up a value the
    // database would not have accepted in the first place.
    antecedent: assertKnownCode(antecedent, ANTECEDENTS, 'antecedent'),
    whatHelped: assertKnownCode(whatHelped, WHAT_HELPED, 'what_helped'),
    settingEvents: (settingEvents ?? []).map((e) =>
      assertKnownCode(e, SETTING_EVENTS, 'setting_event'),
    ),

    // Only ever sent alongside the 'other' they explain. A note without its
    // code is an orphaned sentence the model cannot place.
    antecedentNote: antecedent === 'other' ? antecedentNoteClean : null,
    whatHelpedNote: whatHelped === 'other' ? whatHelpedNoteClean : null,
    settingEventsNote: (settingEvents ?? []).includes('other')
      ? settingEventsNoteClean
      : null,

    patterns,
    priorOutcomes: outcomes,
    profile: profileClean,
    rejected: rejectedClean,
    askedFor: askedForClean,

    redactions: totalRedactions,
  }
}

/**
 * Last line of defence: does this text still look like it contains an
 * identifier? Used by the automated check, and by the server as an assertion
 * immediately before the request goes out.
 *
 * @param {string} text
 * @param {string[]} names
 * @returns {string[]} descriptions of anything found; empty means clean
 */
export function findLeaks(text, names = []) {
  const problems = []
  if (!text) return problems

  for (const name of names) {
    if (typeof name !== 'string' || name.trim().length < 2) continue
    // Fresh matcher per name: nameMatcher returns a /g regex, and .test() on a
    // global regex advances lastIndex, so a reused instance silently skips.
    if (nameMatcher(name.trim()).test(text)) {
      problems.push(`name "${name}" survived redaction`)
    }
  }

  const p = patterns()
  const email = text.match(p.email)
  if (email) problems.push(`email survived redaction: ${email.join(', ')}`)
  const phone = text.match(p.phone)
  if (phone) problems.push(`phone survived redaction: ${phone.join(', ')}`)

  return problems
}
