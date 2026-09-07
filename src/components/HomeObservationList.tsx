import { observationCategoryStyle } from '../lib/observationCategories'
import type { HomeAiRequestRow, HomeObservationRow } from '../lib/api'
import HomeStrategiesPanel from './HomeStrategiesPanel'

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
  viewerId,
  onEdit,
  answers,
}: {
  observations: HomeObservationRow[]
  /*
   * WHO IS READING, so the list can tell "you wrote this" from "the other
   * parent did". A child usually has two guardians and both write here, and
   * without this the list rendered a co-parent's account of an evening as
   * though the reader had written it themselves.
   *
   * Undefined means the reader is not one of the authors — the staff case —
   * and every row is then attributed, which is what a teacher needs anyway.
   */
  viewerId?: string
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
   *
   * It is now offered per ROW rather than per list: db/007's update policy is
   * `logged_by = auth.uid()`, so offering it on a co-parent's observation was
   * a control the database was always going to refuse. The refusal was honest
   * when it came — `assertChanged` caught it — but it arrived as "your account
   * does not have permission for this record", which reads like a fault in the
   * account rather than the plain fact that somebody else wrote it.
   */
  onEdit?: (observation: HomeObservationRow) => void
  /*
   * WHAT THE AI SAID ABOUT EACH ONE — db/114. Absent on the staff screens,
   * which is why it is a prop rather than a query inside this component: the
   * suggestions belong to the family's side of the conversation, and a list
   * that fetched them itself would try to on a teacher's roster too.
   */
  answers?: HomeAiRequestRow[]
}) {
  return (
    <ul className="space-y-3">
      {observations.map((observation) => {
        const style = observationCategoryStyle(observation.category)
        const date = new Date(observation.observed_on)
        const isMine = Boolean(viewerId) && observation.logged_by === viewerId
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
              {!isMine && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Written by {observation.author?.full_name ?? 'someone at home'}
                </p>
              )}
              {answers && (
                <HomeStrategiesPanel
                  observationId={observation.id}
                  answer={answers.find((a) => a.observation_id === observation.id)}
                  canAsk={isMine}
                />
              )}
              {onEdit && isMine && (
                <button
                  type="button"
                  onClick={() => onEdit(observation)}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
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
