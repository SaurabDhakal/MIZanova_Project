import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IEP_OUTCOME_LABEL,
  IEP_STATUS_LABEL,
  addIepParticipant,
  agreeIepPlan,
  createIepGoal,
  deleteIepGoal,
  fetchIepPlan,
  queryKeys,
  removeIepParticipant,
  updateIepGoal,
  updateIepPlan,
  type IepGoalRow,
  type IepPlanDetail,
} from '../../lib/api'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import Icon from '../../components/Icon'
import { showToast } from '../../lib/toast'
import { useAuth } from '../../lib/auth'
import { pathForRole } from '../../lib/roles'

/**
 * The IEP/ILP form itself.
 *
 * ---------------------------------------------------------------------------
 * THE SCREEN IS TWO SCREENS, AND THE DATABASE DECIDES WHICH
 * ---------------------------------------------------------------------------
 * A draft is a working document. An agreed plan is a record of what a school
 * and a family settled on, and db/054 refuses writes to it at the table level.
 * So this does not render editable fields and hope: once `status` leaves
 * 'draft' it renders the plan as a document, because an input box the database
 * will reject is a lie told in advance.
 *
 * ---------------------------------------------------------------------------
 * WHY SMART IS PRINTED BESIDE THE FIELD RATHER THAN VALIDATED
 * ---------------------------------------------------------------------------
 * The paper form says SMART twice, in bold, in brackets, for both goal fields.
 * Nothing here can check whether a sentence is Specific or Measurable — a
 * regular expression that tried would reject good goals and pass bad ones. So
 * the criteria sit next to the box where the person writing can see them, and
 * a person decides. That is the same division of labour the rest of this
 * product uses for judgement.
 *
 * ---------------------------------------------------------------------------
 * AGREEING IS THE ONE IRREVERSIBLE ACTION
 * ---------------------------------------------------------------------------
 * It freezes the wording and the goals, shows the plan to the family, and
 * cannot be undone from any screen. So it asks first, and the confirmation says
 * what will actually happen rather than "Are you sure?".
 */

const SMART = 'Specific · Measurable · Achievable · Realistic · Timed'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** A field label, used by both the editable and the read-only rendering. */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

const inputClass =
  'w-full rounded-btn border border-border bg-background px-3 py-2 text-sm text-foreground'

