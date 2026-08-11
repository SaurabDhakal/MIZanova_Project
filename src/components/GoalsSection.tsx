import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchGoalPlanLinks,
  createGoal,
  fetchGoals,
  queryKeys,
  setGoalStatus,
  setMilestoneDone,
  type GoalCategory,
  type GoalStatus,
} from '../lib/api'
import GoalCard from './GoalCard'
import { GOAL_CATEGORY_LABEL } from '../lib/goalCategories'
import { EmptyState, ErrorState, LoadingCards } from './QueryState'
import FormField from './FormField'

/**
 * Staff view of a student's goals: create them, tick milestones, set status.
 *
 * The cards are the same component the parent sees. Ticking a milestone here
 * changes the percentage on the family's screen, because the database computes
 * it - there is no separate "what we tell the parent" number to keep in sync.
 */
export default function GoalsSection({ studentId }: { studentId: string }) {
  /* Which of these goals are serving an agreed plan. A failure here must not
     take the section down — the goals are still worth showing without their
     provenance — so it is read with `?.` and nothing else. */
  const links = useQuery({
    queryKey: queryKeys.goalPlanLinks(studentId),
    queryFn: () => fetchGoalPlanLinks(studentId),
  })

  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<GoalCategory>('social_communication')
  const [targetDate, setTargetDate] = useState('')
  const [milestoneText, setMilestoneText] = useState('')

  const goals = useQuery({
    queryKey: queryKeys.goals(studentId),
    queryFn: () => fetchGoals(studentId),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.goals(studentId) })

  const create = useMutation({
    mutationFn: () =>
      createGoal({
        studentId,
        title,
        description,
        category,
        targetDate: targetDate || null,
        milestones: milestoneText.split('\n'),
      }),
    onSuccess: async () => {
      setTitle('')
      setDescription('')
      setTargetDate('')
      setMilestoneText('')
      setOpen(false)
      await invalidate()
    },
  })

  const toggle = useMutation({
    mutationFn: ({ id, isDone }: { id: string; isDone: boolean }) =>
      setMilestoneDone(id, isDone),
    onSuccess: invalidate,
  })

  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: GoalStatus }) =>
      setGoalStatus(id, value),
    onSuccess: invalidate,
  })

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {/* RENAMED, because "Goals" beside an "Education plan" card that also
            contains goals is what made Saurab ask what the difference was.
            These are the working version: the day-to-day steps a teacher writes
            and ticks. The plan is the agreement. */}
        <h2 className="text-section text-foreground">Working towards</h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            + New goal
          </button>
        )}
      </div>

      <p className="mb-3 max-w-prose text-sm text-muted-foreground">
        The day-to-day steps, written and ticked by you. Separate from the
        education plan, which is what the school and family agreed at a meeting
        — a goal here can serve one, and says so when it does.
        Visible to this student&rsquo;s family exactly as you see it here.
        Ticking a milestone updates the percentage on their screen.
      </p>

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
          className="mb-5 space-y-4 rounded-card border border-border bg-card shadow-raised p-5"
        >
          {create.isError && (
            <p
              role="alert"
              className="rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
            >
              {create.error.message}
            </p>
          )}

          <FormField
            label="Goal name"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Social communication"
          />

          <div>
            <label
              htmlFor="goal-description"
              className="block text-sm font-semibold text-foreground"
            >
              The SMART statement
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              What the student will do, how often, and under what conditions -
              specific enough that two people would agree whether it happened.
            </p>
            <textarea
              id="goal-description"
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Will initiate social interaction with peers at least 3 times during unstructured recess, using visual prompts."
              className="mt-1.5 w-full rounded-btn border border-border bg-card p-3 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="goal-category"
                className="block text-sm font-semibold text-foreground"
              >
                Category
              </label>
              <select
                id="goal-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as GoalCategory)}
                className="mt-1.5 w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
              >
                {(Object.keys(GOAL_CATEGORY_LABEL) as GoalCategory[]).map(
                  (value) => (
                    <option key={value} value={value}>
                      {GOAL_CATEGORY_LABEL[value]}
                    </option>
                  ),
                )}
              </select>
            </div>

            <FormField
              label="Target date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="goal-milestones"
              className="block text-sm font-semibold text-foreground"
            >
              Milestones, one per line
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Progress is calculated from these. A goal with no milestones stays
              at 0% - the &ldquo;measurable&rdquo; in SMART lives here.
            </p>
            <textarea
              id="goal-milestones"
              rows={4}
              value={milestoneText}
              onChange={(e) => setMilestoneText(e.target.value)}
              placeholder={
                'Initiates once per week with an adult prompt\nInitiates twice per week unprompted\nSustains a two-minute exchange'
              }
              className="mt-1.5 w-full rounded-btn border border-border bg-card p-3 font-mono text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
            >
              {create.isPending ? 'Saving…' : 'Create goal'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {goals.isPending && <LoadingCards count={2} />}
      {goals.isError && (
        <ErrorState
          message={goals.error.message}
          onRetry={() => void goals.refetch()}
        />
      )}

      {goals.isSuccess && goals.data.length === 0 && !open && (
        <EmptyState
          title="No goals yet"
          detail="Create the first goal above. Whatever you write is what the family sees."
        />
      )}

      {goals.isSuccess && goals.data.length > 0 && (
        <ul className="grid gap-4 xl:grid-cols-2">
          {goals.data.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              planLink={links.data?.[goal.id]}
              canEdit
              busy={toggle.isPending || status.isPending}
              onToggleMilestone={(id, isDone) => toggle.mutate({ id, isDone })}
              onStatusChange={(value) => status.mutate({ id: goal.id, value })}
            />
          ))}
        </ul>
      )}

      {(toggle.isError || status.isError) && (
        <p role="alert" className="mt-2 text-sm text-danger-foreground">
          {(toggle.error ?? status.error)?.message}
        </p>
      )}
    </section>
  )
}
