import type { ObservationCategory } from './api'

/**
 * The home-observation categories, taken from the chart on
 * docs/Figma Pages Design/Parent Home Observations.png.
 *
 * Data only, in its own file, because both the parent's write form and the
 * educator's read view need it — and because a file that exports both a
 * component and a constant breaks React Fast Refresh.
 */
export const OBSERVATION_CATEGORIES: {
  value: ObservationCategory
  label: string
  className: string
}[] = [
  {
    value: 'social_emotional',
    label: 'Social & emotional',
    className: 'bg-success-subtle text-success-foreground',
  },
  {
    value: 'language',
    label: 'Language',
    className: 'bg-primary-subtle text-primary',
  },
  {
    value: 'motor',
    label: 'Motor',
    className: 'bg-accent-subtle text-accent-foreground',
  },
  {
    value: 'sensory',
    label: 'Sensory',
    className: 'bg-warning-subtle text-warning-foreground',
  },
  {
    value: 'cognitive',
    label: 'Cognitive',
    className: 'bg-danger-subtle text-danger-foreground',
  },
  {
    value: 'other',
    label: 'Other',
    className: 'bg-background text-muted-foreground',
  },
]

export function observationCategoryStyle(value: ObservationCategory) {
  return (
    OBSERVATION_CATEGORIES.find((c) => c.value === value) ??
    OBSERVATION_CATEGORIES[5]
  )
}
