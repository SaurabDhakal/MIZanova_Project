import { describe, expect, test } from 'vitest'
import { confirmCopy, type Confirming } from '../../src/lib/invoiceConfirm'
import type { InvoiceRow } from '../../src/lib/api'

/**
 * What the three invoice confirm dialogs say.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS TESTED AND THE BUTTONS AROUND IT ARE NOT
 * ---------------------------------------------------------------------------
 * Issue, Discard and Cancel are one-way doors — db/062 makes status move
 * forwards only, so none of the three can be taken back — and they sit in one
 * row of identically sized buttons. The failure that matters is not a dialog
 * that fails to open. It is a dialog that opens with the WRONG sentence over
 * the RIGHT button: somebody reading "it has never been visible to the family"
 * while about to send a bill to that family, and believing it.
 *
 * That is a copy bug, not a rendering bug, and a pure function is where it can
 * be caught. `confirmCopy` was pulled out of the JSX for exactly this reason;
 * a nested ternary across five props inside the render is where the mismatch
 * would have lived unnoticed.
 *
 * There is no component-render harness in this project (no jsdom, no
 * testing-library), and adding one to assert three strings would be a large
 * dependency for a small guarantee. The wiring around this function — state
 * opens the dialog, confirm calls the mutation, success closes it — was
 * verified against the live database by discarding a real draft.
 */

const INVOICE: InvoiceRow = {
  id: '00000000-0000-0000-0000-000000000001',
  school_id: '00000000-0000-0000-0000-0000000000aa',
  student_id: '00000000-0000-0000-0000-0000000000bb',
  description: 'Term 3 therapy sessions',
  amount_cents: 12500,
  currency: 'AUD',
  status: 'draft',
  due_date: '2026-10-01',
  created_at: '2026-09-01T00:00:00Z',
} as InvoiceRow

const copy = (kind: Confirming['kind']) =>
  confirmCopy({ kind, invoice: INVOICE }, 'Arlo Kaur', '$125.00')

describe('every dialog puts the numbers in front of the reader', () => {
  // The original window.confirm named the child and the money, and that part
  // was right. Losing it in the rewrite would be a quiet regression.
  test.each(['issue', 'discard', 'cancel'] as const)(
    '%s names the child, the description and the amount',
    (kind) => {
      const { detail } = copy(kind)
      expect(detail).toContain('Arlo Kaur')
      expect(detail).toContain('Term 3 therapy sessions')
      expect(detail).toContain('$125.00')
    },
  )

  test.each(['issue', 'discard', 'cancel'] as const)(
    '%s states what cannot be undone',
    (kind) => {
      expect(copy(kind).consequences.length).toBeGreaterThan(0)
    },
  )
})

describe('the sentence matches the button', () => {
  test('issuing does not claim the family cannot see it', () => {
    const { title, detail, consequences, confirmLabel } = copy('issue')
    const all = [title, detail, ...consequences].join(' ')

    expect(confirmLabel).toBe('Issue to family')
    // The discard dialog's reassurance, on the button that removes it.
    expect(all).not.toMatch(/never been visible/i)
    expect(all).not.toMatch(/cannot be recovered/i)
    // It must say the thing that is actually true of issuing.
    expect(all).toMatch(/will see this bill/i)
    expect(all).toMatch(/cannot be put back to a draft/i)
  })

  test('discarding says nothing about the family seeing it', () => {
    const { detail, consequences, confirmLabel } = copy('discard')
    const all = [detail, ...consequences].join(' ')

    expect(confirmLabel).toBe('Discard draft')
    expect(all).toMatch(/never been visible/i)
    expect(all).toMatch(/cannot be recovered/i)
    expect(all).not.toMatch(/will see this bill/i)
  })

  test('cancelling admits the family has already seen it', () => {
    const { detail, consequences, confirmLabel } = copy('cancel')
    const all = [detail, ...consequences].join(' ')

    expect(confirmLabel).toBe('Cancel invoice')
    expect(all).toMatch(/already seen/i)
    expect(all).toMatch(/cannot be reopened/i)
    // The opposite claim would be the dangerous one here.
    expect(all).not.toMatch(/never been visible/i)
  })

  test('the three labels are distinct', () => {
    const labels = (['issue', 'discard', 'cancel'] as const).map(
      (k) => copy(k).confirmLabel,
    )
    expect(new Set(labels).size).toBe(3)
  })
})

describe('tone', () => {
  /**
   * Billing a family is the ordinary work of this page. A red button on it
   * every week is what teaches somebody to click through the red one that
   * deletes something, so issuing is deliberately NOT painted as destruction.
   */
  test('issuing is not dressed as destruction', () => {
    expect(copy('issue').tone).toBe('primary')
  })

  test('the two that destroy something are', () => {
    expect(copy('discard').tone).toBe('danger')
    expect(copy('cancel').tone).toBe('danger')
  })
})
