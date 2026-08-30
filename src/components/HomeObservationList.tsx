import { observationCategoryStyle } from '../lib/observationCategories'
import type { HomeObservationRow } from '../lib/api'

/**
 * Home observations, rendered identically for the parent who wrote them and
 * the staff who read them.
 *
 * Shared on purpose. If each role had its own renderer, they would drift, and
 * the parent would end up unsure whether what the school sees matches what
 * they wrote. For a channel whose whole value is trust, that matters.
 */
export default function HomeObservationList({
  observations,
  onEdit,
}: {
  observations: HomeObservationRow[]
  /*
   * OPT-IN, AND ABSENT MEANS NO CONTROL.
   *
   * db/007 is explicit that staff may not edit a parent's observation:
   * "altering someone else's account of their own child is not a power the
   * school should have." Only the parent screen uses this list today, so the
   * control could simply have been rendered — but a list component that grows
   * an edit button by default is one staff screen away from offering the
   * school something the database will refuse and the migration forbids.
   * Passing the handler is a deliberate act; not passing it is the safe
   * default.
   */
  onEdit?: (observation: HomeObservationRow) => void
}) {
  return (
    <ul className="space-y-3">
      {observations.map((observation) => {
        const style = observationCategoryStyle(observation.category)
        const date = new Date(observation.observed_on)
        return (
          <li
            key={observation.id}
            className="rounded-card border border-border bg-card shadow-raised p-4 sm:flex sm:gap-4"
          >
            <div className="mb-2 shrink-0 rounded-btn bg-background px-3 py-2 text-center sm:mb-0">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {date.toLocaleDateString('en-AU', { month: 'short' })}
              </p>
              <p className="text-xl font-bold text-foreground">
                {date.getDate()}
              </p>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-foreground">{observation.title}</p>
                <span
                  className={`rounded-btn px-2 py-0.5 text-xs font-semibold uppercase ${style.className}`}
                >
                  {style.label}
                </span>
              </div>
              <p className="mt-1 text-foreground">{observation.body}</p>
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(observation)}
                  className="mt-2 text-sm font-semibold text-primary hover:underline"
                >
                  Correct this
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
