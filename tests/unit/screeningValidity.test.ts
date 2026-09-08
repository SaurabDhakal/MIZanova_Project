import { describe, expect, test } from 'vitest'
import { screeningValidity } from '../../src/lib/screeningValidity'

/**
 * Whether a specialist applicant may be approved.
 *
 * A PURE FUNCTION, SO THE DANGEROUS CASE CAN ACTUALLY BE EXERCISED. db/047
 * refuses any edit to what an applicant claimed — "an application records what
 * somebody claimed" — so an application with a lapsed check cannot be
 * manufactured on a running database to look at. It could only be reasoned
 * about, and reasoning about it is what produced the bug: the screen tested
 * whether a NUMBER existed, printed "EXPIRED" beside it in red, and enabled
 * Approve anyway.
 *
 * The dates here are fixed rather than relative to today, so this suite does
 * not quietly change meaning in 2029.
 */

const NOW = new Date('2026-08-28T00:00:00Z')
const PAST = '2026-01-01'
const FUTURE = '2029-10-17'

const claim = (over: Partial<Parameters<typeof screeningValidity>[0]> = {}) => ({
  wwcc_number: null,
  wwcc_expiry: null,
  ndis_screening_number: null,
  ndis_expiry: null,
  ...over,
})

describe('nothing on file', () => {
  test('cannot be approved', () => {
    const v = screeningValidity(claim(), NOW)

    expect(v.approvable).toBe(false)
    // Not "all expired" — nothing has lapsed, nothing was ever given. The two
    // send different instructions to the applicant.
    expect(v.allExpired).toBe(false)
  })
})

describe('a WWCC', () => {
  test('current one is enough', () => {
    const v = screeningValidity(
      claim({ wwcc_number: '456789123', wwcc_expiry: FUTURE }),
      NOW,
    )

    expect(v.approvable).toBe(true)
    expect(v.wwccExpired).toBe(false)
  })

  /*
   * THE BUG. A number on file with a date in the past used to satisfy the
   * guard, because the guard only asked whether the number existed.
   */
  test('an expired one is NOT enough, even though the number is on file', () => {
    const v = screeningValidity(
      claim({ wwcc_number: '456789123', wwcc_expiry: PAST }),
      NOW,
    )

    expect(v.wwccOnFile).toBe(true)
    expect(v.wwccExpired).toBe(true)
    expect(v.approvable).toBe(false)
    expect(v.allExpired).toBe(true)
  })

  test('no expiry date given counts as valid', () => {
    // The form does not require one. Treating a blank as lapsed would block
    // real practitioners over a field nobody asked them to fill.
    const v = screeningValidity(claim({ wwcc_number: '456789123' }), NOW)

    expect(v.approvable).toBe(true)
  })

  test('an empty string is treated the same as no date', () => {
    const v = screeningValidity(
      claim({ wwcc_number: '456789123', wwcc_expiry: '' }),
      NOW,
    )

    expect(v.approvable).toBe(true)
  })
})

describe('an NDIS screening check', () => {
  test('is enough on its own', () => {
    // A separate national check. Somebody holding one and not a WWCC is a real
    // practitioner rather than an edge case.
    const v = screeningValidity(
      claim({ ndis_screening_number: '456465566', ndis_expiry: FUTURE }),
      NOW,
    )

    expect(v.approvable).toBe(true)
  })

  test('rescues a lapsed WWCC', () => {
    const v = screeningValidity(
      claim({
        wwcc_number: '456789123',
        wwcc_expiry: PAST,
        ndis_screening_number: '456465566',
        ndis_expiry: FUTURE,
      }),
      NOW,
    )

    expect(v.wwccExpired).toBe(true)
    expect(v.approvable).toBe(true)
    expect(v.allExpired).toBe(false)
  })

  test('but not when it has lapsed too', () => {
    const v = screeningValidity(
      claim({
        wwcc_number: '456789123',
        wwcc_expiry: PAST,
        ndis_screening_number: '456465566',
        ndis_expiry: PAST,
      }),
      NOW,
    )

    expect(v.approvable).toBe(false)
    expect(v.allExpired).toBe(true)
  })

  test('an expired NDIS number alone does not approve', () => {
    const v = screeningValidity(
      claim({ ndis_screening_number: '456465566', ndis_expiry: PAST }),
      NOW,
    )

    expect(v.approvable).toBe(false)
    expect(v.allExpired).toBe(true)
  })
})

describe('the boundary', () => {
  test('a check expiring later today is still valid', () => {
    // `<` rather than `<=`, so the last day of a clearance is a day it works.
    const v = screeningValidity(
      claim({
        wwcc_number: '456789123',
        wwcc_expiry: '2026-08-28T23:59:00Z',
      }),
      NOW,
    )

    expect(v.approvable).toBe(true)
  })

  test('one that expired a minute ago is not', () => {
    const v = screeningValidity(
      claim({
        wwcc_number: '456789123',
        wwcc_expiry: '2026-08-27T23:59:00Z',
      }),
      NOW,
    )

    expect(v.approvable).toBe(false)
  })
})
