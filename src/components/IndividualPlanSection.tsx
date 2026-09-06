import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchIndividualPlanAdmin,
  formatMoney,
  queryKeys,
  updateIndividualPlan,
} from '../lib/api'
import { showToast } from '../lib/toast'

/**
 * What an individual pays Special Miles — db/111, on the Subscriptions screen.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN AI GOVERNANCE
 * ---------------------------------------------------------------------------
 * The only thing subscribing changes is which model answers somebody and how
 * many times a day they may ask, which makes AI Governance look like the
 * obvious home. It is not: that screen is about spend and safety, and this is
 * a price. Subscriptions already answers "what does this customer pay us" for
 * every school, and an individual is the other customer.
 *
 * ---------------------------------------------------------------------------
 * IT EXISTS BECAUSE THE ALTERNATIVE WAS AN UPDATE STATEMENT
 * ---------------------------------------------------------------------------
 * db/111 shipped the plan with no price and no way to set one except SQL,
 * written out in a comment at the bottom of the migration. That is fine for a
 * developer and no use at all to the person whose decision it actually is —
 * and a commercial decision that requires a database client to enact is one
 * that will not get made.
 *
 * NOTHING GOES ON SALE BY ACCIDENT. The database refuses `is_offered` without
 * both a price and a Stripe price id, so this form asks for all three together
 * and says what the switch does before it is flipped.
 */
