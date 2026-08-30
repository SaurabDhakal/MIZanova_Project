import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  agreeSubscription,
  endSubscription,
  fetchPlatformInvoices,
  fetchPlatformRevenueTotals,
  fetchSchools,
  fetchSubscriptions,
  formatMoney,
  issuePlatformInvoice,
  queryKeys,
  raisePlatformInvoice,
  voidPlatformInvoice,
  type BillingPeriod,
  type PlatformSubscription,
  type SchoolRow,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import PageHeader, { PageNote } from '../../components/PageHeader'
import SchoolBadge from '../../components/SchoolBadge'
import { findPublishedPlan, PUBLISHED_PLANS } from '../../lib/plans'
import { showToast } from '../../lib/toast'

/**
 * What each school pays Special Miles — db/072.
 *
 * ---------------------------------------------------------------------------
 * A SEPARATE SCREEN FROM BILLING & REVENUE, DELIBERATELY
 * ---------------------------------------------------------------------------
 * There are two kinds of money in this business and only one of them was ever
 * in the product. Billing & Revenue shows a SCHOOL billing a FAMILY for a named
 * child — `invoices.student_id` is not null, so it cannot hold anything else.
 * Special Miles' own income lived nowhere.
 *
 * The two are not tabs on one page. Saurab read the Billing screen and asked
 * how Special Miles invoices a school, which is exactly the confusion a single
 * combined screen would make permanent: two piles of money, different payers,
 * and a total that means nothing if anybody adds them up. Two screens, each
 * saying whose money it is.
 *
 * ---------------------------------------------------------------------------
 * NO PRICES ARE BUILT IN, AND THAT IS THE BRIEF'S OWN POSITION
 * ---------------------------------------------------------------------------
 * Joe Abboud's document says pricing is still being researched with Practera —
 * "willingness to pay, pricing strategies, and market segmentation" — and
 * describes the commercial model only as tiers by customer group with
 * "group packages, institutional subscriptions, and subsidised access models".
 * Segments and shapes, no numbers.
 *
 * So a person types what a school actually agreed, and the plan is a label
 * rather than a value from a list. Inventing a rate card here would put a made
 * up figure on a real invoice, and this product has already been bitten once by
 * a placeholder rendered as a real claim.
 */

const PERIODS: { value: BillingPeriod; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  // Australian schools budget in terms, and a vendor that can only bill monthly
  // or yearly straddles their cycle.
  { value: 'termly', label: 'Per term' },
  { value: 'annual', label: 'Per year' },
]

