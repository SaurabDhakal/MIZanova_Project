/**
 * Whether a specialist applicant holds a screening check that is still valid.
 *
 * ---------------------------------------------------------------------------
 * A CHECK ON FILE IS NOT A CHECK THAT IS VALID
 * ---------------------------------------------------------------------------
 * The Applications screen already refused to approve somebody with no screening
 * number at all, and said why in its own comment: Child Safe Standards require
 * the organisation to hold a record of the check, and approval is what a school
 * later relies on.
 *
 * It asked only whether a NUMBER existed. So an application whose WWCC had
 * expired passed the guard — the record was there, the card printed "EXPIRED"
 * in red beside it, and Approve was enabled anyway. That is a worse failure
 * than the one it was written for: with nothing on file, nothing looks
 * satisfied. With a lapsed check, everything does, and the only thing between a
 * dead clearance and an approval is whether a tired reviewer read the date.
 *
 * ---------------------------------------------------------------------------
 * EITHER CHECK SUFFICES, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------
 * An NDIS Worker Screening Check is a separate national check. A practitioner
 * who holds one and not a WWCC is a real person rather than an edge case, so a
 * lapsed WWCC alongside a current NDIS check is still approvable.
 *
 * ---------------------------------------------------------------------------
 * A MISSING EXPIRY DATE COUNTS AS VALID
 * ---------------------------------------------------------------------------
 * The application form does not require one. Treating "no date given" as lapsed
 * would block real practitioners over a field they were never asked to fill,
 * and inventing a failure is worse than the reviewer reading the number and
 * checking it at the source — which the screen links them to.
 *
 * Extracted from the component so it can be tested with dates that have already
 * passed, which is the case the screen cannot be made to show: db/047 refuses
 * any edit to what an applicant claimed, so an expired application cannot be
 * manufactured to look at.
 */

export type ScreeningClaim = {
  wwcc_number: string | null
  wwcc_expiry: string | null
  ndis_screening_number: string | null
  ndis_expiry: string | null
}

export type ScreeningValidity = {
  /** A number is recorded, whether or not it has lapsed. */
  wwccOnFile: boolean
  ndisOnFile: boolean
  wwccExpired: boolean
  ndisExpired: boolean
  /** At least one check is present AND has not expired. */
  approvable: boolean
  /** Something is on file, but every one of them has lapsed. */
  allExpired: boolean
}

/**
 * `asOf` is passed in rather than read here, so a test can ask about a date and
 * a component can pass its own clock. Defaulting to now keeps the caller simple.
 */
export function screeningValidity(
  claim: ScreeningClaim,
  asOf: Date = new Date(),
): ScreeningValidity {
  const lapsed = (date: string | null) =>
    date !== null && date !== '' && new Date(date) < asOf

  const wwccOnFile = Boolean(claim.wwcc_number)
  const ndisOnFile = Boolean(claim.ndis_screening_number)
  const wwccExpired = lapsed(claim.wwcc_expiry)
  const ndisExpired = lapsed(claim.ndis_expiry)

  const wwccUsable = wwccOnFile && !wwccExpired
  const ndisUsable = ndisOnFile && !ndisExpired
  const approvable = wwccUsable || ndisUsable

  return {
    wwccOnFile,
    ndisOnFile,
    wwccExpired,
    ndisExpired,
    approvable,
    // Only meaningful when something IS on file — it is what separates
    // "ask them for it" from "ask for the current one", which are different
    // instructions to send somebody.
    allExpired: (wwccOnFile || ndisOnFile) && !approvable,
  }
}
