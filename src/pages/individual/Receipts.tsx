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
import Icon from '../../components/Icon'

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
    /* Newest first, BY DATE. It sorted by receipt number, which is an
       identifier that happens to run in payment order — so the two agree until
       they don't, and then the page lists a July receipt above a September one
       while the reader is scanning the date column. Sort on the thing they are
       actually reading; keep the number as the tiebreaker for the same day. */
    .sort(
      (a, b) =>
        (b.paid_at ?? '').localeCompare(a.paid_at ?? '') ||
        (b.receipt_number ?? 0) - (a.receipt_number ?? 0),
    )

  /* The span the total covers. A figure with no dates on it is not much use to
     anybody filing a claim for a particular year.

     Read off the DATES, not off the ends of the list. The list is ordered by
     receipt number, and taking the first and last row assumes numbers and
     dates run the same way. They normally do — a number is issued when the
     money moves — but "normally" printed the range backwards the first time
     this was looked at, and a date range that reads September to July is the
     kind of thing somebody notices on a document they are about to send to
     the tax office. Sorting the times costs nothing and cannot be wrong. */
  const times = paid
    .map((p) => p.paid_at)
    .filter((d): d is string => Boolean(d))
    .sort()
  const month = (iso: string | undefined) =>
    iso
      ? new Date(iso).toLocaleDateString('en-AU', {
          month: 'long',
          year: 'numeric',
        })
      : null
  const oldest = month(times[0])
  const newest = month(times[times.length - 1])

  return (
    <div>
      {/* ---------------------------------------------------------------
          THE HOUSE PRINT CONVENTIONS, WHICH THIS PAGE WAS NOT USING.
          ---------------------------------------------------------------
          index.css already carries a print stylesheet — it hides nav, aside
          and every button, forces the light tokens so a dark-mode reader does
          not print white on white, sets a margin wide enough for a hole punch,
          and defines `.print-keep` and `.print-only`. Progress.tsx uses them.

          This page had its own ad-hoc `print:hidden` and
          `print:break-inside-avoid` instead, which happened to work and meant
          the one screen whose entire purpose is being printed was the one
          screen not following the rules written for printing.
          --------------------------------------------------------------- */}
      <div className="print-only mb-6 border-b border-border pb-4">
        <p className="text-sm font-semibold tracking-wide uppercase">
          MiZanova — receipts
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          {profile?.full_name?.trim() || profile?.email}
        </h1>
        <p className="mt-1 text-sm">
          Printed{' '}
          {new Date().toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      <header className="print-hide mb-6">
        <h1 className="text-title text-foreground">Receipts</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Everything you have paid for, with a number you can quote. Use your
          browser&rsquo;s print option to save one as a PDF.
        </p>
      </header>

      {paid.length === 0 && (
        <div className="print-hide rounded-card border border-border bg-card p-6 shadow-raised">
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

      {/* ---------------------------------------------------------------
          THE TOTAL, BECAUSE THAT IS THE NUMBER SOMEBODY IS AFTER.
          ---------------------------------------------------------------
          The page listed receipts and left the arithmetic to the reader. But
          the reason this screen exists is a claim — an NDIS plan, a study
          allowance, a tax return — and every one of those asks what you spent,
          not what you spent on the third of March. Adding up cards by hand is
          exactly the sort of task the people using this account find hardest.

          It prints, deliberately: a claim wants the total on the paper.

          Only shown for more than one, because "1 receipt, $49.00 in total"
          under a receipt for $49.00 is the page repeating itself.
          --------------------------------------------------------------- */}
      {paid.length > 1 && (
        <section className="print-keep mb-6 rounded-card border border-border bg-primary-subtle p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-wider text-primary uppercase">
                Everything you have paid
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                {formatMoney(
                  paid.reduce((n, p) => n + p.amount_cents, 0),
                  paid[0].currency,
                )}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {paid.length} receipts
              {oldest && newest && (
                <>
                  {' '}
                  &middot;{' '}
                  {/* Everything in one month says the month once. "July 2026
                      to July 2026" is a range that isn't one. */}
                  {oldest === newest ? oldest : `${oldest} to ${newest}`}
                </>
              )}
            </p>
          </div>
        </section>
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
                className="print-keep rounded-card border border-border bg-card p-6 shadow-raised"
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
                {/* "ASK SPECIAL MILES" WITH NO WAY TO ASK THEM. The sentence
                    told somebody to do something and named no route, on the
                    one screen where the reader is most likely to be mid-claim
                    and in a hurry. Settings now has a Help & contact tab that
                    answers "how do I reach a person", including the honest
                    part — that there is no support inbox yet. */}
                <p className="mt-4 max-w-prose text-xs text-muted-foreground">
                  This is a receipt, not a tax invoice. A tax invoice must carry
                  the seller&rsquo;s ABN and its GST treatment, and neither has
                  been supplied for MiZanova yet. If you need one for a claim,
                  quote the number above &mdash;{' '}
                  <Link
                    to="/account/help"
                    className="print-hide font-semibold text-primary hover:underline"
                  >
                    here is how to reach Special Miles
                  </Link>
                  .
                </p>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-11 mt-4 inline-flex items-center gap-2 rounded-btn border border-border bg-background px-4 py-2.5 font-semibold text-foreground"
                >
                  <Icon name="invoices" className="h-4 w-4 shrink-0" />
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
