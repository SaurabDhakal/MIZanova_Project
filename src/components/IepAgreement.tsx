import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  confirmIepPlan,
  fetchIepPlanConfirmations,
  queryKeys,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { showToast } from '../lib/toast'

/**
 * Who has personally agreed to an IEP — the family half of db/054.
 *
 * ---------------------------------------------------------------------------
 * THE GAP THIS CLOSES
 * ---------------------------------------------------------------------------
 * A plan reached "Agreed" when a staff member pressed a staff button. db/054
 * built `iep_plan_confirmations` so that the record could name the people who
 * actually agreed, and wrote its insert policy as `profile_id = auth.uid()`
 * precisely so that nobody can agree on somebody else's behalf. Then no screen
 * ever wrote a row, so every plan in the product said "Agreed" on the school's
 * word alone — including to the family, who had no way to say yes or to see
 * that they had never been asked.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SAME COMPONENT SERVES BOTH SIDES
 * ---------------------------------------------------------------------------
 * The paper form has two signature blocks: a parent/carer and a service
 * representative. They are the same act — a named person saying "yes, this" —
 * so they are one component with one list, and `asGuardian` records which side
 * of the table somebody sat on. Two components would have let the two halves
 * drift into disagreeing about what a confirmation is.
 *
 * There is no "un-agree". Withdrawing agreement to a plan is a conversation
 * that produces a new plan, which is how db/054 models revision, and a button
 * that quietly deleted the record would destroy the only evidence the meeting
 * happened.
 */

function day(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function IepAgreement({
  planId,
  asGuardian,
}: {
  planId: string
  /** True on a family screen, false on a staff one. Decides only which side
      the confirmation is recorded as — never who is allowed to press it, which
      is db/054's job. */
  asGuardian: boolean
}) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const confirmations = useQuery({
    queryKey: queryKeys.iepPlanConfirmations(planId),
    queryFn: () => fetchIepPlanConfirmations(planId),
  })

  const confirm = useMutation({
    mutationFn: () => confirmIepPlan(asGuardian, planId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.iepPlanConfirmations(planId),
      })
      showToast('Your agreement has been recorded.')
    },
    onError: (e) => showToast(e.message, 'error'),
  })

  /*
   * A FAILED LOOKUP IS NOT AN EMPTY ONE — the fault this project keeps finding.
   * If this query failed, `mine` would be undefined and the screen would offer
   * somebody an "I agree" button they have already pressed, then fail on the
   * unique constraint. Said plainly instead.
   */
  if (confirmations.isError) {
    return (
      <div className="mt-4 rounded-card border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Who has agreed to this plan could not be loaded, so this is unknown
          rather than nobody. Nothing has been withdrawn.
        </p>
      </div>
    )
  }

  const rows = confirmations.data ?? []
  const mine = rows.some((c) => c.profile_id === profile?.id)
  const families = rows.filter((c) => c.as_guardian)

  return (
    <div className="mt-4 rounded-card border border-border bg-background/60 p-4">
      <h3 className="font-semibold text-foreground">Who has agreed</h3>

      {confirmations.isPending ? (
        <p className="mt-1 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        /*
         * Stated as a fact about the record, not as a failing. A plan agreed at
         * a meeting before anybody used this screen is not a plan nobody agreed
         * to — it is one whose agreement was never written down here.
         */
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Nobody has confirmed their agreement here yet.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {rows.map((c) => (
            <li key={c.id} className="text-foreground">
              <span className="font-medium">
                {c.profiles?.full_name ??
                  /* The reader may not see this person's profile. Naming them
                     "Unknown" would read as a data fault; what is true is that
                     somebody confirmed and this reader may not see who. */
                  (c.profile_id === profile?.id ? 'You' : 'Someone at the meeting')}
              </span>
              <span className="text-muted-foreground">
                {' '}
                — {c.as_guardian ? 'parent or carer' : 'school or service'}, on{' '}
                {day(c.confirmed_at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/*
        SAID WHEN IT IS TRUE, AND ONLY THEN. A plan can read "Agreed" with no
        family confirmation against it, and on the staff screen that is the
        single most useful thing this component can say — it is the difference
        between a plan the family signed and a plan the school filed.
      */}
      {confirmations.isSuccess && families.length === 0 && !asGuardian && (
        <p className="mt-3 rounded-btn border border-warning bg-warning-subtle px-3 py-2 text-sm text-warning-foreground">
          No parent or carer has confirmed this plan. Agreeing it here records
          the school&rsquo;s side only.
        </p>
      )}

      {confirmations.isSuccess &&
        (mine ? (
          <p className="mt-3 text-sm font-medium text-primary">
            You have agreed to this plan.
          </p>
        ) : (
          <div className="mt-3">
            <p className="max-w-prose text-sm text-muted-foreground">
              {asGuardian
                ? 'Agreeing records that you have read this plan and are happy for the school to work to it. It does not change the plan, and it cannot be undone here.'
                : 'Agreeing records that you were at the meeting and settled on this plan. It cannot be undone here.'}
            </p>
            <button
              type="button"
              disabled={confirm.isPending}
              onClick={() => confirm.mutate()}
              className="mt-3 rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {confirm.isPending ? 'Recording…' : 'I agree to this plan'}
            </button>
          </div>
        ))}
    </div>
  )
}
