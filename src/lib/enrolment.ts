import { createContext, useContext } from 'react'

/**
 * Whether the child whose record is on screen is still at the school.
 *
 * ---------------------------------------------------------------------------
 * WHY A CONTEXT AND NOT A PROP
 * ---------------------------------------------------------------------------
 * Seven components render a write control on one student record — the header's
 * Log behaviour, the profile card, the timeline's New goal and Edit, the IEP
 * documents section, the guardian section's Create code, and the sessions
 * section. Threading a boolean through all of them is possible; remembering to
 * thread it through the EIGHTH, a year from now, is the part that fails.
 *
 * db/136 is the rule itself — a trigger that refuses new rows about a departed
 * child no matter which screen asked. This is only so nobody is invited to
 * press something that is going to be refused. If a control is missed here the
 * consequence is a clear error message rather than a wrong write, which is the
 * right way round for the two halves to fail.
 *
 * DEFAULTS TO TRUE, so every one of those components behaves exactly as it
 * always has anywhere outside a student record — in a dashboard card, a
 * caseload, a parent's own page. Only StudentDetail provides a value.
 */
export const EnrolmentContext = createContext(true)

/**
 * False when this child has left the school.
 *
 * Use it to HIDE a control that begins something new, not to hide information.
 * Everything about a departed child stays readable; that is the entire reason
 * the record is kept rather than deleted.
 */
export function useEnrolled(): boolean {
  return useContext(EnrolmentContext)
}