export default function IndividualPlanSection() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState('')
  const [every, setEvery] = useState<'month' | 'year'>('month')
  const [trial, setTrial] = useState('')
  const [priceId, setPriceId] = useState('')
  const [offered, setOffered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = useQuery({
    queryKey: queryKeys.individualPlanAdmin,
    queryFn: fetchIndividualPlanAdmin,
  })

  /* ------------------------------------------------------------------
     "$12" BECAME NULL AND THE SCREEN BLAMED THE USER.
     ------------------------------------------------------------------
     This read `Math.round(Number(price) * 100)` with no check. `Number('$12')`
     is NaN, `Math.round(NaN * 100)` is NaN, and JSON.stringify turns NaN into
     null on the way to PostgREST — so a price that had been typed arrived as
     no price at all, the check constraint refused the row, and the error said
     a price was required. Somebody who had just entered one was told to enter
     one.

     A dollar sign and stray spaces are what people actually type, so those are
     accepted. A comma is NOT guessed at: "12,00" means twelve in half of
     Europe and twelve hundred elsewhere, and inventing an answer about money
     is worse than asking.
     ------------------------------------------------------------------ */
  const parsedPrice = (): number | null | 'bad' => {
    const raw = price.trim().replace(/^\$/, '').trim()
    if (raw === '') return null
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return 'bad'
    const cents = Math.round(Number(raw) * 100)
    return cents > 0 ? cents : 'bad'
  }

  const parsedTrial = (): number | null | 'bad' => {
    const raw = trial.trim()
    if (raw === '') return null
    if (!/^\d{1,2}$/.test(raw)) return 'bad'
    const days = Number(raw)
    return days >= 1 && days <= 90 ? days : 'bad'
  }

  const save = useMutation({
    mutationFn: () =>
      updateIndividualPlan({
        priceCents: parsedPrice() as number | null,
        billEvery: every,
        trialDays: parsedTrial() as number | null,
        stripePriceId: priceId.trim() === '' ? null : priceId.trim(),
        isOffered: offered,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.individualPlanAdmin,
      })
      await queryClient.invalidateQueries({ queryKey: queryKeys.individualPlan })
      setEditing(false)
      setError(null)
      showToast('The individual plan has been changed.')
    },
    onError: (e: Error) => setError(e.message),
  })

  const p = plan.data

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        What an individual pays
      </h2>

      <div className="rounded-card border border-border bg-card p-5 shadow-raised">
        {plan.isPending && (
          <p className="text-sm text-muted-foreground">Loading&hellip;</p>
        )}

        {plan.isError && (
          <p className="text-sm text-danger-foreground">
            The individual plan could not be read. {plan.error.message}
          </p>
        )}

        {plan.isSuccess && !editing && (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-sm text-foreground">
              {p?.is_offered && p.price_cents !== null ? (
                <>
                  <p>
                    <span className="font-semibold">
                      {formatMoney(p.price_cents, p.currency)}
                    </span>{' '}
                    per {p.bill_every}
                    {p.trial_days
                      ? `, free for the first ${p.trial_days} days`
                      : ', with no trial'}
                    .
                  </p>
                  <p className="mt-1 text-success-foreground">
                    On sale. It appears on the pricing page and an individual
                    can subscribe from their own Payments tab.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Not on sale.</p>
                  <p className="mt-1 max-w-prose text-muted-foreground">
                    {p?.price_cents === null
                      ? 'No price has been set, so the pricing page says there is not a subscription yet and nothing can be bought.'
                      : 'A price is set but the plan is switched off, so nothing is being sold.'}
                  </p>
                </>
              )}
              {/* The Stripe id is shown, never the key. Without it the checkout
                  has no recurring Price to charge against and the database
                  refuses to mark the plan on sale at all. */}
              <p className="mt-2 text-xs text-muted-foreground">
                Stripe price:{' '}
                {p?.stripe_price_id ? (
                  <code className="text-foreground">{p.stripe_price_id}</code>
                ) : (
                  'not set'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPrice(p?.price_cents != null ? String(p.price_cents / 100) : '')
                setEvery(p?.bill_every ?? 'month')
                setTrial(p?.trial_days != null ? String(p.trial_days) : '')
                setPriceId(p?.stripe_price_id ?? '')
                setOffered(Boolean(p?.is_offered))
                setEditing(true)
              }}
              className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
            >
              {p?.is_offered ? 'Change it' : 'Set a price'}
            </button>
          </div>
        )}

        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              /* Checked here rather than left to the database, because the
                 database's complaint is about a null it was handed and cannot
                 say the price was unreadable. */
              if (parsedPrice() === 'bad') {
                return setError(
                  'That is not a price. Enter it in dollars, like 12 or 12.50. A dollar sign is fine; a comma is not.',
                )
              }
              if (parsedTrial() === 'bad') {
                return setError(
                  'A trial is a whole number of days, from 1 to 90. Leave it empty for no trial.',
                )
              }
              if (offered && parsedPrice() === null) {
                return setError(
                  'A plan cannot go on sale with no price. Enter one, or leave it switched off.',
                )
              }
              if (offered && priceId.trim() === '') {
                return setError(
                  'A plan cannot go on sale without a Stripe price id, because there would be nothing to charge against.',
                )
              }
              setError(null)
              save.mutate()
            }}
          >
            {error && (
              <p
                role="alert"
                className="mb-3 rounded-btn border border-danger bg-danger-subtle p-2.5 text-sm text-danger-foreground"
              >
                {error}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="plan-price"
                  className="block text-sm font-medium text-foreground"
                >
                  Price, in dollars
                </label>
                <input
                  id="plan-price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="12.00"
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Leave empty for no price. Empty is not zero.
                </p>
              </div>
              <div>
                <label
                  htmlFor="plan-every"
                  className="block text-sm font-medium text-foreground"
                >
                  Charged every
                </label>
                <select
                  id="plan-every"
                  value={every}
                  onChange={(e) => setEvery(e.target.value as 'month' | 'year')}
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                >
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="plan-trial"
                  className="block text-sm font-medium text-foreground"
                >
                  Free trial, in days
                </label>
                <input
                  id="plan-trial"
                  value={trial}
                  onChange={(e) => setTrial(e.target.value)}
                  inputMode="numeric"
                  placeholder="14"
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Empty means no trial, and every page says so plainly. Stripe
                  keeps the clock.
                </p>
              </div>
              <div>
                <label
                  htmlFor="plan-price-id"
                  className="block text-sm font-medium text-foreground"
                >
                  Stripe price id
                </label>
                <input
                  id="plan-price-id"
                  value={priceId}
                  onChange={(e) => setPriceId(e.target.value)}
                  placeholder="price_1Abc…"
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 font-mono text-sm text-foreground"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  From a RECURRING price in your Stripe dashboard, not a
                  one-off.
                </p>
              </div>
            </div>

            <label className="mt-4 flex items-start gap-3 rounded-card border border-border bg-background p-3">
              <input
                type="checkbox"
                checked={offered}
                onChange={(e) => setOffered(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span className="text-sm">
                <span className="font-semibold text-foreground">
                  Put it on sale
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  It appears on the public pricing page with the figure on it,
                  and individuals can subscribe. The database refuses this
                  without both a price and a Stripe price id.
                </span>
              </span>
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={save.isPending}
                className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {save.isPending ? 'Saving…' : 'Save the plan'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setError(null)
                }}
                className="rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
