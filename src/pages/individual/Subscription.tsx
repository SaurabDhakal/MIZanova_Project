import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  confirmSubscription,
  fetchIndividualPlan,
  fetchMyAiTier,
  fetchMyPurchases,
  fetchMySubscription,
  formatMoney,
  queryKeys,
} from '../../lib/api'
import { showToast } from '../../lib/toast'
import PageHeader, { PageNote } from '../../components/PageHeader'
import SubscriptionSection from '../../components/SubscriptionSection'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import Icon from '../../components/Icon'

/**
 * The subscription, as a screen of its own — in the sidebar, under Suggestions.
 *
 * ---------------------------------------------------------------------------
 * WHY IT MOVED OUT OF SETTINGS
 * ---------------------------------------------------------------------------
 * It lived on Settings › Payments, which is where somebody goes once they have
 * already worked out that they pay for something. The people this role was
 * built for arrive the other way round: they meet the daily limit on
 * Suggestions, want to know what lifting it costs, and there was nothing in
 * the navigation with a price behind it. The home page carried a card and the
 * card linked into a settings tab, which is two hops through a part of the
 * product nobody browses for pleasure.
 *
 * Directly under Suggestions on purpose. The subscription changes exactly one
 * thing — which model answers there, and how often you may ask — so it sits
 * next to the screen it affects rather than at the bottom with the admin.
 *
 * ---------------------------------------------------------------------------
 * ONE SET OF CONTROLS, NOT TWO
 * ---------------------------------------------------------------------------
 * Everything that can be pressed here is <SubscriptionSection>, the same
 * component Settings › Payments used, rather than a second copy of the four
 * states and the two mutations. Payments now points at this page instead of
 * rendering its own, so there is one Subscribe button and one Cancel button in
 * the product. Two would eventually disagree, and the subject is money.
 *
 * This page adds only what a whole screen can carry that a section could not:
 * where the payment lands when Stripe sends somebody back, the awkward case
 * where they already have what is on sale, and the way through to receipts.
 */
export default function Subscription() {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const returned = params.get('session_id')
  const cancelled = params.get('cancelled')

  /* ------------------------------------------------------------------
     COMING BACK FROM STRIPE.
     ------------------------------------------------------------------
     `success_url` in server/index.js points here, because this is where the
     Subscribe button is. The webhook is what makes the subscription real and
     does not care what the browser did — but it can arrive seconds later, and
     until it does this page would show the person who has just paid the same
     offer they pressed. Asking the server to confirm the session closes that
     gap, exactly as the Academy does for a course.

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
        /* The tier is the thing they actually bought, and it is cached. Left
           alone, the note below would go on saying they are on the free model
           for as long as the query stayed fresh — on the one screen where the
           change has just been paid for. */
        await queryClient.invalidateQueries({ queryKey: queryKeys.myAiTier })
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

  /* The same two query keys <SubscriptionSection> uses, so this costs no extra
     requests — react-query hands both components the one result. They are read
     here because a SECTION may quietly render nothing when it does not know
     the answer, and a PAGE may not: an empty screen under a heading that says
     Subscription reads as broken. */
  const plan = useQuery({
    queryKey: queryKeys.individualPlan,
    queryFn: fetchIndividualPlan,
  })
  const mine = useQuery({
    queryKey: queryKeys.mySubscription,
    queryFn: fetchMySubscription,
  })
  /* Which tier they are ACTUALLY on. `my_ai_tier()` answers paid for a live
     subscription OR a course already bought (db/099, db/111), so this is the
     one question that can tell somebody they already have what is on sale. */
  const tier = useQuery({ queryKey: queryKeys.myAiTier, queryFn: fetchMyAiTier })
  const purchases = useQuery({
    queryKey: queryKeys.myPurchases,
    queryFn: fetchMyPurchases,
  })

  /* HOISTED, so every state below has a title on it. Returning early without
     one gives a slow connection a nameless page that then jumps when the
     heading arrives, and gives a failed one no name at all. */
  const header = (
    <PageHeader
      title="Subscription"
      lead="What it costs, what it changes, and how to stop it — nothing here is charged without you pressing something first."
    />
  )

  if (plan.isPending || mine.isPending) {
    return (
      <div>
        {header}
        <LoadingCards count={2} />
      </div>
    )
  }

  /* NOTHING RATHER THAN A GUESS — the same rule the section states. If either
     query failed we do not know whether there is a subscription or whether
     this person has one, and every sentence this page could fall back on
     ("there is nothing to subscribe to yet", "you are subscribed") would be a
     screen being confident about money it cannot see. */
  if (plan.isError || mine.isError) {
    return (
      <div>
        {header}
        <ErrorState
          message={(plan.error ?? mine.error)?.message ?? 'Could not load this.'}
          onRetry={() => {
            void plan.refetch()
            void mine.refetch()
          }}
        />
      </div>
    )
  }

  const sub = mine.data
  const live =
    sub && ['trialing', 'active', 'past_due'].includes(sub.status) ? sub : null

  const paid = (purchases.data ?? []).filter((p) => p.status === 'paid')
  const total = paid.reduce((n, p) => n + p.amount_cents, 0)

  return (
    <div>
      {header}

      {/* The four states and both buttons. One component, used here and named
          by Settings › Payments — see the note at the top of this file. */}
      <SubscriptionSection />

      {/* ------------------------------------------------------------------
          YOU ALREADY HAVE THIS.
          ------------------------------------------------------------------
          Buying a single course grants the capable model permanently, so it
          overlaps the subscription almost entirely. Somebody in that position
          who is standing on a page headed "Subscription", reading a price and
          a Subscribe button, is being invited to pay twice for one thing.

          Saying so costs Special Miles a sale it should not have made, and it
          is the same honesty the home page already practises. Only shown when
          there is no live subscription — for a subscriber this fact IS their
          subscription, and the section above has already said it.
          ------------------------------------------------------------------ */}
      {!live && tier.data === 'paid' && (
        <section className="mt-8 rounded-card border border-primary bg-primary-subtle p-6">
          <div className="flex items-start gap-3">
            <Icon name="tick" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-foreground">
                You are already on the capable model
              </h2>
              <p className="mt-1 max-w-prose text-muted-foreground">
                Because you have bought a course, your suggestions are already
                answered by the more capable model and you can already ask more
                times a day. A subscription would give you the same thing, so
                there is nothing you need to pay for today.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------
          WHAT YOU HAVE PAID FOR.
          ------------------------------------------------------------------
          A link, not a second list. The receipts screen is numbered, printable
          and carries the "this is not a tax invoice" wording that has to
          travel with the document — reprinting any of it here would be two
          places to keep in step on the one subject where being out of step
          matters most.

          It belongs on this page rather than only in settings because "what
          have I paid you" is the question people ask immediately after "what
          am I paying you", and at tax time it is the only reason they came.
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

      <PageNote>
        This page is the whole of what MiZanova charges you for: one
        subscription, and any course you have chosen to buy. Payment is taken
        by Stripe and the card details never reach MiZanova &mdash; cancelling
        here tells Stripe not to renew, and your account keeps working until
        the period you have already paid for runs out. Nothing on this page can
        charge you without you pressing something first, and if there is no
        price on it that is because Special Miles has not set one, not because
        it failed to load. The free account is not a trial: goals, courses, the
        library and asking a specialist for a session stay free whatever this
        page says.
      </PageNote>
    </div>
  )
}
