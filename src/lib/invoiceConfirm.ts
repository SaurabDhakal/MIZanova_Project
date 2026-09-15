import type { InvoiceRow } from './api'

/**
 * What each of the three invoice confirm dialogs says.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A MODULE OF ITS OWN
 * ---------------------------------------------------------------------------
 * Issue, Discard and Cancel are one-way doors — db/062 makes invoice status
 * move forwards only — and they sit in one row of identically sized buttons on
 * Invoices.tsx. The failure worth preventing is not a dialog that fails to
 * open; it is a dialog that opens with the WRONG sentence over the RIGHT
 * button. Somebody reading "it has never been visible to the family" while
 * about to send that family a bill would believe it.
 *
 * A nested ternary across five props inside the render is exactly where that
 * mismatch would live unnoticed, so the copy is a pure function instead, and
 * tests/unit/invoiceConfirmCopy.test.ts holds each of the three to what is
 * actually true of it.
 *
 * It lives in lib/ rather than beside the page because eslint's
 * react-refresh/only-export-components is right: a component file that also
 * exports a function loses Fast Refresh for the whole page. `screeningValidity`
 * is the same shape — page-specific logic, extracted so it can be exercised.
 */

/** The one-way step a confirm dialog is open for. */
export type Confirming = {
  kind: 'issue' | 'discard' | 'cancel'
  invoice: InvoiceRow
}

export type ConfirmCopy = {
  title: string
  detail: string
  consequences: string[]
  confirmLabel: string
  /**
   * 'primary' for issuing. It is irreversible, not a loss — billing a family
   * is the ordinary work of this page, and a red button pressed every week is
   * what teaches somebody to click through the red one that deletes something.
   */
  tone: 'danger' | 'primary'
}

/**
 * Each one names the child, the description and the money, then states the
 * part db/062 makes permanent. "Are you sure?" is a question nobody can answer
 * without the numbers in front of them.
 */
export function confirmCopy(
  { kind, invoice }: Confirming,
  studentName: string,
  money: string,
): ConfirmCopy {
  const subject = `${invoice.description} — ${money} for ${studentName}`

  if (kind === 'issue') {
    return {
      title: 'Issue this invoice to the family?',
      detail: `${subject}. Check the amount: this is the moment it stops being private.`,
      consequences: [
        'The family will see this bill and can pay it.',
        'It cannot be put back to a draft. A wrong amount is corrected by cancelling and raising a new one, and the cancellation stays on their record.',
      ],
      confirmLabel: 'Issue to family',
      tone: 'primary',
    }
  }

  if (kind === 'discard') {
    return {
      title: 'Discard this draft?',
      detail: `${subject}. It has never been visible to the family.`,
      consequences: [
        'Nothing has been claimed of anybody, so nothing is being erased from their record.',
        'The draft itself cannot be recovered.',
      ],
      confirmLabel: 'Discard draft',
      tone: 'danger',
    }
  }

  return {
    title: 'Cancel this invoice?',
    detail: `${subject}. The family has already seen this bill.`,
    consequences: [
      'They will see it as cancelled, and it stays on their record as a bill that was raised and withdrawn.',
      'A cancelled invoice cannot be reopened. To charge for this again you raise a new one.',
    ],
    confirmLabel: 'Cancel invoice',
    tone: 'danger',
  }
}
