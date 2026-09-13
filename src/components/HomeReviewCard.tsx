import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  queryKeys,
  reviewHomeStrategy,
  type PendingHomeStrategyRow,
} from '../lib/api'
import { showToast } from '../lib/toast'
import Icon from './Icon'

/**
 * One suggestion a FAMILY was given, waiting on a specialist — db/114.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * Saurab: "why cant i see the ai generated suggestion in the review queue".
 *
 * Because the queue only read `ai_strategies`. `/api/home-strategies` writes
 * anything under the bar to `home_ai_strategies` as `pending_review`, and the
 * family's screen tells them, in these words:
 *
 *     "One more suggestion has not been shown yet. Waiting for your child's
 *      specialist to look at it. You will see it here if they release it."
 *
 * No screen showed a specialist those rows. Three were already sitting in the
 * table. The product was asking families to wait on a review that could not
 * happen — and db/114 had already written every policy needed for it
 * (`home_ai_strategies_select_reviewer`, `home_ai_strategies_review`). The
 * permissions, the routing and the promise all existed; only the door was
 * missing.
 *
 * ---------------------------------------------------------------------------
 * DELIBERATELY NOT THE SAME CARD AS THE CLASSROOM ONE
 * ---------------------------------------------------------------------------
 * A shared card would have to drop whichever half the other path lacks:
 *
 *   - PROVENANCE IS THE FIRST THING SAID. This advice goes to a PARENT about
 *     their evening, not to a teacher about a lesson. Releasing it is a
 *     different act, to a different audience, so the button says "Release to
 *     the family" — a specialist who reads "Release to teacher" and presses it
 *     has been told the wrong thing about what they just did.
 *   - NO ABC. Nobody asks a family to code their evening into a vocabulary, so
 *     there is no antecedent, intensity or behaviour type. The parent's own
 *     words are the entire context, which is why they are shown in full rather
 *     than behind a disclosure the way a teacher's notes are.
 *   - `risk_flagged` GOES AT THE TOP. On the classroom path a flag is one
 *     consideration among several. Here it is frequently the reason a
 *     professional is being asked at all, and putting it under a confidence
 *     percentage would order the card by arithmetic instead of by concern.
 */
export default function HomeReviewCard({
  strategy,
}: {
  strategy: PendingHomeStrategyRow
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [releasing, setReleasing] = useState(false)

  const request = strategy.home_ai_requests
  const observation = request?.home_observations
  const confidencePct = Math.round(strategy.confidence * 100)

  const review = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') =>
      reviewHomeStrategy(strategy.id, decision, note),
    onSuccess: async (_data, decision) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.pendingHomeStrategies,
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.myReviewDecisions,
      })
      showToast(
        decision === 'approved'
          ? 'Released. The family can see it now.'
          : 'Declined. It stays off the family’s screen.',
      )
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  return (
    <li className="rounded-card border border-border bg-card p-5 shadow-raised">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-btn bg-brand-navy/10 px-2.5 py-1 text-xs font-semibold text-brand-navy">
          <Icon name="home" aria-hidden className="h-3.5 w-3.5" />
          Written at home by a parent
        </span>
        {/* The OBSERVATION came from a parent; the SUGGESTION came from the
            model. Two different authors on one card, and the badges say which
            is which — otherwise "written at home" could be read as the parent
            having written the advice too. */}
        <span className="inline-flex items-center gap-1.5 rounded-btn bg-accent-subtle px-2.5 py-1 text-xs font-semibold text-accent-foreground">
          <Icon name="ai" aria-hidden className="h-3.5 w-3.5" />
          Suggestion written by the AI
          {request?.model ? (
            <span className="font-normal">· {request.model}</span>
          ) : null}
        </span>
        {request?.risk_flagged && (
          <span className="rounded-btn bg-danger-subtle px-2.5 py-1 text-xs font-semibold text-danger-foreground">
            Flagged as needing a professional
          </span>
        )}
        <span
          className={`ml-auto rounded-btn px-2.5 py-1 text-sm font-semibold ${
            confidencePct >= 70
              ? 'bg-warning-subtle text-warning-foreground'
              : 'bg-danger-subtle text-danger-foreground'
          }`}
        >
          {confidencePct}% confidence
        </span>
      </div>

      <p className="mt-3 font-bold text-foreground">{strategy.title}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        For {request?.students?.display_name ?? 'a child'}
        {observation
          ? ` · ${new Date(observation.observed_on).toLocaleDateString(
              'en-AU',
              {
                day: 'numeric',
                month: 'short',
              },
            )}`
          : ''}
      </p>

      {request?.student_id && (
        <Link
          to={`/specialist/students/${request.student_id}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          Open their record
          <span aria-hidden>&nbsp;&rarr;</span>
          <span className="sr-only">(opens in a new tab)</span>
        </Link>
      )}

      {/* THE PARENT'S OWN WORDS, in full. There is no coded context on this
          path, so this is the only thing a reviewer can judge against. */}
      {observation && (
        <div className="mt-3 rounded-btn bg-background p-3">
          <p className="text-xs font-medium text-muted-foreground">
            What the family wrote
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {observation.title}
          </p>
          <p className="mt-1 text-sm text-foreground">{observation.body}</p>
        </div>
      )}

      {/* This said "They also asked: …" and printed `asked`, which is the
          redacted title and body joined together — the same evening the block
          above already shows in full. The family's words appeared twice on one
          card. What a reviewer cannot otherwise tell is how much was stripped
          before it left, so that is what is said instead. */}
      <p className="mt-2 text-xs text-muted-foreground">
        {request && request.redaction_count > 0
          ? `${request.redaction_count} name${
              request.redaction_count === 1 ? '' : 's'
            } or contact detail${
              request.redaction_count === 1 ? ' was' : 's were'
            } removed from the family's words before this was sent.`
          : 'Nothing in the family’s words needed removing before this was sent.'}
      </p>

      {strategy.routing_reason && (
        <p className="mt-3 rounded-btn bg-background p-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Held because:</span>{' '}
          {strategy.routing_reason}
        </p>
      )}

      <p className="mt-4 text-[0.9375rem] leading-relaxed text-foreground">
        {strategy.body}
      </p>

      {strategy.rationale.length > 0 && (
        <ul className="mt-3 space-y-1">
          {strategy.rationale.map((reason, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground">
              <Icon
                name="tick"
                aria-hidden
                className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground"
              />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <label
          htmlFor={`home-note-${strategy.id}`}
          className="text-sm font-semibold text-foreground"
        >
          Review note{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id={`home-note-${strategy.id}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why you released or declined this…"
          className="mt-1 w-full rounded-btn border border-border bg-card p-2 text-sm text-foreground placeholder:text-muted-foreground"
        />

        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setReleasing(true)
              review.mutate('approved')
            }}
            disabled={review.isPending}
            className="pressable min-h-11 rounded-btn bg-success-strong px-4 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {review.isPending && releasing
              ? 'Releasing…'
              : 'Release to the family'}
          </button>
          <button
            type="button"
            onClick={() => {
              setReleasing(false)
              review.mutate('rejected')
            }}
            disabled={review.isPending}
            className="pressable min-h-11 rounded-btn border border-border px-4 py-2.5 font-semibold text-foreground disabled:opacity-60"
          >
            {review.isPending && !releasing ? 'Declining…' : 'Decline'}
          </button>
        </div>
      </div>
    </li>
  )
}
