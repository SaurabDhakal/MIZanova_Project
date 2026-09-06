import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  confirmSubscription,
  fetchMyPurchases,
  formatMoney,
  queryKeys,
} from '../../lib/api'
import { showToast } from '../../lib/toast'
import SubscriptionSection from '../../components/SubscriptionSection'
import Icon from '../../components/Icon'

/**
 * Money, in one place — Settings › Payments.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS RATHER THAN A LONGER ACCOUNT TAB
 * ---------------------------------------------------------------------------
 * The Account tab had grown to eleven sections: name, picture, email, role,
 * session, other devices, notifications, an admissions note, the subscription,
 * a link to the summary document, the data export and closing the account. A
 * person going there to change their name scrolled past their billing, and a
 * person going there about billing scrolled past everything else.
 *
 * Money is also the thing people arrive with a deadline about — a claim, a
 * renewal they did not expect — so it is the worst thing to bury two thirds of
 * the way down a settings page.
 *
 * INDIVIDUAL ONLY, because the other roles' money lives elsewhere and is a
 * different thing: a parent has Collab & Finance, a school admin has Invoices,
 * and a school is billed by agreement rather than by card. A tab here for them
 * would be a second, worse door to a room they already have.
 */
export default function Payments() {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const returned = params.get('session_id')
  const cancelled = params.get('cancelled')

  /* ------------------------------------------------------------------
     COMING BACK FROM STRIPE.
     ------------------------------------------------------------------
     Stripe sends people here after paying. The webhook is what makes the
     subscription real and does not care what the browser did — but it can
     arrive seconds later, and until it does this page would show the person
     who just paid the same "there is nothing to subscribe to" card they saw
     before. Asking the server to confirm the session closes that gap, exactly
     as the Academy does for a course.

     The parameter is cleared either way, so a refresh does not re-run it and a
     bookmarked URL does not confuse anybody a week later.
     ------------------------------------------------------------------ */
  useEffect(() => {
    if (!returned) return
    let active = true
    void (async () => {
      try {
        const started = await confirmSubscription(returned)
        if (!active) return
        await queryClient.invalidateQueries({
          queryKey: queryKeys.mySubscription,
        })
        showToast(
          started
            ? 'You are subscribed. Cancel whenever you like.'
            : 'That payment has not come through yet.',
          started ? 'success' : 'error',
        )
      } catch (err) {
        if (active) {
          showToast(
            err instanceof Error ? err.message : 'Could not confirm that.',
            'error',
          )
        }
      } finally {
        if (active) {
          const next = new URLSearchParams(params)
          next.delete('session_id')
          setParams(next, { replace: true })
        }
      }
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned])

  /* Somebody who pressed cancel at Stripe. Nothing happened, and saying so is
     kinder than silently returning them to an unchanged page. */
  useEffect(() => {
    if (!cancelled) return
    showToast('Nothing was charged.')
    const next = new URLSearchParams(params)
    next.delete('cancelled')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelled])

  const purchases = useQuery({
    queryKey: queryKeys.myPurchases,
    queryFn: fetchMyPurchases,
  })

  const paid = (purchases.data ?? []).filter((p) => p.status === 'paid')
  const total = paid.reduce((n, p) => n + p.amount_cents, 0)

  return (
    <div>
      <SubscriptionSection />

      {/* ------------------------------------------------------------------
          RECEIPTS ARE LINKED, NOT REPRINTED. The receipt screen exists, prints
          properly and carries the "this is not a tax invoice" wording that has
          to travel with the document. Rendering a second copy of that here
          would be two places to keep in step on the one subject where being
          out of step matters most.
          ------------------------------------------------------------------ */}
      <section className="mt-8 rounded-card border border-border bg-card p-6 shadow-raised">
        <div className="flex items-start gap-3">
          <Icon
            name="invoices"
            className="mt-0.5 h-5 w-5 shrink-0 text-primary"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground">Receipts</h2>

            {purchases.isPending && (
              <p className="mt-1 text-muted-foreground">Loading&hellip;</p>
            )}

            {purchases.isError && (
              <p className="mt-1 max-w-prose text-muted-foreground">
                What you have paid could not be loaded, so nothing is shown
                rather than shown wrongly.
              </p>
            )}

            {purchases.isSuccess && paid.length === 0 && (
              <p className="mt-1 max-w-prose text-muted-foreground">
                You have not paid for anything yet. When you do, a numbered
                receipt appears here that you can print or save as a PDF.
              </p>
            )}

            {purchases.isSuccess && paid.length > 0 && (
              <>
                <p className="mt-1 max-w-prose text-muted-foreground">
                  {paid.length} {paid.length === 1 ? 'receipt' : 'receipts'},{' '}
                  <b className="text-foreground">
                    {formatMoney(total, paid[0].currency)}
                  </b>{' '}
                  in total. Each one is numbered and printable, for a claim or a
                  return.
                </p>
                <Link
                  to="/individual/receipts"
                  className="mt-4 inline-block rounded-btn border border-border bg-background px-4 py-2.5 font-semibold text-foreground"
                >
                  See your receipts
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
