import { useRef, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  fetchInvoicePage,
  fetchSchoolBillingTotals,
  fetchSchools,
  formatMoney,
  queryKeys,
  setInvoiceStatus,
  type InvoiceRow,
  type InvoiceStatus,
  type SchoolBillingTotals,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import ConfirmDestructive from '../../components/ConfirmDestructive'
import Pagination from '../../components/Pagination'
import { showToast } from '../../lib/toast'

/**
 * Billing across every school — docs/Figma Pages Design/Billing & Revenue Dashboard.png.
 *
 * WHAT IS NOT HERE, AND WHY NOT. That design leads with ARR, MRR, churn and a
 * growth curve. MiZanova has none of those: nobody subscribes to it. Schools
 * bill families for tuition and therapy, one invoice at a time, and an invoice
 * is not recurring revenue.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PAGE CAN AND CANNOT DO, AND WHY THAT IS NOT AN OVERSIGHT
 * ---------------------------------------------------------------------------
 * It cannot mark anything paid. `invoices_guard_paid` in db/020 refuses that
 * from any browser session — `status` reaches 'paid' only through
 * `mark_invoice_paid`, which is granted to `service_role` alone and called by
 * the API server after Stripe confirms the money moved. A "Mark as paid"
 * button here would be a lie the database would refuse, so the page says so
 * instead of offering one.
 *
 * It does not issue invoices either. A school bills its own families, from
 * Invoices under School Admin. The one write that belongs to Special Miles is
 * VOIDING — cancelling a bill a school cannot unpick itself.
 */

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: 'bg-background text-muted-foreground',
  open: 'bg-warning-subtle text-warning-foreground',
  paid: 'bg-success-subtle text-success-foreground',
  void: 'bg-background text-muted-foreground line-through',
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  open: 'Issued',
  paid: 'Paid',
  void: 'Void',
}

/** Sums across schools, still separated by currency — adding AUD to USD is nonsense. */
function byCurrency(rows: SchoolBillingTotals[]) {
  const out = new Map<
    string,
    { collected: number; outstanding: number; overdue: number; overdueCents: number }
  >()

  for (const row of rows) {
    const at = out.get(row.currency) ?? {
      collected: 0,
      outstanding: 0,
      overdue: 0,
      overdueCents: 0,
    }
    at.collected += row.collected_cents
    at.outstanding += row.outstanding_cents
    at.overdue += row.overdue
    at.overdueCents += row.overdue_cents
    out.set(row.currency, at)
  }

  return [...out.entries()]
}

