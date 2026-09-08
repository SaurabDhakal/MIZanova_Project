import { useQuery } from '@tanstack/react-query'
import {
  fetchPlatformInvoices,
  fetchSubscriptions,
  formatMoney,
  queryKeys,
  type BillingPeriod,
} from '../lib/api'
import { ErrorState, LoadingCards } from './QueryState'

/**
 * What this school pays Special Miles — the customer's side of db/072.
 *
 * ---------------------------------------------------------------------------
 * THE PERMISSION EXISTED AND NOTHING USED IT
 * ---------------------------------------------------------------------------
 * db/072 deliberately lets a school administrator read their own agreement and
 * their own issued invoices, and says why: "a customer being able to see what
 * it agreed to pay and what it has been charged is ordinary; hiding it would
 * mean every question became an email to Special Miles."
 *
 * The policy was written, the tests asserted it, and no screen ever asked. That
 * is the same fault db/074 had before db/076 — a capability nobody can reach —
 * and it was mine.
 *
 * ---------------------------------------------------------------------------
 * READ ONLY, AND DRAFTS ARE NOT HERE
 * ---------------------------------------------------------------------------
 * A school cannot change its own price: db/072 refuses the write, and this
 * screen offers no control that would imply otherwise. Drafts are absent
 * because the policy excludes them, not because this filters — a charge Special
 * Miles is still considering is not yet a charge, and showing one would invite
 * a question about a number that may not survive the morning.
 */

const PERIOD_SUFFIX: Record<BillingPeriod, string> = {
  monthly: '/month',
  termly: '/term',
  annual: '/year',
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Issued',
  paid: 'Paid',
  void: 'Cancelled',
  draft: 'Draft',
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function WhatWePaySection({ schoolId }: { schoolId: string }) {
  const subs = useQuery({
    queryKey: queryKeys.subscriptions,
    queryFn: fetchSubscriptions,
  })
  const invoices = useQuery({
    queryKey: queryKeys.platformInvoices,
    queryFn: fetchPlatformInvoices,
  })

  if (subs.isPending) return <LoadingCards count={1} />
  if (subs.isError) {
    return (
      <ErrorState
        message={subs.error.message}
        onRetry={() => void subs.refetch()}
      />
    )
  }

  /*
   * SCOPED TO THE SCHOOL BEING SHOWN, not to "the first live agreement".
   *
   * `fetchSubscriptions()` returns everything the caller may read, which for a
   * school admin is their own and for a platform admin is every school's. This
   * component sits on a school-admin tab, so the difference never shows — until
   * somebody mounts it somewhere else and it silently reports another school's
   * rate as this one's. Filtering by id costs nothing and removes the question.
   */
  const mine = subs.data.filter((s) => s.school_id === schoolId)
  const live = mine.find((s) => s.ends_on === null)
  const ended = mine.filter((s) => s.ends_on !== null)

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">
        What you pay Special Miles
      </h2>
      <p className="mt-1 mb-4 max-w-prose text-sm text-muted-foreground">
        Your agreement and the invoices raised against it. This is what your
        school pays to use MiZanova — separate from anything your school
        invoices families, which is on Invoices.
      </p>

      <div className="rounded-card border border-border bg-card shadow-raised p-5">
        {live ? (
          <>
            <p className="text-foreground">
              <span className="font-semibold">{live.plan_label}</span> —{' '}
              <span className="font-semibold">
                {live.rate_cents === 0
                  ? 'no charge'
                  : `${formatMoney(live.rate_cents, live.currency)}${PERIOD_SUFFIX[live.period]}`}
              </span>
              , since {day(live.starts_on)}
            </p>
            {live.note && (
              <p className="mt-1 text-sm text-muted-foreground">{live.note}</p>
            )}
          </>
        ) : (
          /* Not an error and not styled as one. A school with no agreement
             recorded is usually one Special Miles has not finished setting up,
             and it is not the school's problem to solve. */
          <p className="text-sm text-muted-foreground">
            No agreement is recorded yet. Nothing is being charged. Special
            Miles records one when it is agreed.
          </p>
        )}

        {ended.length > 0 && (
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            {ended.length} earlier agreement{ended.length === 1 ? '' : 's'} kept
            on record — what you used to pay is the answer to most billing
            questions.
          </p>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          Changing this is a conversation rather than a form. Speak to Special
          Miles.
        </p>
      </div>

      {invoices.isError ? (
        <p className="mt-4 rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
          Your invoices could not be loaded, so this is unknown rather than
          empty. Nothing has been withdrawn.
        </p>
      ) : (invoices.data ?? []).filter((i) => i.school_id === schoolId).length >
        0 ? (
        <div className="mt-4 overflow-x-auto rounded-card border border-border bg-card shadow-raised">
          <table className="w-full min-w-[36rem] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[28%]" />
              <col className="w-[18%]" />
              <col className="w-[24%]" />
            </colgroup>
            <caption className="sr-only">
              Invoices Special Miles has issued to this school
            </caption>
            <thead className="border-b border-border bg-background/60">
              <tr className="text-xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-4 py-3 font-semibold">For</th>
                <th scope="col" className="px-4 py-3 font-semibold">Period</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoices.data ?? [])
                .filter((inv) => inv.school_id === schoolId)
                .map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 align-top break-words text-foreground">
                    {inv.description}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {day(inv.period_start)} – {day(inv.period_end)}
                    {inv.due_date && (
                      <span className="block text-xs">
                        due {day(inv.due_date)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {STATUS_LABEL[inv.status] ?? inv.status}
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums text-foreground">
                    {formatMoney(inv.amount_cents, inv.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
          Nothing has been invoiced yet.
        </p>
      )}
    </section>
  )
}
