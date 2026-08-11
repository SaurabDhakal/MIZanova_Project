import type { GoalCategory, GoalStatus } from './api'

/**
 * Goal labels and status styling.
 *
 * In their own file because both GoalCard and GoalsSection need them, and a
 * file that exports a component alongside a constant breaks React Fast
 * Refresh — the same reason observationCategories.ts exists.
 */
export const GOAL_CATEGORY_LABEL: Record<GoalCategory, string> = {
  social_communication: 'Social communication',
  emotional_regulation: 'Emotional regulation',
  motor_skills: 'Motor skills',
  literacy: 'Literacy & reading',
  numeracy: 'Numeracy',
  self_care: 'Self care',
  other: 'Other',
}

export const GOAL_STATUS_STYLE: Record<
  GoalStatus,
  { label: string; className: string }
> = {
  not_started: { label: 'Not started', className: 'text-muted-foreground' },
  on_track: { label: 'On track', className: 'text-success-foreground' },
  needs_review: { label: 'Needs review', className: 'text-warning-foreground' },
  achieved: { label: 'Achieved', className: 'text-success-foreground' },
  discontinued: { label: 'Discontinued', className: 'text-muted-foreground' },
}