export default function Billing() {
  const queryClient = useQueryClient()
  const listTop = useRef<HTMLHeadingElement>(null)

  const [schoolId, setSchoolId] = useState('')
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all')
  const [page, setPage] = useState(0)
  const [voiding, setVoiding] = useState<InvoiceRow | null>(null)

  const totals = useQuery({
    queryKey: queryKeys.billingTotals,
    queryFn: fetchSchoolBillingTotals,
  })
  const schools = useQuery({
    queryKey: queryKeys.schools,
    queryFn: fetchSchools,
  })
  const invoices = useQuery({
    // The filters and the page belong in the key, or React Query serves the
    // first result for ever and the controls appear to do nothing.
    queryKey: queryKeys.invoicePage(schoolId, status, page),
    queryFn: () => fetchInvoicePage({ schoolId, status, page }),
    placeholderData: keepPreviousData,
  })

  const voidInvoice = useMutation({
    mutationFn: (invoice: InvoiceRow) => setInvoiceStatus(invoice.id, 'void'),
    onSuccess: () => {
      // queryKeys.invoices is ['invoices'] and every page key starts with it,
      // so this one call clears the list, the pages and the parent's view.
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices })
      void queryClient.invalidateQueries({ queryKey: queryKeys.billingTotals })
      setVoiding(null)
      showToast('Invoice voided.')
    },
  })

  if (totals.isPending) return <LoadingCards count={3} />
  if (totals.isError) return <ErrorState message={totals.error.message} />

  const schoolName = (id: string) =>
    schools.data?.find((s) => s.id === id)?.name ?? 'Unknown school'

  const money = byCurrency(totals.data)
  const manyCurrencies = money.length > 1

  /** Schools that have billed anything, most collected first. */
  const withRevenue = totals.data.filter((t) => t.invoices > 0)

  function changeFilter(next: () => void) {
    next()
    setPage(0)
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Billing</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          What schools have invoiced families, across every tenant. Every figure
          is added up by the database, not by this page.
        </p>
      </header>

      {money.length === 0 ? (
        <EmptyState
          title="No school has issued an invoice yet"
          detail="Totals appear here as soon as one does. Schools raise their own invoices from Invoices under School Admin."
        />
      ) : (
        money.map(([currency, sums]) => (
          <div key={currency} className="mb-5 grid gap-5 sm:grid-cols-3">
            <div className="rounded-card border border-border bg-card shadow-raised p-5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Collected{manyCurrencies && ` · ${currency.toUpperCase()}`}
              </p>
              <p className="mt-2 text-4xl font-bold text-foreground">
                {formatMoney(sums.collected, currency)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Paid through Stripe
              </p>
            </div>

            <div className="rounded-card border border-border bg-card shadow-raised p-5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Outstanding{manyCurrencies && ` · ${currency.toUpperCase()}`}
              </p>
              <p className="mt-2 text-4xl font-bold text-foreground">
                {formatMoney(sums.outstanding, currency)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Issued and unpaid
              </p>
            </div>

            <div className="rounded-card border border-border bg-card shadow-raised p-5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Past due date{manyCurrencies && ` · ${currency.toUpperCase()}`}
              </p>
              <p
                className={`mt-2 text-4xl font-bold ${
                  sums.overdue > 0
                    ? 'text-danger-foreground'
                    : 'text-foreground'
                }`}
              >
                {formatMoney(sums.overdueCents, currency)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {/* Overdue is part of outstanding, never a third pile. Saying
                    so stops somebody adding the two together. */}
                {sums.overdue === 0
                  ? 'Nothing overdue'
                  : `${sums.overdue} invoice${sums.overdue === 1 ? '' : 's'}, part of outstanding`}
              </p>
            </div>
          </div>
        ))
      )}

      {/* --- Revenue by school ------------------------------------------- */}
      {withRevenue.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
            By school
          </h2>
          <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
            <table className="w-full min-w-[40rem] text-left">
              <caption className="sr-only">
                Each school with what it has collected, what is outstanding and
                what is past its due date
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="p-4 text-sm font-semibold">
                    School
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold">
                    Invoices
                  </th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold">
                    Collected
                  </th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold">
                    Outstanding
                  </th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold">
                    Overdue
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold">
                    <span className="sr-only">Filter</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {withRevenue.map((row) => (
                  <tr
                    key={`${row.school_id}-${row.currency}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="p-4">
                      <span className="font-medium text-foreground">
                        {schoolName(row.school_id)}
                      </span>
                      {manyCurrencies && (
                        <span className="block text-sm text-muted-foreground">
                          {row.currency.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {row.invoices}
                      {row.drafts > 0 && ` · ${row.drafts} draft`}
                    </td>
                    <td className="p-4 text-right font-semibold tabular-nums text-foreground">
                      {formatMoney(row.collected_cents, row.currency)}
                    </td>
                    <td className="p-4 text-right tabular-nums text-foreground">
                      {formatMoney(row.outstanding_cents, row.currency)}
                    </td>
                    <td className="p-4 text-right tabular-nums">
                      {row.overdue === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="font-semibold text-danger-foreground">
                          {formatMoney(row.overdue_cents, row.currency)}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          changeFilter(() => setSchoolId(row.school_id))
                        }
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        See invoices
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* --- The invoices themselves -------------------------------------- */}
      <h2
        ref={listTop}
        className="mt-10 mb-3 text-lg font-semibold text-foreground"
      >
        Invoices
      </h2>

      <div className="mb-4 flex flex-wrap gap-3">
        <div>
          <label
            htmlFor="billing-school"
            className="block text-sm font-semibold text-foreground"
          >
            School
          </label>
          <select
            id="billing-school"
            value={schoolId}
            onChange={(e) => changeFilter(() => setSchoolId(e.target.value))}
            className="mt-1.5 rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
          >
            <option value="">Every school</option>
            {(schools.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="billing-status"
            className="block text-sm font-semibold text-foreground"
          >
            Status
          </label>
          <select
            id="billing-status"
            value={status}
            onChange={(e) =>
              changeFilter(() => setStatus(e.target.value as 'all' | InvoiceStatus))
            }
            className="mt-1.5 rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
          >
            <option value="all">Every status</option>
            <option value="draft">Draft</option>
            <option value="open">Issued</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </div>
      </div>

      {invoices.isError && <ErrorState message={invoices.error.message} />}

      {invoices.data && invoices.data.rows.length === 0 && (
        <EmptyState
          title="No invoices match"
          detail={
            schoolId || status !== 'all'
              ? 'Widen the filters above to see more.'
              : 'No school has issued an invoice yet.'
          }
        />
      )}

      {invoices.data && invoices.data.rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
            <table className="w-full min-w-[46rem] text-left">
              <caption className="sr-only">
                Invoices with the school that issued them, their status and
                amount
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="p-4 text-sm font-semibold">
                    Description
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold">
                    School
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold">
                    Status
                  </th>
                  <th scope="col" className="p-4 text-right text-sm font-semibold">
                    Amount
                  </th>
                  <th scope="col" className="p-4 text-sm font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.data.rows.map((invoice) => {
                  const overdue =
                    invoice.status === 'open' &&
                    invoice.due_date !== null &&
                    new Date(invoice.due_date) < new Date()

                  return (
                    <tr
                      key={invoice.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="p-4">
                        <span className="font-medium text-foreground">
                          {invoice.description}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {/* CREATED, not "issued". This is `created_at`, and
                              db/020 defines a draft as "being prepared, the
                              family cannot see it" — so "Issued" was a claim
                              the row itself contradicted. It is wrong for the
                              others too: an invoice drafted on Monday and
                              issued on Friday carries Monday here, and there
                              is no issued_at column to do better with. */}
                          Created{' '}
                          {new Date(invoice.created_at).toLocaleDateString(
                            'en-AU',
                            { day: 'numeric', month: 'long', year: 'numeric' },
                          )}
                          {invoice.due_date && (
                            <>
                              {' · '}
                              <span
                                className={
                                  overdue
                                    ? 'font-semibold text-danger-foreground'
                                    : undefined
                                }
                              >
                                due{' '}
                                {new Date(invoice.due_date).toLocaleDateString(
                                  'en-AU',
                                  { day: 'numeric', month: 'long' },
                                )}
                              </span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-foreground">
                        {schoolName(invoice.school_id)}
                      </td>
                      <td className="p-4">
                        <span
                          className={`rounded-btn px-2.5 py-1 text-sm font-semibold ${STATUS_STYLE[invoice.status]}`}
                        >
                          {STATUS_LABEL[invoice.status]}
                        </span>
                      </td>
                      <td className="p-4 text-right font-semibold tabular-nums text-foreground">
                        {formatMoney(invoice.amount_cents, invoice.currency)}
                      </td>
                      <td className="p-4 text-right">
                        {/* Void is the only write this role owns. Paid belongs
                            to Stripe; issuing belongs to the school. */}
                        {invoice.status === 'draft' ||
                        invoice.status === 'open' ? (
                          <button
                            type="button"
                            onClick={() => {
                              voidInvoice.reset()
                              setVoiding(invoice)
                            }}
                            className="rounded-btn border border-danger px-3 py-1.5 text-sm font-semibold text-danger-foreground"
                          >
                            Void
                          </button>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={invoices.data}
            onChange={setPage}
            label="invoices"
            anchor={listTop}
            busy={invoices.isFetching}
          />
        </>
      )}

      {voidInvoice.isError && voiding === null && (
        <p
          role="alert"
          className="mt-3 rounded-btn border border-danger bg-danger-subtle p-3 text-sm text-danger-foreground"
        >
          {voidInvoice.error.message}
        </p>
      )}

      {voiding && (
        <ConfirmDestructive
          title="Void this invoice?"
          detail={`${voiding.description} — ${formatMoney(voiding.amount_cents, voiding.currency)}, issued by ${schoolName(voiding.school_id)}.`}
          consequences={[
            voiding.status === 'open'
              ? 'The family can see this invoice now. Voiding withdraws it and they can no longer pay it.'
              : 'It is still a draft, so no family has seen it.',
            'The row is kept, marked void. "We billed this and cancelled it" stays answerable.',
            'It stops counting towards outstanding immediately.',
          ]}
          confirmLabel="Void invoice"
          pending={voidInvoice.isPending}
          error={voidInvoice.error?.message ?? null}
          onConfirm={() => voidInvoice.mutate(voiding)}
          onCancel={() => {
            voidInvoice.reset()
            setVoiding(null)
          }}
        />
      )}

      <section className="mt-8 rounded-card border border-border bg-background p-6">
        <h2 className="font-semibold text-foreground">
          Two things this page will not do
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          <strong>It cannot mark an invoice paid.</strong> A trigger in db/020
          refuses that from any browser, including this one. An invoice becomes
          paid when Stripe tells the server the money moved, and the server is
          the only thing holding a key that may say so — which is why there is
          no button here to look for.
        </p>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          <strong>It does not issue them either.</strong> A school bills its own
          families and raises its own invoices. Special Miles can void one,
          because a school cannot always unpick its own mistake, and that is the
          whole of the write access this screen has.
        </p>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          There is no annual or monthly recurring revenue here, and no churn
          rate. Nobody subscribes to MiZanova — schools bill families one
          invoice at a time, and deriving a run rate from one-off invoices would
          be arithmetic dressed up as a metric.
        </p>
      </section>
    </div>
  )
}
