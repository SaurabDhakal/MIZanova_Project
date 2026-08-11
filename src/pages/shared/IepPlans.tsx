import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IEP_STATUS_LABEL,
  createIepPlan,
  fetchIepPlans,
  fetchStudent,
  queryKeys,
  type IepPlanRow,
  type IepPlanStatus,
} from '../../lib/api'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import Icon from '../../components/Icon'
import { showToast } from '../../lib/toast'
import { useAuth } from '../../lib/auth'
import { pathForRole } from '../../lib/roles'

/**
 * Every IEP/ILP a child has had, newest first.
 *
 * A LIST BECAUSE PLANS CHAIN. The paper form's baseline says "Refer to previous
 * IEP/ILP unless this is a first IEP/ILP" — so the useful question on opening
 * this screen is not "what is the plan" but "what happened to the last one".
 * That is why the review dates are on the row and not buried inside.
 *
 * WHAT THE ROW LEADS WITH. Not the plan date: whether anybody needs to do
 * something. A plan whose review date has passed is the only row here that is
 * asking for anything, so it says so in words, in the danger colour, before
 * anything else on the row.
 */

const STATUS_STYLE: Record<IepPlanStatus, string> = {
  // A draft is unfinished work, not a problem — grey, not amber.
  draft: 'bg-background text-muted-foreground',
  agreed: 'bg-success-subtle text-success-foreground',
  in_review: 'bg-warning-subtle text-warning-foreground',
  closed: 'bg-primary-subtle text-primary',
  superseded: 'bg-background text-muted-foreground',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Whole days from today. Negative once the date has gone. */
function daysUntil(iso: string): number {
  const then = new Date(iso)
  const now = new Date()
  then.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.round((then.getTime() - now.getTime()) / 86_400_000)
}

function PlanRow({ plan, basePath }: { plan: IepPlanRow; basePath: string }) {
  const goals = plan.iep_goals[0]?.count ?? 0

  /*
   * OVERDUE IS ONLY MEANINGFUL WHILE A PLAN IS LIVE. A closed plan whose review
   * date has passed is not overdue — it was reviewed, which is what closed it.
   * Saying "45 days overdue" on a finished plan would be the screen inventing
   * an obligation nobody has.
   */
  const live = plan.status === 'agreed' || plan.status === 'in_review'
  const due = plan.proposed_review_date
  const overdueBy = live && due ? -daysUntil(due) : null
  const overdue = overdueBy !== null && overdueBy > 0

  return (
    <li>
      <Link
        to={`${basePath}/${plan.id}`}
        className={`block rounded-card border bg-card p-5 shadow-raised hover:border-primary ${
          overdue ? 'border-danger' : 'border-border'
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-section text-foreground">
            Plan of {formatDate(plan.plan_date)}
          </h2>
          <span
            className={`rounded-btn px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[plan.status]}`}
          >
            {IEP_STATUS_LABEL[plan.status]}
          </span>
          {overdue && (
            <span className="rounded-btn bg-danger-subtle px-2.5 py-0.5 text-xs font-semibold text-danger-foreground">
              Review {overdueBy} day{overdueBy === 1 ? '' : 's'} overdue
            </span>
          )}
        </div>

        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Areas of concern</dt>
            <dd className="font-medium text-foreground">{goals}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Review due</dt>
            <dd className="font-medium text-foreground">
              {due ? formatDate(due) : 'Not set'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Reviewed</dt>
            <dd className="font-medium text-foreground">
              {plan.actual_review_date
                ? formatDate(plan.actual_review_date)
                : '—'}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  )
}

export default function IepPlans() {
  const { studentId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const roleBase = profile ? pathForRole(profile.role) : ''
  const [confirmingFrom, setConfirmingFrom] = useState<string | null>(null)

  const basePath = `${roleBase}/students/${studentId}/iep`

  const student = useQuery({
    queryKey: queryKeys.student(studentId),
    queryFn: () => fetchStudent(studentId),
  })

  const plans = useQuery({
    queryKey: queryKeys.iepPlans(studentId),
    queryFn: () => fetchIepPlans(studentId),
  })

  const create = useMutation({
    mutationFn: (previousPlanId: string | null) =>
      createIepPlan({
        studentId,
        planDate: new Date().toISOString().slice(0, 10),
        previousPlanId,
      }),
    onSuccess: (planId) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iepPlans(studentId),
      })
      navigate(`${basePath}/${planId}`)
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  if (plans.isPending) return <LoadingCards count={2} />
  if (plans.isError) return <ErrorState message={plans.error.message} />

  const latest = plans.data[0]
  const name = student.data
    ? `${student.data.first_name} ${student.data.last_name}`
    : 'this child'

  return (
    <div>
      <Link
        to={`${roleBase}/students/${studentId}`}
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Back to {name}
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-title text-foreground">
          Education plans for {name}
        </h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Individual Education / Individual Learning Plans. A plan is drafted by
          the school, agreed at a meeting with the family, and reviewed on a
          date set at that meeting.
        </p>
      </header>

      {/* WHY THE NEW-PLAN BUTTON ASKS A QUESTION. The form's baseline field
          says to refer to the previous plan, so a new plan almost always
          follows one — but a child's first plan, and a plan opened for a
          genuinely new concern, do not. Guessing wrong writes a false history
          into `previous_plan_id`, so it asks once rather than assuming. */}
      <div className="mb-6 rounded-card border border-border bg-card p-5 shadow-raised">
        <h2 className="text-section text-foreground">Start a new plan</h2>
        {latest ? (
          <>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              The most recent plan is dated {formatDate(latest.plan_date)}. If
              this one continues from it, say so — the new plan will record that
              link, which is what the “refer to previous plan” line on the form
              relies on.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={create.isPending}
                onClick={() => {
                  setConfirmingFrom(latest.id)
                  create.mutate(latest.id)
                }}
                className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
              >
                {create.isPending && confirmingFrom === latest.id
                  ? 'Creating…'
                  : 'Continue from that plan'}
              </button>
              <button
                type="button"
                disabled={create.isPending}
                onClick={() => {
                  setConfirmingFrom('none')
                  create.mutate(null)
                }}
                className="rounded-btn border border-border bg-card px-4 py-2.5 font-semibold text-foreground hover:bg-background disabled:opacity-60"
              >
                {create.isPending && confirmingFrom === 'none'
                  ? 'Creating…'
                  : 'Start unrelated plan'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {name} has no plan on file yet. A new plan starts as a draft that
              only the school can see, so there is no harm in starting it before
              the meeting.
            </p>
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => create.mutate(null)}
              className="mt-4 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
            >
              {create.isPending ? 'Creating…' : 'Start the first plan'}
            </button>
          </>
        )}
      </div>

      {plans.data.length === 0 ? (
        /* An empty state that says what the screen will look like when it is
           working, rather than only that it is empty. */
        <div className="rounded-card border border-border bg-card p-8 text-center shadow-raised">
          <Icon
            name="compliance"
            className="mx-auto h-8 w-8 text-muted-foreground"
          />
          <h2 className="mt-3 text-section text-foreground">No plans yet</h2>
          <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
            Once a plan exists it appears here with its status, how many areas
            of concern it covers, and when its review falls due. Plans stay on
            this list after they are closed, because the next plan starts from
            what the last one found.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {plans.data.map((plan) => (
            <PlanRow key={plan.id} plan={plan} basePath={basePath} />
          ))}
        </ul>
      )}
    </div>
  )
}
