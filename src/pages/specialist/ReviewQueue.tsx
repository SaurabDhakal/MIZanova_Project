import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchPendingStrategies,
  queryKeys,
  reviewStrategy,
  type PendingStrategyRow,
} from '../../lib/api'
import { EmptyState, ErrorState } from '../../components/QueryState'

/**
 * The human gate (FR10).
 *
 * Every suggestion here was withheld from a teacher because the model was not
 * confident enough, or because it asked for oversight. Until someone acts on
 * this screen, those suggestions do not exist as far as any teacher is
 * concerned — that is the whole point of routing, and it only means something
 * if this queue is actually worked.
 *
 * Approving sets status to 'approved', which is in the teacher's select policy.
 * Rejecting sets 'rejected', which is not — so a rejected suggestion simply
 * never appears anywhere. No separate hiding logic, no chance of it leaking
 * back through a query someone forgets to filter.
 */

const TYPE_LABEL: Record<string, string> = {
  disruptive: 'Disruptive',
  withdrawn: 'Withdrawn',
  emotional: 'Emotional',
  physical: 'Physical',
}

function ReviewCard({ strategy }: { strategy: PendingStrategyRow }) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [showSent, setShowSent] = useState(false)

  const review = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') =>
      reviewStrategy(strategy.id, decision, note),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingStrategies }),
  })

  const log = strategy.behaviour_logs
  const confidencePct = Math.round(strategy.confidence * 100)

  return (
    <li className="rounded-card border border-border bg-card shadow-raised p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <p className="font-bold text-foreground">{strategy.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            For {strategy.students?.display_name ?? 'a student'}
            {log && (
              <>
                {' · '}
                {TYPE_LABEL[log.behaviour_type] ?? log.behaviour_type}
                {' · '}
                {log.intensity} intensity
              </>
            )}
          </p>
        </div>
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

      {strategy.routing_reason && (
        <p className="mt-3 rounded-btn bg-background p-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Held because:</span>{' '}
          {strategy.routing_reason}
        </p>
      )}

      <p className="mt-3 border-l-4 border-accent pl-3 text-foreground">
        {strategy.body}
      </p>

      {strategy.rationale.length > 0 && (
        <ul className="mt-3 space-y-1">
          {strategy.rationale.map((reason, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground">
              <span aria-hidden="true" className="text-success-foreground">
                ✓
              </span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}

      {/* The specialist IS entitled to the original notes — they are assigned
          to this student. Showing them matters: judging a suggestion without
          the observation behind it is guesswork. */}
      {log?.notes && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            Original observation notes
          </summary>
          <p className="mt-2 rounded-btn bg-background p-3 text-sm text-foreground">
            {log.notes}
          </p>
        </details>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-medium text-primary">
          Exactly what was sent to the AI
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-btn bg-background p-3 text-xs text-muted-foreground">
          {(() => {
            try {
              return JSON.stringify(JSON.parse(strategy.anonymised_input), null, 2)
            } catch {
              return strategy.anonymised_input
            }
          })()}
        </pre>
        <p className="mt-1 text-xs text-muted-foreground">
          Stored so the anonymisation claim can be checked, not just trusted.
        </p>
      </details>

      <div className="mt-4 border-t border-border pt-3">
        <label
          htmlFor={`note-${strategy.id}`}
          className="text-sm font-semibold text-foreground"
        >
          Review note{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id={`note-${strategy.id}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why you released or rejected this…"
          className="mt-1 w-full rounded-btn border border-border bg-card p-2 text-sm text-foreground placeholder:text-muted-foreground"
        />

        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setShowSent(true)
              review.mutate('approved')
            }}
            disabled={review.isPending}
            className="rounded-btn bg-success-strong px-4 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {review.isPending && showSent ? 'Releasing…' : 'Release to teacher'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSent(false)
              review.mutate('rejected')
            }}
            disabled={review.isPending}
            className="rounded-btn border border-danger px-4 py-2.5 font-semibold text-danger-foreground disabled:opacity-60"
          >
            Reject
          </button>
        </div>

        {review.isError && (
          <p role="alert" className="mt-2 text-sm text-danger-foreground">
            {review.error.message}
          </p>
        )}
      </div>
    </li>
  )
}

export default function ReviewQueue() {
  const pending = useQuery({
    queryKey: queryKeys.pendingStrategies,
    queryFn: fetchPendingStrategies,
  })

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Review queue</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          AI suggestions held back before any teacher saw them. Nothing here
          reaches a classroom until you release it.
        </p>
      </header>

      {pending.isPending && (
        <div
          role="status"
          aria-label="Loading review queue"
          className="h-40 animate-pulse rounded-card border border-border bg-card shadow-raised"
        />
      )}

      {pending.isError && (
        <ErrorState
          message={pending.error.message}
          onRetry={() => void pending.refetch()}
        />
      )}

      {pending.isSuccess && pending.data.length === 0 && (
        <EmptyState
          title="Nothing waiting for review"
          detail="Suggestions appear here when the model is not confident enough, or when it asks for specialist oversight. An empty queue means every suggestion so far cleared the threshold on its own."
        />
      )}

      {pending.isSuccess && pending.data.length > 0 && (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {pending.data.length} suggestion
            {pending.data.length === 1 ? '' : 's'} waiting, oldest first.
          </p>
          <ul className="space-y-4">
            {pending.data.map((strategy) => (
              <ReviewCard key={strategy.id} strategy={strategy} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