const PERIOD_SUFFIX: Record<BillingPeriod, string> = {
  monthly: '/month',
  termly: '/term',
  annual: '/year',
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-background text-muted-foreground',
  open: 'bg-warning-subtle text-warning-foreground',
  paid: 'bg-success-subtle text-success-foreground',
  void: 'bg-background text-muted-foreground line-through',
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/* ---------------------------------------------------------------------------
 * Agreeing a rate
 * ------------------------------------------------------------------------ */

function AgreementForm({
  school,
  current,
  onDone,
}: {
  school: SchoolRow
  current: PlatformSubscription | undefined
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [planLabel, setPlanLabel] = useState(current?.plan_label ?? '')
  // Dollars in the field, cents in the database. Typing 240000 when you mean
  // $2,400 is the mistake this avoids.
  const [rate, setRate] = useState(
    current ? String(current.rate_cents / 100) : '',
  )
  const [period, setPeriod] = useState<BillingPeriod>(current?.period ?? 'annual')
  const [note, setNote] = useState(current?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      agreeSubscription({
        schoolId: school.id,
        planLabel,
        rateCents: Math.round(Number(rate) * 100),
        period,
        note: note || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions })
      showToast(`Agreement recorded for ${school.name}.`)
      onDone()
    },
    onError: (e) => setError(e.message),
  })

  const rateNumber = Number(rate)
  const rateValid = rate.trim() !== '' && Number.isFinite(rateNumber) && rateNumber >= 0

  /*
   * WHAT THE COMPANY ADVERTISES FOR THIS PLAN, if the label names one.
   *
   * The first agreement recorded on this screen read "Mid-size schools —
   * $2,400 per year". Mid-size is published at $5,800 per TERM, and $2,400 per
   * term is SMALL schools: wrong plan, wrong period, wrong amount, and nothing
   * here could tell because the form had never been shown the price list.
   *
   * It COMPARES, it does not constrain. A pilot, a discount and whatever the
   * pricing research changes are all legitimate — the screen only says when the
   * number differs from the page a customer can read.
   */
  const published = findPublishedPlan(planLabel)
  const publishedCents =
    published === undefined
      ? null
      : period === 'annual'
        ? published.annualCents
        : period === 'termly'
          ? published.termCents
          : null
  const differsFromPublished =
    publishedCents !== null &&
    rateValid &&
    Math.round(rateNumber * 100) !== publishedCents

  return (
    <form
      className="mt-3 rounded-card border border-border bg-background/60 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (planLabel.trim() === '') return setError('Give the plan a name.')
        if (!rateValid) return setError('Enter what they agreed to pay.')
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label
            htmlFor={`plan-${school.id}`}
            className="block text-sm font-medium text-foreground"
          >
            Plan, as it was sold
          </label>
          <input
            id={`plan-${school.id}`}
            value={planLabel}
            onChange={(e) => setPlanLabel(e.target.value)}
            placeholder="Mid-size schools"
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          />
          {/* Free text rather than a dropdown, and the reason is worth saying
              on screen: the five names on the enquiry form do not match the
              five customer groups in the brief, and neither list is settled. */}
          <p className="mt-1 text-xs text-muted-foreground">
            Whatever they were told they were buying.
          </p>
          {/* The published plans, one click away. Typing the name by hand is
              what produced a label that matched no plan at all. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PUBLISHED_PLANS.filter((p) => p.termCents !== null).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setPlanLabel(p.name)
                  setPeriod('termly')
                  setRate(String((p.termCents ?? 0) / 100))
                }}
                className="rounded-btn border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor={`rate-${school.id}`}
            className="block text-sm font-medium text-foreground"
          >
            They pay
          </label>
          <div className="mt-1 flex items-center gap-1">
            <span className="text-muted-foreground">$</span>
            <input
              id={`rate-${school.id}`}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              placeholder="2400"
              className="w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            />
          </div>
          {/* Zero is a real agreement — the brief names "subsidised access
              models", and a pilot at no charge is a decision somebody made
              rather than a field left blank. */}
          {rate.trim() === '0' && (
            <p className="mt-1 text-xs text-muted-foreground">
              Free. Say why in the note.
            </p>
          )}
          {/* Not an error, and not blocking. A rate below the advertised one is
              most of what a sales conversation produces. */}
          {differsFromPublished && publishedCents !== null && (
            <p className="mt-1 text-xs text-warning-foreground">
              Advertised at ${(publishedCents / 100).toLocaleString('en-AU')}{' '}
              {period === 'annual' ? 'a year' : 'a term'}. Say why in the note if
              this is different on purpose.
            </p>
          )}
          {published && publishedCents === null && period === 'monthly' && (
            <p className="mt-1 text-xs text-muted-foreground">
              {published.name} has no published monthly rate.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor={`period-${school.id}`}
            className="block text-sm font-medium text-foreground"
          >
            Billed
          </label>
          <select
            id={`period-${school.id}`}
            value={period}
            onChange={(e) => setPeriod(e.target.value as BillingPeriod)}
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor={`note-${school.id}`}
            className="block text-sm font-medium text-foreground"
          >
            Why this rate
          </label>
          <input
            id={`note-${school.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Pilot school, first year at no charge"
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : current ? 'Change the agreement' : 'Record it'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
        >
          Cancel
        </button>
        {current && (
          <p className="text-xs text-muted-foreground">
            The current agreement is ended and kept, not overwritten.
          </p>
        )}
      </div>
    </form>
  )
}

/* ---------------------------------------------------------------------------
 * Raising a charge
 * ------------------------------------------------------------------------ */

function RaiseInvoiceForm({
  school,
  subscription,
  onDone,
}: {
  school: SchoolRow
  subscription: PlatformSubscription
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [periodStart, setPeriodStart] = useState(today)
  const [periodEnd, setPeriodEnd] = useState(today)
  const [description, setDescription] = useState(
    `${subscription.plan_label} — platform access`,
  )
  const [amount, setAmount] = useState(String(subscription.rate_cents / 100))
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const raise = useMutation({
    mutationFn: () =>
      raisePlatformInvoice({
        schoolId: school.id,
        subscriptionId: subscription.id,
        periodStart,
        periodEnd,
        description,
        amountCents: Math.round(Number(amount) * 100),
        currency: subscription.currency,
        dueDate: dueDate || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.platformInvoices })
      await queryClient.invalidateQueries({ queryKey: queryKeys.platformRevenue })
      showToast('Raised as a draft. Issue it when you are ready.')
      onDone()
    },
    onError: (e) => setError(e.message),
  })

  return (
    <form
      className="mt-3 rounded-card border border-border bg-background/60 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (periodEnd < periodStart)
          return setError('The period ends before it starts.')
        if (description.trim() === '') return setError('Say what it is for.')
        setError(null)
        raise.mutate()
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
          <label className="block text-sm font-medium text-foreground" htmlFor={`ps-${school.id}`}>
            Period from
          </label>
          <input
            id={`ps-${school.id}`}
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground" htmlFor={`pe-${school.id}`}>
            to
          </label>
          <input
            id={`pe-${school.id}`}
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-sm font-medium text-foreground" htmlFor={`d-${school.id}`}>
          What it is for
        </label>
        <input
          id={`d-${school.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground" htmlFor={`a-${school.id}`}>
            Amount
          </label>
          <div className="mt-1 flex items-center gap-1">
            <span className="text-muted-foreground">$</span>
            <input
              id={`a-${school.id}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground" htmlFor={`dd-${school.id}`}>
            Due
          </label>
          <input
            id={`dd-${school.id}`}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
          />
          {/* db/071's lesson, applied at the point the gap is created rather
              than reported afterwards: an invoice with no due date can never
              become overdue, so it disappears from every chase. */}
          {dueDate === '' && (
            <p className="mt-1 text-xs text-warning-foreground">
              With no due date it can never show as overdue.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={raise.isPending}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {raise.isPending ? 'Raising…' : 'Raise as draft'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

/* ---------------------------------------------------------------------------
 * The screen
 * ------------------------------------------------------------------------ */

export default function Subscriptions() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [raising, setRaising] = useState<string | null>(null)

  const schools = useQuery({ queryKey: queryKeys.schools, queryFn: fetchSchools })
  const subs = useQuery({
    queryKey: queryKeys.subscriptions,
    queryFn: fetchSubscriptions,
  })
  const invoices = useQuery({
    queryKey: queryKeys.platformInvoices,
    queryFn: fetchPlatformInvoices,
  })
  const totals = useQuery({
    queryKey: queryKeys.platformRevenue,
    queryFn: fetchPlatformRevenueTotals,
  })

  const issue = useMutation({
    mutationFn: issuePlatformInvoice,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.platformInvoices })
      await queryClient.invalidateQueries({ queryKey: queryKeys.platformRevenue })
      showToast('Issued. The school can see it now.')
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  const voidIt = useMutation({
    mutationFn: voidPlatformInvoice,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.platformInvoices })
      await queryClient.invalidateQueries({ queryKey: queryKeys.platformRevenue })
      showToast('Voided. The row is kept.')
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  const end = useMutation({
    mutationFn: endSubscription,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions })
      showToast('Agreement ended. What they used to pay is kept.')
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  if (schools.isPending || subs.isPending) return <LoadingCards count={3} />
  if (schools.isError) return <ErrorState message={schools.error.message} />
  if (subs.isError) return <ErrorState message={subs.error.message} />

  const liveFor = (schoolId: string) =>
    subs.data.find((s) => s.school_id === schoolId && s.ends_on === null)

  /*
   * Summed here rather than in the browser over a paginated list — the view
   * does the arithmetic, for the reason db/061 records: PostgREST caps at 1000
   * rows, so a total added up client-side silently stops growing.
   */
  const sums = (totals.data ?? []).reduce(
    (acc, r) => ({
      collected: acc.collected + r.collected_cents,
      outstanding: acc.outstanding + r.outstanding_cents,
      overdue: acc.overdue + r.overdue_cents,
    }),
    { collected: 0, outstanding: 0, overdue: 0 },
  )

  const schoolName = (id: string) =>
    schools.data.find((s) => s.id === id)?.name ?? 'A school'

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        lead="What each school pays Special Miles to use the platform."
      />

      {/*
        THE SENTENCE THAT STOPS THE TWO KINDS OF MONEY BEING CONFUSED. It is
        the first thing on the screen because the confusion is the default:
        both screens say "invoice" and only one of them is our income.
      */}
      <p className="mb-5 rounded-card border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
        <strong className="font-semibold text-foreground">
          This is our money.
        </strong>{' '}
        Billing &amp; Revenue is the other kind — a school invoicing a family for
        a named child. Nothing on the two screens should ever be added together.
      </p>

      {/*
        THE SAME MARKUP AS BILLING & REVENUE, on purpose. StatTile takes a
        number so its value can never be a formatted string — a deliberate
        constraint, and the wrong one for money, which needs a currency symbol
        and grouping. Billing solved this with its own card; using a different
        shape here would make two screens about money look like two products.
      */}
      <div className="mb-6 grid gap-5 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Collected
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {totals.isSuccess ? formatMoney(sums.collected) : '—'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {totals.isError
              ? 'Could not be counted — this is unknown, not zero.'
              : 'Confirmed received.'}
          </p>
        </div>

        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Outstanding
          </p>
          <p className="mt-2 text-4xl font-bold text-foreground">
            {totals.isSuccess ? formatMoney(sums.outstanding) : '—'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {totals.isError
              ? 'Could not be counted — this is unknown, not zero.'
              : 'Issued and unpaid.'}
          </p>
        </div>

        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Past due date
          </p>
          <p
            className={`mt-2 text-4xl font-bold ${
              totals.isSuccess && sums.overdue > 0
                ? 'text-danger-foreground'
                : 'text-foreground'
            }`}
          >
            {totals.isSuccess ? formatMoney(sums.overdue) : '—'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {totals.isError
              ? 'Could not be counted — this is unknown, not zero.'
              : 'Part of outstanding, not on top of it.'}
          </p>
        </div>
      </div>

      {/* --- Agreements ---------------------------------------------------- */}
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        What each school has agreed
      </h2>

      {schools.data.length === 0 ? (
        <EmptyState
          title="No schools yet"
          detail="An agreement belongs to a school, so add one first."
        />
      ) : (
        <ul className="space-y-3">
          {schools.data.map((school) => {
            const live = liveFor(school.id)
            return (
              <li
                key={school.id}
                className="rounded-card border border-border bg-card shadow-raised p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <SchoolBadge id={school.id} name={school.name} size="sm" />
                    <div>
                      <p className="font-semibold text-foreground">{school.name}</p>
                      {live ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {live.plan_label}
                          </span>{' '}
                          —{' '}
                          <span className="font-medium text-foreground">
                            {live.rate_cents === 0
                              ? 'Free'
                              : `${formatMoney(live.rate_cents, live.currency)}${PERIOD_SUFFIX[live.period]}`}
                          </span>
                          , since {day(live.starts_on)}
                        </p>
                      ) : (
                        /* Not styled as an error. A school on no agreement is
                           usually mid-negotiation, not a fault. */
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          No agreement recorded — nothing is being billed.
                        </p>
                      )}
                      {live?.note && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {live.note}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditing(editing === school.id ? null : school.id)
                      }
                      className="rounded-btn bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      {live ? 'Change' : 'Agree a rate'}
                    </button>
                    {live && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setRaising(raising === school.id ? null : school.id)
                          }
                          className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
                        >
                          Raise invoice
                        </button>
                        <button
                          type="button"
                          disabled={end.isPending}
                          onClick={() => end.mutate(live.id)}
                          className="rounded-btn border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
                        >
                          End
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editing === school.id && (
                  <AgreementForm
                    key={live?.id ?? 'new'}
                    school={school}
                    current={live}
                    onDone={() => setEditing(null)}
                  />
                )}
                {raising === school.id && live && (
                  <RaiseInvoiceForm
                    school={school}
                    subscription={live}
                    onDone={() => setRaising(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* --- Invoices ------------------------------------------------------ */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        What we have billed
      </h2>

      {invoices.isPending ? (
        <LoadingCards count={2} />
      ) : invoices.isError ? (
        <ErrorState message={invoices.error.message} />
      ) : invoices.data.length === 0 ? (
        <EmptyState
          title="Nothing billed yet"
          detail="Raise one against a school's agreement above. It arrives as a draft, which the school cannot see."
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card shadow-raised">
          <table className="w-full min-w-[56rem] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
            </colgroup>
            <caption className="sr-only">
              Invoices Special Miles has raised against schools
            </caption>
            <thead className="border-b border-border bg-background/60">
              <tr className="text-xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-4 py-3 font-semibold">School</th>
                <th scope="col" className="px-4 py-3 font-semibold">Period</th>
                <th scope="col" className="px-4 py-3 font-semibold">For</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Amount</th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.data.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 align-top break-words font-medium text-foreground">
                    {schoolName(inv.school_id)}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {day(inv.period_start)} – {day(inv.period_end)}
                    {inv.due_date ? (
                      <span className="block text-xs">due {day(inv.due_date)}</span>
                    ) : (
                      inv.status === 'open' && (
                        <span className="block text-xs text-warning-foreground">
                          no due date
                        </span>
                      )
                    )}
                  </td>
                  <td className="px-4 py-3 align-top break-words text-muted-foreground">
                    {inv.description}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-block rounded-btn px-2 py-1 text-xs font-semibold ${STATUS_STYLE[inv.status]}`}
                    >
                      {inv.status === 'open' ? 'Issued' : inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums text-foreground">
                    {formatMoney(inv.amount_cents, inv.currency)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {inv.status === 'draft' && (
                        <button
                          type="button"
                          disabled={issue.isPending}
                          onClick={() => issue.mutate(inv.id)}
                          className="rounded-btn bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          Issue
                        </button>
                      )}
                      {inv.status !== 'paid' && inv.status !== 'void' && (
                        <button
                          type="button"
                          disabled={voidIt.isPending}
                          onClick={() => voidIt.mutate(inv.id)}
                          className="rounded-btn border border-danger px-3 py-1.5 text-xs font-semibold text-danger-foreground disabled:opacity-60"
                        >
                          Void
                        </button>
                      )}
                      {(inv.status === 'paid' || inv.status === 'void') && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PageNote>
        No prices are built into this product. Special Miles&rsquo; own pricing is
        still being researched — the brief names willingness to pay and pricing
        strategy as open questions — so a rate here is what somebody agreed with
        a school, typed in by a person, and a plan is a label rather than a value
        from a fixed list. Zero is a real agreement: the brief names subsidised
        access, and a pilot at no charge is a decision, so say why in the note.
        An invoice cannot be marked paid from this screen — db/072 refuses it, the
        same rule db/020 applies to a family&rsquo;s invoice, because &ldquo;paid&rdquo;
        is a claim that money moved and only something holding a payment key can
        make it. A school can read its own agreement and its issued invoices, but
        never a draft and never another school&rsquo;s.
      </PageNote>
    </div>
  )
}
