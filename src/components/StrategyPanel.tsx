import { useState } from 'react'
import Icon from './Icon'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  flagStrategyForReview,
  queryKeys,
  recordStrategyFeedback,
  requestStrategies,
  type LogStrategyStatus,
  type StrategyRow,
} from '../lib/api'

/**
 * AI strategy suggestions for one behaviour log.
 * Built from docs/Figma Pages Design/Privacy-First Strategy Coach.png.
 *
 * The privacy notice at the bottom is not decoration. It states what the system
 * actually does — no student PII reaches the AI, no clinical advice, and a
 * route to a human specialist — and every one of those claims is enforced
 * somewhere real: server/anonymise.js, the system prompt in server/claude.js,
 * and the pending_review routing in db/006_ai_strategies.sql.
 */
export default function StrategyPanel({
  logId,
  studentId,
  strategies,
  status,
}: {
  logId: string
  studentId: string
  strategies: StrategyRow[]
  /**
   * What happened to this log's suggestions, including the ones RLS hides from
   * a teacher. Undefined while it loads.
   */
  status?: LogStrategyStatus
}) {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  // Kept separate from `notice` on purpose: a safeguarding flag is about the
  // incident and must not be buried in a sentence about AI routing.
  const [safeguarding, setSafeguarding] = useState(false)

  const generate = useMutation({
    mutationFn: () => requestStrategies(logId),
    onSuccess: async (result) => {
      setNotice(
        [
          result.heldForReview > 0
            ? `${result.heldForReview} suggestion${result.heldForReview === 1 ? '' : 's'} went to a specialist for review — either the model was not confident enough, or it asked for oversight.`
            : null,
          result.strategies.length === 0 && result.heldForReview > 0
            ? 'Nothing is shown here because every suggestion is with a specialist. They will release or replace them.'
            : null,
          result.alreadyGenerated
            ? 'Showing the suggestions already generated for this log — no new request was made.'
            : `${result.redactions} identifier${result.redactions === 1 ? '' : 's'} removed before the request was sent.`,
        ]
          .filter(Boolean)
          .join(' '),
      )
      setSafeguarding(result.riskFlagged)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.studentStrategies(studentId),
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.studentLogs(studentId),
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.strategyStatus(studentId),
      })
    },
  })

  const feedback = useMutation({
    mutationFn: ({
      strategyId,
      action,
    }: {
      strategyId: string
      action: 'applied' | 'dismissed'
    }) => recordStrategyFeedback(strategyId, action),
    onSuccess: (_data, variables) =>
      setNotice(
        variables.action === 'applied'
          ? 'Recorded that you tried this strategy.'
          : 'Recorded that this was not useful.',
      ),
  })

  // Flagging is not feedback. It sends the suggestion back to a specialist and
  // removes it from this screen, so it invalidates the list rather than just
  // showing a message.
  const flag = useMutation({
    mutationFn: (strategyId: string) => flagStrategyForReview(strategyId),
    onSuccess: async () => {
      setNotice(
        'Sent to a specialist for review. It has been removed from your suggestions until they respond.',
      )
      await queryClient.invalidateQueries({
        queryKey: queryKeys.studentStrategies(studentId),
      })
    },
  })

  const safeguardingBanner = safeguarding ? (
    <div
      role="status"
      className="mt-3 rounded-card border border-danger bg-danger-subtle p-3"
    >
      <p className="text-sm font-semibold text-danger-foreground">
        Flagged for safeguarding review
      </p>
      <p className="mt-1 text-sm text-danger-foreground">
        This observation has been sent to your school&rsquo;s safeguarding
        queue. That is separate from the strategies below — you can still act on
        them now.
      </p>
    </div>
  ) : null

  if (strategies.length === 0) {
    // Three different reasons this can be empty, and they are not
    // interchangeable. Before, all three drew the same bare button — so a
    // teacher whose suggestions had been rejected saw no sign it had ever
    // happened, pressed the button again, and was told to wait for a
    // specialist who had already decided.
    const pending = status?.pending ?? 0
    const rejected = status?.rejected ?? 0

    return (
      <div className="mt-3 border-t border-border pt-3">
        {pending > 0 ? (
          <div className="rounded-card border border-warning bg-warning-subtle p-3">
            <p className="text-sm font-semibold text-warning-foreground">
              {pending} suggestion{pending === 1 ? '' : 's'} with a specialist
            </p>
            <p className="mt-1 text-sm text-warning-foreground">
              They will appear here if the specialist releases them. You do not
              need to do anything.
            </p>
          </div>
        ) : rejected > 0 ? (
          <div className="rounded-card border border-border bg-background p-3">
            <p className="text-sm font-semibold text-foreground">
              A specialist reviewed the earlier suggestions and did not release
              them
            </p>
            {status?.reviewNote ? (
              <p className="mt-1 text-sm text-foreground">
                Their note: &ldquo;{status.reviewNote}&rdquo;
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                They did not leave a note.
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              You can ask for a fresh set. It is the same model reading the same
              observation, so expect similar advice — if it was rejected because
              it is wrong for this child, message the specialist instead.
            </p>
            <button
              type="button"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              className="mt-3 rounded-btn bg-accent-subtle px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
            >
              {generate.isPending ? 'Thinking…' : 'Ask for new suggestions'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="rounded-btn bg-accent-subtle px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon name="ai" className="h-4 w-4" />
              {generate.isPending ? 'Thinking…' : 'Suggest classroom strategies'}
            </span>
          </button>
        )}

        {generate.isError && (
          <p role="alert" className="mt-2 text-sm text-danger-foreground">
            {generate.error.message}
          </p>
        )}
        {notice && !generate.isError && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        {safeguardingBanner}
      </div>
    )
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-semibold tracking-wide text-accent-foreground uppercase">
        Recommended interventions
      </p>

      {notice && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {safeguardingBanner}

      <ul className="mt-2 space-y-3">
        {strategies.map((strategy) => (
          <li
            key={strategy.id}
            className="rounded-card border border-border bg-background p-4"
          >
            <p className="font-bold text-foreground">{strategy.title}</p>

            {/* The quoted block from the design — the actual instruction. */}
            <p className="mt-2 border-l-4 border-accent pl-3 text-foreground">
              {strategy.body}
            </p>

            {strategy.rationale.length > 0 && (
              <>
                <p className="mt-3 text-sm font-semibold text-foreground">
                  Why this works:
                </p>
                <ul className="mt-1 space-y-1">
                  {strategy.rationale.map((reason, i) => (
                    <li key={i} className="flex gap-2 text-sm text-foreground">
                      <Icon
                        name="tick"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-foreground"
                      />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* A QUIET ACTION ROW, from the generator reference in
                docs/log inspiration: small actions sitting under each output
                rather than three competing calls to action. Three suggestions
                used to mean nine chunky buttons — one of them primary blue, one
                danger-outlined — which made the panel shout louder than the
                advice inside it.

                "Applied" keeps the only fill, because it is the one that says
                something happened in a classroom. */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() =>
                  feedback.mutate({ strategyId: strategy.id, action: 'applied' })
                }
                disabled={feedback.isPending}
                className="inline-flex items-center gap-1.5 rounded-btn bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Icon name="tick" className="h-4 w-4" />
                Applied
              </button>
              <button
                type="button"
                onClick={() =>
                  feedback.mutate({
                    strategyId: strategy.id,
                    action: 'dismissed',
                  })
                }
                disabled={feedback.isPending}
                className="inline-flex items-center gap-1.5 rounded-btn px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-background disabled:opacity-60"
              >
                <Icon name="cross" className="h-4 w-4" />
                Not useful
              </button>
              <button
                type="button"
                onClick={() => flag.mutate(strategy.id)}
                disabled={flag.isPending}
                className="ml-auto inline-flex items-center gap-1.5 rounded-btn px-2.5 py-1.5 text-sm font-medium text-danger-foreground hover:bg-danger-subtle disabled:opacity-60"
              >
                <Icon name="flag" className="h-4 w-4" />
                {flag.isPending ? 'Sending…' : 'Flag'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Errors were never rendered for these mutations, so a failure looked
          identical to a button that did nothing. */}
      {(flag.isError || feedback.isError) && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger-foreground">
          {(flag.error ?? feedback.error)?.message}
        </p>
      )}

      <div className="mt-3 rounded-card bg-background p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon name="privacy" className="h-4 w-4 text-muted-foreground" />
          Privacy and compliance notice
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          These are general strategies for observed classroom behaviour. The AI
          receives no student names or identifying details, and cannot provide
          clinical advice or a diagnosis. If an intervention is not working,
          flag it to request a personalised review from your school specialist.
        </p>
      </div>
    </div>
  )
}
