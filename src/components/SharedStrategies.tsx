import type { StrategyRow } from '../lib/api'

/**
 * The advice attached to an incident a teacher shared with the family — db/113.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT StrategyPanel
 * ---------------------------------------------------------------------------
 * StrategyPanel is a working surface: it asks the model, reports what was held
 * back and what was rejected, counts redactions, and offers "flag this" so a
 * teacher can send a suggestion for specialist review. Every one of those is a
 * staff action, and several of them describe states db/113 deliberately keeps
 * from a family — a held suggestion is invisible to them by policy, so a panel
 * that says "1 held for review" would be reporting on something they are not
 * allowed to see.
 *
 * This renders only what arrived, and says where it came from. Nothing here
 * can be pressed.
 *
 * ---------------------------------------------------------------------------
 * IT SAYS WHOSE ADVICE THIS IS, BECAUSE IT IS NOT THE FAMILY'S
 * ---------------------------------------------------------------------------
 * This shipped for ten minutes headed "What can help at home", and the first
 * real answer under it read "put the next activity on the whiteboard" and
 * "whole-class practice, so no individual singling out". These come from
 * `generateStrategies`, whose system prompt writes to a teacher about a room
 * full of children — the heading was promising a family something the words
 * underneath could not possibly deliver, and a parent with no whiteboard would
 * conclude the product does not know what a home is.
 *
 * It is still worth showing. Knowing the teacher gives staged warnings before
 * a transition is exactly the consistency between home and school the brief
 * asks for, and a parent can carry the principle across even when the specific
 * action is classroom-shaped. It just has to say what it is, and point at the
 * place that answers the other question — db/114's "What could we try?" on
 * Home Observations, which asks a prompt written for a kitchen.
 *
 * ---------------------------------------------------------------------------
 * IT SAYS "AI" RATHER THAN HIDING IT
 * ---------------------------------------------------------------------------
 * The Library carries an article for families called "What the AI sees, and
 * what it never sees", and the public pages say the product never diagnoses.
 * Presenting a machine suggestion as though the teacher wrote it would make
 * all of that false at the one moment it matters.
 */
export default function SharedStrategies({
  strategies,
}: {
  strategies: StrategyRow[]
}) {
  if (strategies.length === 0) return null

  return (
    <div className="mt-3 rounded-card bg-background p-4">
      <h3 className="text-sm font-semibold text-foreground">
        What the school is trying
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Classroom strategies for your child’s teacher, shared so you know what
        is being used at school.
      </p>

      <ul className="mt-2 space-y-3">
        {strategies.map((strategy) => (
          <li key={strategy.id}>
            <p className="font-semibold text-foreground">{strategy.title}</p>
            <p className="mt-0.5 text-sm text-foreground">{strategy.body}</p>
            {strategy.rationale.length > 0 && (
              <>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  Why this works:
                </p>
                <ul className="mt-0.5 list-disc pl-5 text-sm text-muted-foreground">
                  {strategy.rationale.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm text-muted-foreground">
        Suggested by MiZanova’s assistant from an anonymised description of what
        happened — no names or contact details are sent — and shown to you only
        after the school settled it. Written for a classroom, so some of it will
        not transfer to a weekday evening: for something to try at home, write
        what happened on Home Observations and ask there. Not clinical advice
        or a diagnosis.
      </p>
    </div>
  )
}
