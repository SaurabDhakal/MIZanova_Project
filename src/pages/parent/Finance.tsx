import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  confirmCheckout,
  fetchInvoices,
  formatMoney,
  queryKeys,
  startCheckout,
  type InvoiceRow,
} from '../../lib/api'
import { useMyChildren } from '../../hooks/useMyChildren'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import { showToast } from '../../lib/toast'
import { fullName } from '../../lib/displayName'

/**
 * Collab & Finance — docs/Figma Pages Design/Parent Collab & Finance.png.
 *
 * WHAT IS NOT HERE. The design shows an "Annual support budget: 85% used"
 * ring, an expense-distribution donut split across tuition, therapy, materials
 * and activities, and a Download History button. None of those exist: an
 * invoice carries one description and one amount, nothing categorises them,
 * there is no budget anywhere in the product, and nothing generates a PDF.
 * The totals below are added up from real invoices instead.
 *
 * The Collaboration half of that screen — shared resources with acknowledge
 * buttons — is a separate feature that does not exist either. IEP documents
 * already have their own acknowledgement flow on Goals & IEP; duplicating a
 * fake version here would be worse than the gap.
 */

const STATUS_STYLE: Record<InvoiceRow['status'], { label: string; className: string }> =
  {
    draft: { label: 'Draft', className: 'bg-background text-muted-foreground' },
    open: { label: 'Due', className: 'bg-warning-subtle text-warning-foreground' },
    paid: { label: 'Paid', className: 'bg-success-subtle text-success-foreground' },
    void: { label: 'Cancelled', className: 'bg-background text-muted-foreground' },
  }

export default function Finance() {
  const queryClient = useQueryClient()
  const { children } = useMyChildren()
  const [params, setParams] = useSearchParams()

  const invoices = useQuery({
    queryKey: queryKeys.invoices,
    queryFn: fetchInvoices,
  })

  const sessionId = params.get('session_id')
  const cancelled = params.get('cancelled')

  /**
   * Stripe has sent the parent back. Ask the server whether the money actually
   * moved — the query string proves nothing on its own.
   *
   * A mutation rather than an effect holding its own loading flag: `isPending`
   * already is that flag, and setting one inside an effect is the
   * cascading-render pattern react-hooks/set-state-in-effect exists to catch.
   * It has caught this codebase four times now.
   */
  const confirm = useMutation({
    mutationFn: (id: string) => confirmCheckout(id),
    onSuccess: (paid) => {
      showToast(
        paid ? 'Payment received. Thank you.' : 'That payment has not completed.',
        paid ? 'success' : 'error',
      )
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices })
    },
    onError: (error) => {
      showToast(
        error instanceof Error ? error.message : 'Could not confirm payment.',
        'error',
      )
    },
    onSettled: () => {
      // Clear the query string so a refresh does not re-run this, and the URL
      // stops carrying a payment reference around.
      setParams({}, { replace: true })
    },
  })

  // Triggered by arriving at a URL rather than by anyone pressing anything,
  // which is what an effect is for. The effect only starts the work.
  useEffect(() => {
    if (sessionId) confirm.mutate(sessionId)
    // Deliberately keyed on the session id alone: including the mutation would
    // re-run this on every render, and confirming a payment twice is not free.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const pay = useMutation({
    mutationFn: (invoiceId: string) => startCheckout(invoiceId),
    onSuccess: (url) => {
      // Leaving MiZanova for Stripe's own payment page.
      window.location.href = url
    },
  })

  if (invoices.isPending) return <LoadingCards count={2} />
  if (invoices.isError) return <ErrorState message={invoices.error.message} />

  const nameFor = (studentId: string) =>
    (() => {
      const c = children.find((x) => x.id === studentId)
      return c ? fullName(c) : 'your child'
    })()

  const payable = invoices.data.filter((i) => i.status === 'open')
  const paid = invoices.data.filter((i) => i.status === 'paid')

  const owed = payable.reduce((sum, i) => sum + i.amount_cents, 0)
  const paidTotal = paid.reduce((sum, i) => sum + i.amount_cents, 0)

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Finance</h1>
        <p className="mt-1 text-muted-foreground">
          Invoices from your child&rsquo;s school, and what you have paid.
        </p>
      </header>

      {cancelled && (
        <p
          role="status"
          className="mb-6 rounded-card border border-border bg-card shadow-raised p-4 text-sm text-muted-foreground"
        >
          That payment was cancelled. Nothing has been charged.
        </p>
      )}

      {confirm.isPending && (
        <p
          role="status"
          className="mb-6 rounded-card border border-primary bg-primary-subtle p-4 text-sm font-medium text-foreground"
        >
          Checking your payment with Stripe…
        </p>
      )}

      <div className="mb-6 grid gap-5 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Due now
          </p>
          <p
            className={`mt-2 text-4xl font-bold ${
              owed > 0 ? 'text-warning-foreground' : 'text-foreground'
            }`}
          >
            {formatMoney(owed)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {payable.length} unpaid invoice{payable.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Paid to date
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {formatMoney(paidTotal)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Across {paid.length} invoice{paid.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {pay.isError && (
        <p
          role="alert"
          className="mb-4 rounded-card border border-danger bg-danger-subtle p-4 text-sm text-danger-foreground"
        >
          {pay.error.message}
        </p>
      )}

      {invoices.data.length === 0 ? (
        <EmptyState
          title="No invoices"
          detail="When your child's school issues an invoice it appears here, and you can pay it from this page."
        />
      ) : (
        <ul className="space-y-3">
          {invoices.data.map((invoice) => {
            const style = STATUS_STYLE[invoice.status]
            return (
              <li
                key={invoice.id}
                className="rounded-card border border-border bg-card shadow-raised p-5 sm:flex sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {invoice.description}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {nameFor(invoice.student_id)}
                    {invoice.due_date &&
                      invoice.status === 'open' &&
                      ` · due ${new Date(invoice.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}`}
                    {invoice.paid_at &&
                      ` · paid ${new Date(invoice.paid_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}`}
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-3 sm:mt-0 sm:ml-auto">
                  <span
                    className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${style.className}`}
                  >
                    {style.label}
                  </span>
                  <span className="text-lg font-bold text-foreground">
                    {formatMoney(invoice.amount_cents, invoice.currency)}
                  </span>
                  {invoice.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => pay.mutate(invoice.id)}
                      disabled={pay.isPending}
                      className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {pay.isPending ? 'Opening…' : 'Pay'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-6 max-w-prose text-xs text-muted-foreground">
        Payments are handled by Stripe on their own secure page. MiZanova never
        sees or stores your card details.
      </p>
    </div>
  )
}
