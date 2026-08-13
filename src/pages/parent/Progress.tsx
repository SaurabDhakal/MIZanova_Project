import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchGoals,
  fetchHomeObservations,
  queryKeys,
  type GoalCategory,
  type GoalRow,
} from '../../lib/api'
import { useSelectedChild } from '../../hooks/useMyChildren'
import ChildSwitcher from '../../components/ChildSwitcher'
import { GOAL_CATEGORY_LABEL } from '../../lib/goalCategories'
import { observationCategoryStyle } from '../../lib/observationCategories'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import NoChildYet from '../../components/NoChildYet'
import SessionsSection from '../../components/SessionsSection'

/**
 * Progress Highlights - docs/Figma Pages Design/Parent Progress Highlights.png.
 *
 * The design shows skill percentages against IEP goals, and a list of recent
 * breakthroughs. Both are built here from data that already exists: skill
 * progress is the goals grouped by category with the percentage the database
 * computes from ticked milestones, and highlights are milestones that were
 * actually completed plus what the family themselves wrote.
 *
 * TWO THINGS FROM THE DESIGN ARE DELIBERATELY ABSENT.
 *
 * There is no behaviour trend chart. A parent can only see behaviour logs a
 * teacher chose to share, so any trend drawn from them would be computed from a
 * deliberately partial sample — "incidents are down this month" might only mean
 * fewer were shared. A chart that looks like data but is not is worse than no
 * chart, particularly one a parent might act on.
 *
 * There is no "Download Report" button. PDF export is a later milestone, and a
 * button that does nothing is a promise broken every time it is pressed.
 */

type Highlight = {
  key: string
  when: string
  title: string
  detail: string
  source: 'school' | 'home'
  category: string
  className: string
}

function goalsByCategory(goals: GoalRow[]) {
  const grouped = new Map<GoalCategory, GoalRow[]>()
  for (const goal of goals) {
    grouped.set(goal.category, [...(grouped.get(goal.category) ?? []), goal])
  }
  return [...grouped.entries()]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function ParentProgress() {
  const { children, child, selectChild, isPending: childrenPending } =
    useSelectedChild()

  const goals = useQuery({
    queryKey: queryKeys.goals(child?.id ?? ''),
    queryFn: () => fetchGoals(child!.id),
    enabled: Boolean(child),
  })

  const observations = useQuery({
    queryKey: queryKeys.homeObservations(child?.id ?? ''),
    queryFn: () => fetchHomeObservations(child!.id),
    enabled: Boolean(child),
  })

  if (childrenPending) return <LoadingCards count={3} />

  if (!child) {
    return (
      <NoChildYet thing="Progress and goals" />
    )
  }

  const active = (goals.data ?? []).filter(
    (g) => g.status !== 'discontinued',
  )

  // Highlights: things that genuinely happened, from both sides.
  const highlights: Highlight[] = [
    ...(goals.data ?? []).flatMap((goal) =>
      goal.goal_milestones
        .filter((m) => m.is_done && m.done_at)
        .map((m) => ({
          key: m.id,
          when: m.done_at!,
          title: m.title,
          detail: `A step towards "${goal.title}".`,
          source: 'school' as const,
          category: GOAL_CATEGORY_LABEL[goal.category],
          className: 'bg-primary-subtle text-primary',
        })),
    ),
    ...(observations.data ?? []).map((o) => {
      const style = observationCategoryStyle(o.category)
      return {
        key: o.id,
        when: o.observed_on,
        title: o.title,
        detail: o.body,
        source: 'home' as const,
        category: style.label,
        className: style.className,
      }
    }),
  ].sort((a, b) => (a.when < b.when ? 1 : -1))

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">
          Progress highlights
        </h1>
        <p className="mt-1 text-muted-foreground">
          How {child.display_name} is tracking against the goals the school has
          set, and what has gone well recently.
        </p>
      </header>

      <ChildSwitcher children={children} child={child} onSelect={selectChild} />


      {/* --- Skill progress ------------------------------------------------ */}
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        Skill progress
      </h2>

      {goals.isPending && <LoadingCards count={3} />}
      {goals.isError && (
        <ErrorState
          message={goals.error.message}
          onRetry={() => void goals.refetch()}
        />
      )}

      {goals.isSuccess && active.length === 0 && (
        <EmptyState
          title="No goals set yet"
          detail="Once your child's teachers write goals, progress against each one appears here."
        />
      )}

      {active.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-3">
          {goalsByCategory(active).map(([category, categoryGoals]) => (
            <div
              key={category}
              className="rounded-card border border-border bg-card shadow-raised p-5"
            >
              <p className="font-bold text-foreground">
                {GOAL_CATEGORY_LABEL[category]}
              </p>

              <ul className="mt-4 space-y-4">
                {categoryGoals.map((goal) => {
                  const done = goal.goal_milestones.filter(
                    (m) => m.is_done,
                  ).length
                  return (
                    <li key={goal.id}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-foreground">
                          {goal.title}
                        </span>
                        <span className="shrink-0 font-bold text-primary">
                          {goal.progress_percent}%
                        </span>
                      </div>
                      <div
                        role="img"
                        aria-label={`${goal.title}: ${goal.progress_percent} percent complete`}
                        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-background"
                      >
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${goal.progress_percent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {goal.goal_milestones.length > 0
                          ? `${done} of ${goal.goal_milestones.length} steps complete`
                          : 'No steps recorded yet'}
                        {goal.target_date &&
                          ` · target ${new Date(goal.target_date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}`}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-sm text-muted-foreground">
        Percentages come from the steps your child&rsquo;s teachers have ticked
        off — the same figures they see.{' '}
        <Link
          to="/parent/goals"
          className="font-medium text-primary hover:underline"
        >
          See the full goals →
        </Link>
      </p>

      {/* --- Specialist sessions --------------------------------------------
          The family's only view of therapy sessions. Row-Level Security shows
          a guardian nothing but sessions explicitly shared with them, and
          never the clinical notes, which are a separate table.

          This section is why "Share with the family" means anything. Without
          it the switch set a flag the database honoured and no family screen
          rendered — the specialist was told the family could see it. */}
      <SessionsSection studentId={child.id} />

      {/* --- Recent highlights ---------------------------------------------- */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Recent highlights
      </h2>

      {highlights.length === 0 ? (
        <EmptyState
          title="Nothing to show yet"
          detail="Completed goal steps appear here, alongside the observations you share from home."
        />
      ) : (
        <ul className="space-y-3">
          {highlights.slice(0, 15).map((item) => (
            <li
              key={item.key}
              className="rounded-card border border-border bg-card shadow-raised p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-foreground">{item.title}</p>
                <span
                  className={`rounded-btn px-2 py-0.5 text-xs font-semibold uppercase ${item.className}`}
                >
                  {item.category}
                </span>
                <span className="ml-auto text-sm text-muted-foreground">
                  {item.source === 'home' ? 'From home' : 'At school'} ·{' '}
                  {formatDate(item.when)}
                </span>
              </div>
              <p className="mt-1 text-foreground">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 max-w-prose text-xs text-muted-foreground">
        This page shows goal progress and things that went well. It does not
        show a behaviour trend chart: you only see the behaviour logs a teacher
        has chosen to share with you, so a chart drawn from them could look like
        improvement when it only means fewer were shared. Ask your child&rsquo;s
        teacher for the full picture.
      </p>
    </div>
  )
}
