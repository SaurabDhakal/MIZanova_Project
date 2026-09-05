import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  fetchCourses,
  fetchMyPurchases,
  formatMoney,
  queryKeys,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ErrorState, LoadingCards } from '../../components/QueryState'

/**
 * Receipts for an individual — db/100.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SCREEN AND NOT A LINE ON THE HOME PAGE
 * ---------------------------------------------------------------------------
 * The home screen already lists what somebody bought. That is a line on a web
 * page: it cannot be filed, forwarded, or attached to anything. Somebody
 * paying for their own support out of their own pocket may well be claiming it
 * against an NDIS plan, an employer's study allowance or a tax return, and
 * "it is on the website" is not an answer to any of those.
 *
 * ---------------------------------------------------------------------------
 * A RECEIPT, AND IT SAYS SO
 * ---------------------------------------------------------------------------
 * In Australia a tax invoice has required contents and the seller's ABN is one
 * of them. This project has refused to print an ABN since the landing page was
 * written, because the one in the client's design is placeholder digits — and
 * a fabricated company number on a document about money is a worse lie than a
 * fabricated one on a poster.
 *
 * So the page says what it is and what it is not, rather than looking like a
 * tax invoice and quietly failing to be one. That is the honest position until
 * Special Miles supplies an ABN and confirms its GST position, at which point
 * this becomes a tax invoice by adding two lines.
 *
 * ---------------------------------------------------------------------------
 * PRINTING RATHER THAN GENERATING A PDF
 * ---------------------------------------------------------------------------
 * Every browser prints to PDF. A print stylesheet gets a filed, emailable
 * document with no library, no server round trip and nothing to keep in step
 * with the screen — and it stays correct if the amounts ever change, which a
 * generated file would not.
 */
export default function Receipts() {
  const { profile } = useAuth()
  const purchases = useQuery({
    queryKey: queryKeys.myPurchases,
    queryFn: fetchMyPurchases,
  })
  const courses = useQuery({ queryKey: queryKeys.courses, queryFn: fetchCourses })

  if (purchases.isPending) return <LoadingCards count={2} />
  if (purchases.isError) {
    return (
      <ErrorState
        message={purchases.error.message}
        onRetry={() => void purchases.refetch()}
      />
    )
  }

  /*
   * PAID ONLY. A pending row is somebody who reached Stripe and did not come
   * back — it has no receipt number by design (db/100), and listing it here
   * would offer a receipt for money that was never taken.
   */
  const paid = purchases.data
    .filter((p) => p.status === 'paid')
    .sort((a, b) => (b.receipt_number ?? 0) - (a.receipt_number ?? 0))

  return (
    <div>
      <header className="mb-6 print:hidden">
        <h1 className="text-title text-foreground">Receipts</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Everything you have paid for, with a number you can quote. Use your
          browser&rsquo;s print option to save one as a PDF.
        </p>
      </header>

      {paid.length === 0 && (
        <div className="rounded-card border border-border bg-card p-6 shadow-raised print:hidden">
          <p className="max-w-prose text-muted-foreground">
            You have not paid for anything, so there is nothing here. Every
            course is free at the moment &mdash; if that changes, the price is
            on the course before you start it, and a receipt appears here the
            moment a payment goes through.
          </p>
          <Link
            to="/individual/academy"
            className="mt-4 inline-block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
          >
            Look at the courses
          </Link>
        </div>
      )}

      {paid.length > 0 && (
        <ul className="space-y-6">
          {paid.map((purchase) => {
            const course = courses.data?.find((c) => c.id === purchase.course_id)
            return (
              <li
                key={purchase.id}
                /* break-inside-avoid so a receipt is never split across two
                   printed pages, which is the one thing that makes a printed
                   receipt useless. */
                className="rounded-card border border-border bg-card p-6 shadow-raised print:break-inside-avoid print:border print:shadow-none"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      Receipt
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                      {purchase.receipt_number
                        ? `No. ${purchase.receipt_number}`
                        : 'Number pending'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">
                      Special Miles
                    </p>
                    <p className="text-sm text-muted-foreground">
                      MiZanova &mdash; Australia
                    </p>
                  </div>
                </div>

                <dl className="mt-6 divide-y divide-border border-y border-border">
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-muted-foreground">Paid by</dt>
                    <dd className="font-medium text-foreground">
                      {profile?.full_name?.trim() || profile?.email}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-muted-foreground">For</dt>
                    <dd className="font-medium text-foreground">
                      {/* db/093 keeps a paid course readable even after it is
                          withdrawn, so this should always resolve. The fallback
                          exists so a receipt never loses its description. */}
                      {course?.title ?? 'A course that is no longer listed'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-muted-foreground">Date</dt>
                    <dd className="font-medium text-foreground">
                      {purchase.paid_at
                        ? new Date(purchase.paid_at).toLocaleDateString(
                            'en-AU',
                            { day: 'numeric', month: 'long', year: 'numeric' },
                          )
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="font-semibold text-foreground">
                      Amount paid
                    </dt>
                    <dd className="text-lg font-bold tabular-nums text-foreground">
                      {formatMoney(purchase.amount_cents, purchase.currency)}
                    </dd>
                  </div>
                </dl>

                {/* SAYS WHAT IT IS NOT. A document about money that looks like
                    a tax invoice and is not one is worse than one that is
                    clear about itself. */}
                <p className="mt-4 max-w-prose text-xs text-muted-foreground">
                  This is a receipt, not a tax invoice. A tax invoice must carry
                  the seller&rsquo;s ABN and its GST treatment, and neither has
                  been supplied for MiZanova yet. If you need one for a claim,
                  ask Special Miles and quote the number above.
                </p>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="mt-4 rounded-btn border border-border bg-background px-4 py-2.5 font-semibold text-foreground print:hidden"
                >
                  Print or save as PDF
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