// ---------------------------------------------------------------------------
// One area of concern — the row from the paper form's goals table
// ---------------------------------------------------------------------------
function GoalCard({
  goal,
  index,
  frozen,
  planId,
  studentId,
}: {
  goal: IepGoalRow
  index: number
  frozen: boolean
  planId: string
  studentId: string
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    area_of_concern: goal.area_of_concern,
    long_term_goal: goal.long_term_goal,
    short_term_goal: goal.short_term_goal,
    strategies: goal.strategies ?? '',
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.iepPlan(planId) })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.iepPlans(studentId),
    })
  }

  const save = useMutation({
    mutationFn: () =>
      updateIepGoal(goal.id, {
        area_of_concern: form.area_of_concern,
        long_term_goal: form.long_term_goal,
        short_term_goal: form.short_term_goal,
        strategies: form.strategies || null,
      }),
    onSuccess: () => {
      setEditing(false)
      invalidate()
      showToast('Goal saved.')
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: () => deleteIepGoal(goal.id),
    onSuccess: () => {
      invalidate()
      showToast('Area of concern removed.')
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  const latestReview = goal.iep_goal_reviews
    .slice()
    .sort((a, b) => b.reviewed_on.localeCompare(a.reviewed_on))[0]

  if (editing && !frozen) {
    return (
      <li className="rounded-card border border-primary bg-card p-5 shadow-raised">
        <div className="space-y-4">
          <Field
            label="Area of concern"
            hint="Developmental domains, self help, transition to school — or your service's own wording."
          >
            <input
              className={inputClass}
              value={form.area_of_concern}
              onChange={(e) =>
                setForm({ ...form, area_of_concern: e.target.value })
              }
            />
          </Field>
          <Field label="Long term goal" hint={SMART}>
            <textarea
              rows={2}
              className={inputClass}
              value={form.long_term_goal}
              onChange={(e) =>
                setForm({ ...form, long_term_goal: e.target.value })
              }
            />
          </Field>
          <Field
            label="Short term goal"
            hint={`${SMART} — the step towards the long term goal.`}
          >
            <textarea
              rows={2}
              className={inputClass}
              value={form.short_term_goal}
              onChange={(e) =>
                setForm({ ...form, short_term_goal: e.target.value })
              }
            />
          </Field>
          <Field label="Teaching strategies and resources required">
            <textarea
              rows={2}
              className={inputClass}
              value={form.strategies}
              onChange={(e) => setForm({ ...form, strategies: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              save.isPending ||
              !form.area_of_concern.trim() ||
              !form.long_term_goal.trim() ||
              !form.short_term_goal.trim()
            }
            onClick={() => save.mutate()}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-background"
          >
            Cancel
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="rounded-card border border-border bg-card p-5 shadow-raised">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Area {index + 1}
        </span>
        <h3 className="text-section text-foreground">{goal.area_of_concern}</h3>
        {latestReview && (
          <span className="rounded-btn bg-primary-subtle px-2.5 py-0.5 text-xs font-semibold text-primary">
            {IEP_OUTCOME_LABEL[latestReview.outcome]} ·{' '}
            {formatDate(latestReview.reviewed_on)}
          </span>
        )}
        {!frozen && (
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-btn border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-background"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
              className="rounded-btn border border-border px-3 py-1.5 text-sm font-semibold text-danger-foreground hover:bg-danger-subtle disabled:opacity-60"
            >
              Remove
            </button>
          </span>
        )}
      </div>

      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="font-semibold text-foreground">Long term goal</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-foreground">
            {goal.long_term_goal}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">Short term goal</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-foreground">
            {goal.short_term_goal}
          </dd>
        </div>
        {goal.strategies && (
          <div>
            <dt className="font-semibold text-foreground">
              Teaching strategies and resources
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-foreground">
              {goal.strategies}
            </dd>
          </div>
        )}
      </dl>

      {latestReview?.comment && (
        <blockquote className="mt-3 border-l-4 border-border pl-4 text-sm whitespace-pre-wrap text-muted-foreground">
          {latestReview.comment}
        </blockquote>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
function AddGoal({
  planId,
  studentId,
  nextOrder,
}: {
  planId: string
  studentId: string
  nextOrder: number
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    area: '',
    longTerm: '',
    shortTerm: '',
    strategies: '',
  })

  const add = useMutation({
    mutationFn: () =>
      createIepGoal({
        planId,
        areaOfConcern: form.area,
        longTermGoal: form.longTerm,
        shortTermGoal: form.shortTerm,
        strategies: form.strategies,
        sortOrder: nextOrder,
      }),
    onSuccess: () => {
      setForm({ area: '', longTerm: '', shortTerm: '', strategies: '' })
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.iepPlan(planId) })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iepPlans(studentId),
      })
      showToast('Area of concern added.')
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-border bg-card p-4 text-sm font-semibold text-primary hover:bg-background"
      >
        <Icon name="goals" className="h-4 w-4" />
        Add an area of concern
      </button>
    )
  }

  return (
    <div className="rounded-card border border-primary bg-card p-5 shadow-raised">
      <div className="space-y-4">
        <Field
          label="Area of concern"
          hint="Developmental domains, self help, transition to school — or your service's own wording."
        >
          <input
            className={inputClass}
            autoFocus
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
            placeholder="Self help"
          />
        </Field>
        <Field label="Long term goal" hint={SMART}>
          <textarea
            rows={2}
            className={inputClass}
            value={form.longTerm}
            onChange={(e) => setForm({ ...form, longTerm: e.target.value })}
            placeholder="By December, put on their own jacket unaided at 4 of 5 outdoor times."
          />
        </Field>
        <Field
          label="Short term goal"
          hint={`${SMART} — the step towards the long term goal.`}
        >
          <textarea
            rows={2}
            className={inputClass}
            value={form.shortTerm}
            onChange={(e) => setForm({ ...form, shortTerm: e.target.value })}
            placeholder="By September, find both sleeves with one verbal prompt."
          />
        </Field>
        <Field label="Teaching strategies and resources required">
          <textarea
            rows={2}
            className={inputClass}
            value={form.strategies}
            onChange={(e) => setForm({ ...form, strategies: e.target.value })}
            placeholder="Visual sequence card by the door. Extra two minutes before outdoor play."
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={
            add.isPending ||
            !form.area.trim() ||
            !form.longTerm.trim() ||
            !form.shortTerm.trim()
          }
          onClick={() => add.mutate()}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {add.isPending ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-btn border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-background"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function Participants({
  plan,
  frozen,
}: {
  plan: IepPlanDetail
  frozen: boolean
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [role, setRole] = useState('')

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.iepPlan(plan.id) })

  const add = useMutation({
    mutationFn: () =>
      addIepParticipant({ planId: plan.id, personName: name, personRole: role }),
    onSuccess: () => {
      setName('')
      setRole('')
      invalidate()
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: removeIepParticipant,
    onSuccess: invalidate,
    onError: (error) => showToast(error.message, 'error'),
  })

  return (
    <div>
      <p className="text-sm font-semibold text-foreground">
        People involved in setting this plan
      </p>
      {/* NAMES RATHER THAN ACCOUNTS, and db/054 allows it deliberately: half the
          people at an IEP meeting have no login here — an external OT, a
          grandparent who is the primary carer, a teacher from the school the
          child is moving to. Requiring an account would mean the record could
          not describe the meeting that actually happened. */}
      <p className="mt-0.5 text-xs text-muted-foreground">
        Anyone who was there, whether or not they use MiZanova.
      </p>

      {plan.iep_plan_participants.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {plan.iep_plan_participants.map((p) => (
            <li
              key={p.id}
              className="inline-flex items-center gap-2 rounded-btn bg-background px-2.5 py-1 text-sm"
            >
              <span className="font-medium text-foreground">
                {p.person_name}
              </span>
              {p.person_role && (
                <span className="text-muted-foreground">{p.person_role}</span>
              )}
              {!frozen && (
                <button
                  type="button"
                  aria-label={`Remove ${p.person_name}`}
                  onClick={() => remove.mutate(p.id)}
                  className="text-muted-foreground hover:text-danger-foreground"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!frozen && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className={`${inputClass} max-w-52`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
          />
          <input
            className={`${inputClass} max-w-52`}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role (parent, OT, teacher…)"
          />
          <button
            type="button"
            disabled={!name.trim() || add.isPending}
            onClick={() => add.mutate()}
            className="rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-background disabled:opacity-60"
          >
            Add
          </button>
        </div>
      )}

      {frozen && plan.iep_plan_participants.length === 0 && (
        <p className="mt-1 text-sm text-muted-foreground">
          Nobody was recorded.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
export default function IepPlanEditor() {
  const { studentId = '', planId = '' } = useParams()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const roleBase = profile ? pathForRole(profile.role) : ''
  const [confirmingAgree, setConfirmingAgree] = useState(false)

  const plan = useQuery({
    queryKey: queryKeys.iepPlan(planId),
    queryFn: () => fetchIepPlan(planId),
  })

  const [details, setDetails] = useState<{
    plan_date: string
    home_languages: string
    baseline: string
    proposed_review_date: string
  } | null>(null)

  const save = useMutation({
    mutationFn: () =>
      updateIepPlan(planId, {
        plan_date: details!.plan_date,
        home_languages: details!.home_languages || null,
        baseline: details!.baseline || null,
        proposed_review_date: details!.proposed_review_date || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.iepPlan(planId) })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iepPlans(studentId),
      })
      showToast('Plan saved.')
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  const agree = useMutation({
    /**
     * SAVES BEFORE IT AGREES, and this is not a nicety.
     *
     * The first version of this screen only sent the status. Typing a baseline
     * and then pressing Agree without pressing Save first threw the typing
     * away — and because agreeing freezes the plan in the database, the text
     * could never be put back. A teacher's description of a child, gone
     * silently, onto a record that is now permanent.
     *
     * Found by using the screen. It passed lint, passed the build, and passed
     * 268 tests, because every one of those checks the parts and none of them
     * presses two buttons in the order a person in a hurry would.
     *
     * `details` is null when nothing has been edited, so an untouched plan
     * still costs exactly one request.
     */
    mutationFn: async () => {
      if (details) {
        await updateIepPlan(planId, {
          plan_date: details.plan_date,
          home_languages: details.home_languages || null,
          baseline: details.baseline || null,
          proposed_review_date: details.proposed_review_date || null,
        })
      }
      await agreeIepPlan(planId)
    },
    onSuccess: () => {
      setConfirmingAgree(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.iepPlan(planId) })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iepPlans(studentId),
      })
      showToast('Plan agreed. Its wording and goals are now fixed.')
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  if (plan.isPending) return <LoadingCards count={3} />
  if (plan.isError) return <ErrorState message={plan.error.message} />

  const p = plan.data
  const frozen = p.status !== 'draft'
  const listPath = `${roleBase}/students/${studentId}/iep`

  // Seeded once from the server, then owned by the form.
  const form = details ?? {
    plan_date: p.plan_date,
    home_languages: p.home_languages ?? '',
    baseline: p.baseline ?? '',
    proposed_review_date: p.proposed_review_date ?? '',
  }
  const set = (patch: Partial<typeof form>) =>
    setDetails({ ...form, ...patch })

  const goals = p.iep_goals
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="max-w-4xl">
      <Link
        to={listPath}
        className="text-sm font-medium text-primary hover:underline"
      >
        ← All plans
      </Link>

      <header className="mt-4 mb-6 flex flex-wrap items-start gap-x-4 gap-y-2">
        <div>
          <h1 className="text-title text-foreground">
            Individual Education Plan
          </h1>
          <p className="mt-1 text-muted-foreground">
            {formatDate(p.plan_date)}
            {p.previous_plan_id && ' · continues from an earlier plan'}
          </p>
        </div>
        <span
          className={`rounded-btn px-3 py-1 text-sm font-semibold ${
            frozen
              ? 'bg-success-subtle text-success-foreground'
              : 'bg-background text-muted-foreground'
          }`}
        >
          {IEP_STATUS_LABEL[p.status]}
        </span>
      </header>

      {/* WHAT A FROZEN PLAN SAYS, and why. Without this the Edit buttons are
          simply missing and the screen looks broken rather than deliberate. */}
      {frozen && (
        <div className="mb-6 rounded-card border border-border bg-primary-subtle p-4">
          <p className="text-sm font-semibold text-foreground">
            This plan was agreed
            {p.agreed_at && ` on ${formatDate(p.agreed_at)}`} and can no longer
            be edited.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            It is the record of what the school and the family settled on, so
            the database refuses changes to it. Record a review against a goal,
            or start a new plan that continues from this one.
          </p>
        </div>
      )}

      {!frozen && (
        <div className="mb-6 rounded-card border border-border bg-background p-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              This is a draft.
            </span>{' '}
            The family cannot see it. Nothing here is shared until you agree the
            plan.
          </p>
        </div>
      )}

      {/* --- the top of the paper form ------------------------------------ */}
      <section className="rounded-card border border-border bg-card p-5 shadow-raised">
        <h2 className="text-section text-foreground">About this plan</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Plan date">
            {frozen ? (
              <p className="text-foreground">{formatDate(p.plan_date)}</p>
            ) : (
              <input
                type="date"
                className={inputClass}
                value={form.plan_date}
                onChange={(e) => set({ plan_date: e.target.value })}
              />
            )}
          </Field>

          {/* Not a demographic curio: it decides whether the family can read
              the plan and whether the meeting needs an interpreter booked. */}
          <Field
            label="Home language/s"
            hint="Whether this plan and the meeting need an interpreter."
          >
            {frozen ? (
              <p className="text-foreground">{p.home_languages || '—'}</p>
            ) : (
              <input
                className={inputClass}
                value={form.home_languages}
                onChange={(e) => set({ home_languages: e.target.value })}
                placeholder="English"
              />
            )}
          </Field>
        </div>

        <div className="mt-4">
          <Field
            label="What can the child do now? Strengths and interests"
            hint={
              p.previous_plan_id
                ? 'This plan continues from an earlier one — start from what that plan found.'
                : 'For a first plan, describe where the child is starting from.'
            }
          >
            {frozen ? (
              <p className="whitespace-pre-wrap text-foreground">
                {p.baseline || '—'}
              </p>
            ) : (
              <textarea
                rows={4}
                className={inputClass}
                value={form.baseline}
                onChange={(e) => set({ baseline: e.target.value })}
              />
            )}
          </Field>
        </div>

        <div className="mt-4">
          <Participants plan={p} frozen={frozen} />
        </div>

        <div className="mt-4 max-w-xs">
          <Field
            label="Proposed review date"
            hint="Set at the meeting. This is what the overdue warning counts from."
          >
            {frozen ? (
              <p className="text-foreground">
                {p.proposed_review_date
                  ? formatDate(p.proposed_review_date)
                  : 'Not set'}
              </p>
            ) : (
              <input
                type="date"
                className={inputClass}
                value={form.proposed_review_date}
                onChange={(e) => set({ proposed_review_date: e.target.value })}
              />
            )}
          </Field>
        </div>

        {!frozen && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={save.isPending || details === null}
              onClick={() => save.mutate()}
              className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
            >
              {save.isPending ? 'Saving…' : 'Save plan details'}
            </button>
            {/* Says which state the section is in rather than leaving a greyed
                button to be read as broken. Agreeing saves these anyway, but a
                person should be able to see that nothing is pending. */}
            <span className="text-sm text-muted-foreground">
              {details === null ? 'No changes to save.' : 'You have unsaved changes.'}
            </span>
          </div>
        )}
      </section>

      {/* --- the goals table ---------------------------------------------- */}
      <h2 className="mt-8 mb-1 text-section text-foreground">
        Areas of concern and goals
      </h2>
      <p className="mb-3 max-w-prose text-sm text-muted-foreground">
        Each area carries a long term goal and the short term step towards it.
        Both should be SMART: {SMART.toLowerCase()}.
      </p>

      {goals.length === 0 && frozen && (
        <p className="rounded-card border border-border bg-card p-5 text-sm text-muted-foreground shadow-raised">
          This plan was agreed without any goals recorded.
        </p>
      )}

      <ul className="space-y-3">
        {goals.map((goal, i) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            index={i}
            frozen={frozen}
            planId={planId}
            studentId={studentId}
          />
        ))}
      </ul>

      {!frozen && (
        <div className="mt-3">
          <AddGoal
            planId={planId}
            studentId={studentId}
            nextOrder={goals.length}
          />
        </div>
      )}

      {/* --- agreement ----------------------------------------------------- */}
      {!frozen && (
        <section className="mt-8 rounded-card border border-border bg-card p-5 shadow-raised">
          <h2 className="text-section text-foreground">Agree this plan</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Agreeing records that this is what the school and the family settled
            on at the meeting.
          </p>

          {!confirmingAgree ? (
            <button
              type="button"
              disabled={goals.length === 0}
              onClick={() => setConfirmingAgree(true)}
              className="mt-4 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
            >
              Agree this plan
            </button>
          ) : (
            /* THE CONFIRMATION SAYS WHAT HAPPENS, not "are you sure". Three
               consequences, one of which — the family seeing it — is the one
               somebody clicking quickly would not have thought about. */
            <div className="mt-4 rounded-card border border-warning bg-warning-subtle p-4">
              <p className="font-semibold text-warning-foreground">
                Once agreed, this cannot be undone.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-foreground">
                {details !== null && (
                  <li>· Your unsaved changes above will be saved first.</li>
                )}
                <li>· The wording and the goals stop being editable.</li>
                <li>· {"The child's guardians will be able to read it."}</li>
                <li>
                  · Changing it afterwards means writing a new plan that
                  continues from this one.
                </li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={agree.isPending}
                  onClick={() => agree.mutate()}
                  className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {agree.isPending ? 'Agreeing…' : 'Yes, agree this plan'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingAgree(false)}
                  className="rounded-btn border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground"
                >
                  Not yet
                </button>
              </div>
            </div>
          )}

          {goals.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Add at least one area of concern first — a plan with no goals is
              not a plan.
            </p>
          )}
        </section>
      )}
    </div>
  )
}
