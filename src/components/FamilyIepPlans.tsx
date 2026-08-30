import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchIepPlan,
  fetchIepPlans,
  IEP_OUTCOME_LABEL,
  IEP_STATUS_LABEL,
  queryKeys,
} from '../lib/api'
import { ErrorState, LoadingCards } from './QueryState'
import IepAgreement from './IepAgreement'

/**
 * The plan itself, for the family it is about — db/054.
 *
 * ---------------------------------------------------------------------------
 * A PROMISE THE PRODUCT WAS ALREADY MAKING
 * ---------------------------------------------------------------------------
 * The staff editor's confirmation step tells whoever agrees a plan that "the
 * child's guardians will be able to read it". db/054's select policy was
 * written to keep that promise — a parent may read any plan about their child
 * that is not a draft. No parent route ever asked for one, so the sentence was
 * false for as long as it had been on the screen.
 *
 * ---------------------------------------------------------------------------
 * WHY DRAFTS ARE ABSENT RATHER THAN FILTERED
 * ---------------------------------------------------------------------------
 * This does not filter by status; db/054 refuses to return a draft to a
 * family. A half-written plan carries wording a school has not settled on, and
 * a parent reading a sentence that is deleted the next morning is how a
 * meeting starts badly. The rule lives in the database so that a mistake on
 * this screen cannot leak one.
 */

function day(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function PlanBody({ planId }: { planId: string }) {
  const plan = useQuery({
    queryKey: queryKeys.iepPlan(planId),
    queryFn: () => fetchIepPlan(planId),
  })

  if (plan.isPending) return <LoadingCards count={1} />
  if (plan.isError) {
    return (
      <ErrorState
        message={plan.error.message}
        onRetry={() => void plan.refetch()}
      />
    )
  }

  const goals = [...plan.data.iep_goals].sort(
    (a, b) => a.sort_order - b.sort_order,
  )

  return (
    <div className="mt-4">
      {plan.data.baseline && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            Where your child is starting from
          </h3>
          <p className="mt-1 max-w-prose text-sm whitespace-pre-line text-muted-foreground">
            {plan.data.baseline}
          </p>
        </div>
      )}

      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This plan has no goals recorded against it.
        </p>
      ) : (
        <ul className="space-y-3">
          {goals.map((g) => (
            <li
              key={g.id}
              className="rounded-card border border-border bg-card p-4"
            >
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                {g.area_of_concern}
              </p>
              <p className="mt-1 font-medium text-foreground">
                {g.long_term_goal}
              </p>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                {g.short_term_goal}
              </p>
              {g.strategies && (
                <p className="mt-2 max-w-prose text-sm whitespace-pre-line text-muted-foreground">
                  <span className="font-medium text-foreground">
                    How we will work on it:{' '}
                  </span>
                  {g.strategies}
                </p>
              )}
              {g.iep_goal_reviews.length > 0 && (
                <ul className="mt-2 border-t border-border pt-2 text-sm">
                  {g.iep_goal_reviews.map((r) => (
                    <li key={r.id} className="text-muted-foreground">
                      {day(r.reviewed_on)} — {IEP_OUTCOME_LABEL[r.outcome]}
                      {r.comment ? `. ${r.comment}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <IepAgreement planId={planId} asGuardian />
    </div>
  )
}

export default function FamilyIepPlans({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const plans = useQuery({
    queryKey: queryKeys.iepPlans(studentId),
    queryFn: () => fetchIepPlans(studentId),
  })

  return (
    <>
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Individual education plans
      </h2>

      {plans.isPending && <LoadingCards count={1} />}
      {plans.isError && (
        <ErrorState
          message={plans.error.message}
          onRetry={() => void plans.refetch()}
        />
      )}

      {plans.isSuccess && plans.data.length === 0 && (
        <p className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
          There is no plan to show yet. A plan is written with you at a meeting,
          and appears here once the school has finished writing it up.
        </p>
      )}

      {plans.isSuccess && plans.data.length > 0 && (
        <ul className="space-y-3">
          {plans.data.map((p) => {
            const isOpen = open === p.id
            return (
              <li
                key={p.id}
                className="rounded-card border border-border bg-card p-5 shadow-raised"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-semibold text-foreground">
                    Plan of {day(p.plan_date)}
                  </h3>
                  <span className="rounded-btn bg-primary-subtle px-2 py-0.5 text-xs font-semibold text-primary">
                    {IEP_STATUS_LABEL[p.status]}
                  </span>
                </div>

                <p className="mt-1 text-sm text-muted-foreground">
                  {p.iep_goals[0]?.count ?? 0} goal
                  {(p.iep_goals[0]?.count ?? 0) === 1 ? '' : 's'}
                  {p.proposed_review_date
                    ? ` · to be reviewed around ${day(p.proposed_review_date)}`
                    : ''}
                </p>

                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : p.id)}
                  aria-expanded={isOpen}
                  className="mt-3 text-sm font-semibold text-primary hover:underline"
                >
                  {isOpen ? 'Close' : 'Read it and agree'}
                </button>

                {isOpen && <PlanBody planId={p.id} />}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
