import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAiControlEvents,
  fetchAiControls,
  fetchStrategyConfidence,
  queryKeys,
  updateAiControls,
} from '../../lib/api'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import ConfidenceHistogram from '../../components/ConfidenceHistogram'
import PageHeader from '../../components/PageHeader'

/**
 * AI governance - the honest replacement for the Figma MLOps screen.
 *
 * That design shows "Global Prediction Accuracy 94.2%", a "Deploy New Model"
 * button, model version history and an algorithmic bias monitor across
 * demographic cohorts. None of it can be built truthfully here: MiZanova calls
 * a hosted model rather than training one, and deliberately collects no
 * demographic data, so a bias monitor would have nothing to monitor and an
 * accuracy figure would be invented.
 *
 * What a Platform Admin can genuinely exercise is on this page instead: stop
 * the AI entirely, change how cautious the routing is, and read who changed
 * what and why. Every change demands a written reason, enforced by a database
 * trigger rather than by this form.
 */
export default function AiGovernance() {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [threshold, setThreshold] = useState<number | null>(null)

  const controls = useQuery({
    queryKey: queryKeys.aiControls,
    queryFn: fetchAiControls,
  })

  const events = useQuery({
    queryKey: queryKeys.aiControlEvents,
    queryFn: fetchAiControlEvents,
  })

  const confidence = useQuery({
    queryKey: queryKeys.strategyConfidence,
    queryFn: fetchStrategyConfidence,
  })

  const save = useMutation({
    mutationFn: (input: { aiEnabled: boolean; confidenceThreshold: number }) =>
      updateAiControls({ ...input, reason }),
    onSuccess: async () => {
      setReason('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.aiControls }),
        queryClient.invalidateQueries({ queryKey: queryKeys.aiControlEvents }),
      ])
    },
  })

  if (controls.isPending) return <LoadingCards count={2} />
  if (controls.isError) return <ErrorState message={controls.error.message} />

  const current = controls.data
  if (!current) return <ErrorState message="AI controls row is missing." />

  const pendingThreshold = threshold ?? current.confidence_threshold
  const reasonGiven = reason.trim() !== ''

  return (
    <div>
      <PageHeader
        title="AI governance"
        lead="Controls that actually do something — every change is recorded against your name."
      />

      {/* --- Reason first, on purpose ------------------------------------- */}
      {/* Above the controls rather than below them: you write down why before
          you act, not after. The database refuses the change without it. */}
      <div className="rounded-card border border-border bg-card shadow-raised p-5">
        <label
          htmlFor="change-reason"
          className="block font-semibold text-foreground"
        >
          Why are you making this change?
        </label>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Required. Recorded permanently against your account.
        </p>
        <textarea
          id="change-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Raising the threshold after three low-quality suggestions were reported this week."
          className="mt-2 w-full rounded-btn border border-border bg-card p-3 text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* --- Kill switch --------------------------------------------------- */}
      <div
        className={`mt-5 rounded-card border p-5 ${
          current.ai_enabled
            ? 'border-border bg-card'
            : 'border-danger bg-danger-subtle'
        }`}
      >
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0">
            <p className="font-bold text-foreground">
              AI strategy generation is{' '}
              {current.ai_enabled ? 'ON' : 'OFF'}
            </p>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {current.ai_enabled
                ? 'Teachers can request strategies. Turning this off stops all generation immediately, across every school.'
                : 'No strategies can be generated anywhere. Teachers see an explanation and are directed to their specialist.'}
            </p>
          </div>

          <button
            type="button"
            disabled={!reasonGiven || save.isPending}
            onClick={() =>
              save.mutate({
                aiEnabled: !current.ai_enabled,
                confidenceThreshold: current.confidence_threshold,
              })
            }
            className={`ml-auto rounded-btn px-4 py-2.5 font-semibold disabled:opacity-50 ${
              current.ai_enabled
                ? 'border border-danger text-danger-foreground'
                : 'bg-success-strong text-white'
            }`}
          >
            {current.ai_enabled ? 'Turn AI off' : 'Turn AI back on'}
          </button>
        </div>
      </div>

      {/* --- Confidence threshold ------------------------------------------ */}
      <div className="mt-5 rounded-card border border-border bg-card shadow-raised p-5">
        <label
          htmlFor="threshold"
          className="block font-semibold text-foreground"
        >
          Routing threshold: {Math.round(pendingThreshold * 100)}%
        </label>
        <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
          Suggestions the model scores below this go to a specialist instead of
          straight to a teacher. Higher means more caution and more review work;
          lower means faster help and less oversight.
        </p>

        <input
          id="threshold"
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(pendingThreshold * 100)}
          onChange={(e) => setThreshold(Number(e.target.value) / 100)}
          className="mt-3 w-full max-w-md"
        />

        {pendingThreshold !== current.confidence_threshold && (
          <button
            type="button"
            disabled={!reasonGiven || save.isPending}
            onClick={() =>
              save.mutate({
                aiEnabled: current.ai_enabled,
                confidenceThreshold: pendingThreshold,
              })
            }
            className="mt-3 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
          >
            {save.isPending
              ? 'Saving…'
              : `Change to ${Math.round(pendingThreshold * 100)}%`}
          </button>
        )}
      </div>

      {!reasonGiven && (
        <p className="mt-3 text-sm text-muted-foreground">
          Write a reason above to enable these controls.
        </p>
      )}

      {save.isError && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger-foreground">
          {save.error.message}
        </p>
      )}

      {/* --- What the threshold is actually doing ---------------------------- */}
      {/* Under the control rather than beside it: you change the number above,
          and the shape it produces is the next thing you see. */}
      <h2 className="mt-10 mb-1 text-lg font-semibold text-foreground">
        Where the suggestions are landing
      </h2>
      <p className="mb-3 max-w-prose text-sm text-muted-foreground">
        Every suggestion the model has produced, by how confident it was. The
        threshold above is the line between a teacher seeing it and a specialist
        holding it.
      </p>

      {confidence.isError && <ErrorState message={confidence.error.message} />}

      {confidence.isSuccess && confidence.data.length === 0 && (
        <p className="rounded-card border border-border bg-card shadow-raised p-5 text-sm text-muted-foreground">
          No suggestions have been generated yet, so there is no distribution to
          draw. This fills in the first time a teacher asks for strategies.
        </p>
      )}

      {/* isSuccess and non-empty only. An empty chart is a picture of a flat
          distribution, which is a claim nobody made. */}
      {confidence.isSuccess && confidence.data.length > 0 && (
        <div className="rounded-card border border-border bg-card shadow-raised p-5">
          <ConfidenceHistogram
            rows={confidence.data}
            threshold={current.confidence_threshold}
          />
        </div>
      )}

      {/* --- Audit log ------------------------------------------------------ */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        Change history
      </h2>

      {events.isError && <ErrorState message={events.error.message} />}

      {events.isSuccess && events.data.length === 0 && (
        <p className="rounded-card border border-border bg-card shadow-raised p-5 text-sm text-muted-foreground">
          No changes recorded yet. Anything you do above will appear here, and
          cannot be edited or removed afterwards.
        </p>
      )}

      {events.isSuccess && events.data.length > 0 && (
        <ul className="space-y-2">
          {events.data.map((event) => (
            <li
              key={event.id}
              className="rounded-card border border-border bg-card shadow-raised p-4"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="font-semibold text-foreground">
                  {event.was_enabled !== event.now_enabled
                    ? event.now_enabled
                      ? 'AI turned ON'
                      : 'AI turned OFF'
                    : `Threshold ${Math.round((event.was_threshold ?? 0) * 100)}% → ${Math.round((event.now_threshold ?? 0) * 100)}%`}
                </p>
                <p className="ml-auto text-sm text-muted-foreground">
                  {new Date(event.changed_at).toLocaleString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {event.profiles?.full_name &&
                    ` · ${event.profiles.full_name}`}
                </p>
              </div>
              <p className="mt-1 text-sm text-foreground">{event.reason}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 max-w-prose text-xs text-muted-foreground">
        This page replaces the model-accuracy and bias-monitoring screens in the
        original designs. MiZanova calls a hosted model rather than training
        one, and collects no demographic data, so those figures could not be
        produced honestly. These controls can be exercised and audited.
      </p>
    </div>
  )
}
