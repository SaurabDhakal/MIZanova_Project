import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchIndividualPlan,
  fetchMySubscription,
  formatMoney,
  queryKeys,
  setSubscriptionRenewal,
  startSubscription,
} from '../lib/api'
import { showToast } from '../lib/toast'
import Icon from './Icon'

/**
 * Your subscription, on the account page — db/111.
 *
 * ---------------------------------------------------------------------------
 * FOUR STATES, AND ONLY ONE OF THEM IS THE ORDINARY ONE
 * ---------------------------------------------------------------------------
 *   nothing on sale   Special Miles has not set a price. Says so, offers
 *                     nothing, and does NOT render a disabled button — a
 *                     control you cannot press is a worse answer than a
 *                     sentence explaining why there is nothing to press.
 *   on sale, not you  What it costs and what it changes. One button.
 *   subscribed        When it renews, what it costs, and how to stop.
 *   cancelling        Still working, with the date it stops and a way back.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PROMISES IS WHAT db/099 ACTUALLY DOES
 * ---------------------------------------------------------------------------
 * Not "premium features". Subscribing moves `my_ai_tier()` to paid, which
 * changes two specific things — which model answers, and how many times a day
 * you may ask. Those are the things this says, because they are the things
 * that happen. A benefits list with anything else on it would be the fault
 * this codebase keeps finding: a promise printed with nothing behind it.
 */
