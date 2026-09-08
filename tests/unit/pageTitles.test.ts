import { describe, expect, test } from 'vitest'
import { titleFor } from '../../src/lib/pageTitles'

/**
 * What the browser tab, the history entry and the aria-label on <main> say.
 *
 * UNTESTED UNTIL NOW, AND IT HAS BEEN WRONG TWICE. `/invite/:token` announced
 * "Page not found" on a working page — the first thing an invited person ever
 * saw of the product told them it did not exist. Adding `/account/help`
 * reproduced it, because the account section has no fallback the way a role
 * section does.
 *
 * These are cheap assertions about strings, and they are the only thing
 * standing between a rename and a screen reader announcing the wrong screen.
 */
describe('a role section names itself, because staff hold more than one', () => {
  test('an educator keeps the section in the title', () => {
    expect(titleFor('/educator')).toBe('Dashboard — Educator')
    expect(titleFor('/educator/students')).toBe('Students — Educator')
  })

  test('so do the others', () => {
    expect(titleFor('/parent/goals')).toBe('Goals & IEP — Parent')
    expect(titleFor('/platform-admin/tenants')).toBe('Schools — Platform Admin')
  })

  test('a detail page under a section falls back to the section', () => {
    // e.g. /educator/students/<id>, which matches no nav item.
    expect(titleFor('/educator/students/abc-123')).toBe('Students — Educator')
  })
})

describe('an individual is not told which category they are in', () => {
  /* `selfLabel` is empty for this role: they hold one, cannot switch, and did
     not choose the word. "Home — Individual" named it in the tab, the history
     and what a screen reader announces on arrival. */
  test('nav pages carry no role suffix', () => {
    expect(titleFor('/individual')).toBe('Home')
    expect(titleFor('/individual/goals')).toBe('My goals')
    expect(titleFor('/individual/suggestions')).toBe('Suggestions')
  })

  test('and neither do the pages that are not in the nav', () => {
    expect(titleFor('/individual/receipts')).toBe('Receipts')
    expect(titleFor('/individual/what-works')).toBe('What works for me')
  })
})

describe('the pages that have been wrong before', () => {
  test('an invitation is not "Page not found"', () => {
    expect(titleFor('/invite/some-token')).toBe('Your invitation')
  })

  test('every account tab is named', () => {
    // The account section has no fallback, so a missing entry here lands on
    // "Page not found" while the page renders perfectly.
    expect(titleFor('/account/profile')).toBe('Your account')
    expect(titleFor('/account/security')).toBe('Security')
    expect(titleFor('/account/payments')).toBe('Payments')
    expect(titleFor('/account/data')).toBe('Your data')
    expect(titleFor('/account/help')).toBe('Help and contact')
  })

  test('and something genuinely absent still says so', () => {
    expect(titleFor('/nope')).toBe('Page not found')
  })
})
