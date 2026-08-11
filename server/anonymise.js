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
 */

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
 * @returns {{ text: string, redactions: number }}
 */
export function redact(text, names = []) {
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
    countReplace(nameMatcher(name), '[STUDENT]')
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
 * @param {string[]} input.namesToRemove
 */
export function buildAnonymousPayload({
  behaviourType,
  intensity,
  notes,
  durationSeconds,
  yearLevel,
  namesToRemove = [],
}) {
  const { text, redactions } = redact(notes ?? '', namesToRemove)

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
    redactions,
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
