import { useQuery } from '@tanstack/react-query'
import {
  fetchInvoices,
  fetchSchools,
  formatMoney,
  queryKeys,
} from '../../lib/api'
import { ErrorState, LoadingCards } from '../../components/QueryState'

/**
 * Billing across every school — docs/Figma Pages Design/Billing & Revenue Dashboard.png.
 *
 * WHAT IS NOT HERE, AND WHY NOT. That design leads with ARR, MRR, churn rate
 * and a growth curve. MiZanova has none of those: nobody subscribes to it.
 * Schools bill families for tuition and therapy, one invoice at a time, and
 * an invoice is not recurring revenue. Working out an annual run rate from a
 * few one-off invoices would be arithmetic dressed up as a metric — the same
 * objection as the 94.2% model accuracy on the AI governance screen.
 *
 * Every number below is a sum of real invoice rows, and says so.
 */
export default function Billing() {
  const invoices = useQuery({
    queryKey: queryKeys.invoices,
    queryFn: fetchInvoices,
  })
  const schools = useQuery({ queryKey: queryKeys.schools, queryFn: fetchSchools })

  if (invoices.isPending) return <LoadingCards count={3} />
  if (invoices.isError) return <ErrorState message={invoices.error.message} />

  const paid = invoices.data.filter((i) => i.status === 'paid')
  const open = invoices.data.filter((i) => i.status === 'open')

  const collected = paid.reduce((sum, i) => sum + i.amount_cents, 0)
  const outstanding = open.reduce((sum, i) => sum + i.amount_cents, 0)

  // Oldest unpaid first: an invoice issued in March and still open is a
  // different conversation from one issued last week.
  const overdue = open
    .filter((i) => i.due_date !== null && new Date(i.due_date) < new Date())
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Billing</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          What schools have invoiced families, across every tenant.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Collected
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {formatMoney(collected)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {paid.length} paid invoice{paid.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Outstanding
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {formatMoney(outstanding)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {open.length} issued and unpaid
          </p>
        </div>

        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Past due date
          </p>
          <p
            className={`mt-2 text-4xl font-bold ${
              overdue.length > 0 ? 'text-danger-foreground' : 'text-foreground'
            }`}
          >
            {overdue.length}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {overdue.length > 0
              ? `Oldest due ${new Date(overdue[0].due_date!).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}`
              : 'Nothing overdue'}
          </p>
        </div>
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Recent invoices
      </h2>

      {invoices.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No school has issued an invoice yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
          <table className="w-full min-w-[34rem] text-left">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                  Description
                </th>
                <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                  Status
                </th>
                <th scope="col" className="p-4 text-sm font-semibold text-foreground">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.data.slice(0, 25).map((invoice) => (
                <tr key={invoice.id} className="border-b border-border last:border-0">
                  <td className="p-4">
                    <span className="font-medium text-foreground">
                      {invoice.description}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {new Date(invoice.created_at).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-muted-foreground capitalize">
                    {invoice.status}
                  </td>
                  <td className="p-4 font-semibold text-foreground">
                    {formatMoney(invoice.amount_cents, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-6 rounded-card border border-border bg-background p-6">
        <h2 className="font-semibold text-foreground">Not shown, deliberately</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          The design for this screen leads with annual recurring revenue,
          monthly recurring revenue, churn and a growth curve. Nobody
          subscribes to MiZanova — schools bill families one invoice at a time,
          and a one-off invoice is not recurring revenue. Deriving a run rate
          from {invoices.data.length} invoice
          {invoices.data.length === 1 ? '' : 's'} would be arithmetic dressed up
          as a metric. Every figure above is a sum of real rows.
          {schools.data && schools.data.length > 0 && (
            <> Across {schools.data.length} school
            {schools.data.length === 1 ? '' : 's'}.</>
          )}
        </p>
      </section>
    </div>
  )
}
