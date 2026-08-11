import type { GoalRow, GoalStatus } from '../lib/api'
import { GOAL_CATEGORY_LABEL, GOAL_STATUS_STYLE } from '../lib/goalCategories'
import Icon from './Icon'

/**
 * One goal, rendered the same for the parent who reads it and the staff who
 * manage it - docs/Figma Pages Design/Parent Goals & IEP.png.
 *
 * `canEdit` adds milestone checkboxes and status controls for staff. The parent
 * sees exactly the same numbers with no controls, which is the point: nobody
 * should be able to wonder whether the family is being shown a different
 * version of the plan.
 */
export default function GoalCard({
  goal,
  planLink,
  canEdit = false,
  onToggleMilestone,
  onStatusChange,
  busy = false,
}: {
  goal: GoalRow
  /**
   * Set when this goal serves an area of concern on an agreed education plan.
   *
   * Undefined is a legitimate state, not a gap: a child with no plan still has
   * goals, which is why working goals were kept independent of plans rather
   * than folded under them.
   */
  planLink?: { area: string; planId: string }
  canEdit?: boolean
  onToggleMilestone?: (milestoneId: string, isDone: boolean) => void
  onStatusChange?: (status: GoalStatus) => void
  busy?: boolean
}) {
  const status = GOAL_STATUS_STYLE[goal.status]
  const done = goal.goal_milestones.filter((m) => m.is_done).length

  return (
    <li className="rounded-card border border-border bg-card shadow-raised p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <p className="font-bold text-foreground">{goal.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {GOAL_CATEGORY_LABEL[goal.category]}
            {goal.target_date &&
              ` · Target: ${new Date(goal.target_date).toLocaleDateString(
                'en-AU',
                { month: 'long', year: 'numeric' },
              )}`}
          </p>
        </div>
        <span className={`ml-auto text-sm font-semibold ${status.className}`}>
          {status.label}
        </span>
      </div>

      {/* SAYS WHERE IT CAME FROM. Without this a teacher sees "Working towards"
          and an "Education plan" card and has to guess whether they are the
          same thing — which is exactly what Saurab asked. */}
      {planLink && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-btn bg-primary-subtle px-2 py-0.5 text-xs font-semibold text-primary">
          <Icon name="compliance" className="h-3.5 w-3.5" />
          Education plan · {planLink.area}
        </p>
      )}

      <p className="mt-3 text-foreground">{goal.description}</p>

      {/* --- Progress ------------------------------------------------------ */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-muted-foreground">Progress</span>
          <span className="font-bold text-primary">
            {goal.progress_percent}%
          </span>
        </div>
        {/* role="img" with a label: a bare coloured div means nothing to a
            screen reader, and the number beside it is the real information. */}
        <div
          role="img"
          aria-label={`Progress: ${goal.progress_percent} percent`}
          className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-background"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${goal.progress_percent}%` }}
          />
        </div>
        {goal.goal_milestones.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {done} of {goal.goal_milestones.length} milestones complete
          </p>
        )}
      </div>

      {/* --- Milestones ---------------------------------------------------- */}
      {goal.goal_milestones.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
          {goal.goal_milestones.map((milestone) => (
            <li key={milestone.id}>
              {canEdit ? (
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={milestone.is_done}
                    disabled={busy}
                    onChange={(e) =>
                      onToggleMilestone?.(milestone.id, e.target.checked)
                    }
                    className="mt-0.5"
                  />
                  <span
                    className={
                      milestone.is_done
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground'
                    }
                  >
                    {milestone.title}
                  </span>
                </label>
              ) : (
                <p className="flex items-start gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className={
                      milestone.is_done
                        ? 'text-success-foreground'
                        : 'text-muted-foreground'
                    }
                  >
                    {milestone.is_done ? '✓' : '○'}
                  </span>
                  <span
                    className={
                      milestone.is_done
                        ? 'text-muted-foreground'
                        : 'text-foreground'
                    }
                  >
                    {milestone.title}
                    <span className="sr-only">
                      {milestone.is_done
                        ? ' - complete'
                        : ' - not yet complete'}
                    </span>
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && onStatusChange && (
        <div className="mt-4 border-t border-border pt-3">
          <label
            htmlFor={`status-${goal.id}`}
            className="text-sm font-medium text-muted-foreground"
          >
            Status
          </label>
          <select
            id={`status-${goal.id}`}
            value={goal.status}
            disabled={busy}
            onChange={(e) => onStatusChange(e.target.value as GoalStatus)}
            className="mt-1 ml-2 rounded-btn border border-border bg-card px-2 py-1.5 text-sm text-foreground"
          >
            {(Object.keys(GOAL_STATUS_STYLE) as GoalStatus[]).map((value) => (
              <option key={value} value={value}>
                {GOAL_STATUS_STYLE[value].label}
              </option>
            ))}
          </select>
        </div>
      )}
    </li>
  )
}
