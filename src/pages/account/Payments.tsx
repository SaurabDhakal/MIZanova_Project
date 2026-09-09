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
 * WHAT IS LEFT ON IT, now that Subscription is its own sidebar screen:
 * receipts, and a pointer to that screen. The subscription controls moved out
 * rather than being copied, so there is one Subscribe button in the product.
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
     THE OLD RETURN ADDRESS, KEPT ON PURPOSE. `success_url` now points at
     /individual/subscription, which is where the Subscribe button lives — but
     a checkout session opened before that change still comes back here, and a
     person who has just paid should not land on a page that says nothing about
     it. Confirming the session makes the subscription real immediately rather
     than whenever the webhook arrives, so the sidebar page they go to next is
     already right.

     Nothing about this is wasted if it never fires again: it is the same call
     the new page makes, on the same session id.

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
      {/* ------------------------------------------------------------------
          THE SUBSCRIPTION IS NOT RENDERED HERE ANY MORE — IT IS A SCREEN.
          ------------------------------------------------------------------
          It is now `Subscription` in the sidebar, directly under Suggestions,
          because that is the only screen it changes and because a price
          reachable only from Settings is a price nobody finds.

          A LINK RATHER THAN A SECOND <SubscriptionSection>. The component
          would render perfectly well in both places, and that is the problem:
          two Subscribe buttons and two Cancel buttons, on two screens, one of
          which somebody is looking at while the other is stale. On the subject
          of money there is one place to press.

          The tab stays, and stays useful: receipts are what people come to a
          Payments tab for at tax time.
          ------------------------------------------------------------------ */}
      <section className="rounded-card border border-border bg-card p-6 shadow-raised">
        <div className="flex items-start gap-3">
          <Icon name="ai" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground">Subscription</h2>
            <p className="mt-1 max-w-prose text-muted-foreground">
              What it costs, what it changes and how to stop it are all on one
              page &mdash; <b className="text-foreground">Subscription</b> in
              the menu on the left.
            </p>
            <Link
              to="/individual/subscription"
              className="pressable mt-4 inline-block rounded-btn border border-border bg-background px-4 py-2.5 font-semibold text-foreground"
            >
              Go to your subscription
            </Link>
          </div>
        </div>
      </section>

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
                  className="pressable mt-4 inline-block rounded-btn border border-border bg-background px-4 py-2.5 font-semibold text-foreground"
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