export default function SubscriptionSection() {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const plan = useQuery({
    queryKey: queryKeys.individualPlan,
    queryFn: fetchIndividualPlan,
  })
  const mine = useQuery({
    queryKey: queryKeys.mySubscription,
    queryFn: fetchMySubscription,
  })

  const subscribe = useMutation({
    mutationFn: startSubscription,
    onSuccess: (url) => {
      window.location.href = url
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const renewal = useMutation({
    mutationFn: setSubscriptionRenewal,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: queryKeys.mySubscription })
      showToast(
        r.cancelAtPeriodEnd
          ? 'Your subscription will not renew.'
          : 'Your subscription will renew as normal.',
        'success',
      )
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  if (plan.isPending || mine.isPending) return null

  /* NOTHING RATHER THAN A GUESS. If either query failed we do not know whether
     there is a subscription or whether this person has one, and the fallback
     below reads "there is nothing to subscribe to yet" — which would be this
     screen stating a fact it does not have, confidently, about money. An
     absent section is recoverable; a wrong one is not. */
  if (plan.isError || mine.isError) return null

  const sub = mine.data
  const live =
    sub && ['trialing', 'active', 'past_due'].includes(sub.status) ? sub : null

  const date = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null

  const every = (n: 'month' | 'year') => (n === 'year' ? 'a year' : 'a month')

  return (
    <section className="mt-8 rounded-card border border-border bg-card p-6 shadow-raised">
      <div className="flex items-start gap-3">
        <Icon
          name="ai"
          className="mt-0.5 h-5 w-5 shrink-0 text-primary"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-foreground">Subscription</h2>

          {/* ------------------------------------------------------------
              STATE 1 — nothing is on sale. This is what shipped.
              ------------------------------------------------------------ */}
          {!live && !plan.data?.is_offered && (
            <>
              <p className="mt-1 max-w-prose text-muted-foreground">
                There is nothing to subscribe to yet. Special Miles has not set
                a price, and MiZanova will not print one nobody has agreed to.
              </p>
              <p className="mt-3 max-w-prose text-sm text-muted-foreground">
                Your account is free and stays free. Everything you can reach
                today keeps working, and if a subscription is offered later it
                appears here with the price on it before anything is charged.
              </p>
            </>
          )}

          {/* ------------------------------------------------------------
              STATE 2 — on sale, and you are not on it.
              ------------------------------------------------------------ */}
          {!live && plan.data?.is_offered && plan.data.price_cents !== null && (
            <>
              <p className="mt-1 max-w-prose text-muted-foreground">
                {plan.data.name} &mdash;{' '}
                <b className="text-foreground">
                  {formatMoney(plan.data.price_cents, plan.data.currency)}
                </b>{' '}
                {every(plan.data.bill_every)}
                {plan.data.trial_days
                  ? `, free for the first ${plan.data.trial_days} days`
                  : ''}
                .
              </p>

              <ul className="mt-4 space-y-2 text-sm text-foreground">
                <li className="flex gap-2">
                  <Icon
                    name="ai"
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  />
                  <span>
                    Suggestions are answered by the more capable model, which
                    is the one that does not give up on the hard questions.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Icon
                    name="goals"
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  />
                  <span>
                    You can ask more times a day. The free account has a daily
                    limit so one person cannot use up the day for everybody.
                  </span>
                </li>
              </ul>

              <p className="mt-3 max-w-prose text-sm text-muted-foreground">
                Everything else &mdash; courses, the library, goals, asking a
                specialist for a session &mdash; is the same either way, and
                stays free. Cancel whenever you like; you keep what you have
                paid for until the {plan.data.bill_every} runs out.
              </p>

              <button
                type="button"
                onClick={() => subscribe.mutate()}
                disabled={subscribe.isPending}
                className="pressable min-h-11 mt-4 inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
              >
                {subscribe.isPending
                  ? 'Opening the payment page…'
                  : plan.data.trial_days
                    ? 'Start the free trial'
                    : 'Subscribe'}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                Payment is taken by Stripe. MiZanova never sees your card.
              </p>
            </>
          )}

          {/* ------------------------------------------------------------
              STATES 3 AND 4 — subscribed, and possibly cancelling.
              ------------------------------------------------------------ */}
          {live && (
            <>
              <p className="mt-1 max-w-prose text-muted-foreground">
                {formatMoney(live.amount_cents, live.currency)}{' '}
                {every(live.bill_every)}.{' '}
                {live.status === 'trialing' && live.trial_ends_at ? (
                  <>
                    You are on a free trial until{' '}
                    <b className="text-foreground">{date(live.trial_ends_at)}</b>
                    , and nothing is charged before then.
                  </>
                ) : live.status === 'past_due' ? (
                  <>
                    A renewal payment did not go through &mdash; usually an
                    expired card. Your account is still working while Stripe
                    tries again, and they will email you.
                  </>
                ) : live.cancel_at_period_end ? (
                  <>
                    This stops on{' '}
                    <b className="text-foreground">
                      {date(live.current_period_end)}
                    </b>
                    . Until then nothing changes.
                  </>
                ) : (
                  <>
                    Renews on{' '}
                    <b className="text-foreground">
                      {date(live.current_period_end)}
                    </b>
                    .
                  </>
                )}
              </p>

              {live.cancel_at_period_end ? (
                <button
                  type="button"
                  onClick={() => renewal.mutate(true)}
                  disabled={renewal.isPending}
                  className="pressable min-h-11 mt-4 inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
                >
                  Keep it running
                </button>
              ) : (
                /* DELIBERATELY NOT ConfirmDestructive. That component is the
                   type-the-phrase dialog used for closing an account, and it
                   is right there because closing an account destroys data with
                   no undo. This does neither: access continues to the date
                   shown, nothing is deleted, and the very next render offers
                   "Keep it running". Borrowing the heavy guard would tell
                   somebody this is as serious as deleting themselves.

                   One step of confirmation, inline, because a mis-click on
                   billing is still worth catching. */
                <div className="mt-4">
                  {confirming ? (
                    <div className="rounded-card border border-border bg-background p-4">
                      <p className="max-w-prose text-sm text-foreground">
                        Your account keeps working until{' '}
                        <b>{date(live.current_period_end) ?? 'the period ends'}</b>{' '}
                        and nothing more is charged after that. You can start it
                        again any time before then.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirming(false)
                            renewal.mutate(false)
                          }}
                          disabled={renewal.isPending}
                          className="pressable min-h-11 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          Stop renewing
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(false)}
                          className="pressable min-h-11 rounded-btn border border-border bg-card px-4 py-2.5 font-semibold text-foreground"
                        >
                          Keep it
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      disabled={renewal.isPending}
                      className="pressable min-h-11 inline-flex items-center gap-2 rounded-btn border border-border bg-background px-4 py-2.5 font-semibold text-foreground disabled:opacity-60"
                    >
                      Cancel subscription
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
