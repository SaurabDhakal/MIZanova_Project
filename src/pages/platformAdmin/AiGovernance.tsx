import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAiUsage,
  fetchSchools,
  updateAiLimits,
  fetchAiControlEvents,
  fetchAiControls,
  fetchStrategyConfidence,
  queryKeys,
  updateAiControls,
} from '../../lib/api'
import { ErrorState, LoadingCards } from '../../components/QueryState'
import ConfidenceHistogram from '../../components/ConfidenceHistogram'
import PageHeader from '../../components/PageHeader'
import { showToast } from '../../lib/toast'

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
  const [switchReason, setSwitchReason] = useState('')
  const [thresholdReason, setThresholdReason] = useState('')
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

  /*
   * A REASON PER CONTROL, NOT ONE SHARED BETWEEN THEM.
   *
   * There was a single box at the top of the page and both controls were
   * disabled until it had something in it. Two faults followed.
   *
   * The small one: it cleared on save, so a reason bought exactly one change.
   * Adjusting the threshold and turning the AI off meant writing twice anyway.
   *
   * The serious one: nothing tied the words to the act. Write "raising the
   * threshold after three poor suggestions", then press Turn AI off, and the
   * audit trail records the kill switch being thrown for a reason that has
   * nothing to do with it — permanently, against your name, on the one screen
   * whose entire purpose is being able to answer "who did this and why".
   *
   * Each control now carries its own reason and gates only its own button, so
   * the sentence in the log is the sentence somebody wrote about that change.
   */
  const save = useMutation({
    mutationFn: (input: {
      aiEnabled: boolean
      confidenceThreshold: number
      reason: string
    }) => updateAiControls(input),
    onSuccess: async () => {
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
  const thresholdMoved = pendingThreshold !== current.confidence_threshold

  return (
    <div>
      <PageHeader
        title="AI governance"
        lead="Controls that actually do something — every change is recorded against your name."
      />

      {/* --- Kill switch --------------------------------------------------- */}
      <div
        className={`rounded-card border p-5 ${
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

        </div>

        {/* The reason sits with the control it explains, so the sentence in
            the audit trail is the sentence somebody wrote about THIS act. */}
        <label
          htmlFor="switch-reason"
          className="mt-4 block text-sm font-semibold text-foreground"
        >
          Why are you {current.ai_enabled ? 'turning this off' : 'turning this back on'}?
        </label>
        <textarea
          id="switch-reason"
          rows={2}
          value={switchReason}
          onChange={(e) => setSwitchReason(e.target.value)}
          placeholder={
            current.ai_enabled
              ? 'Suspending generation while we investigate a suggestion reported by Parramatta West.'
              : 'The reported suggestion was reviewed and the routing threshold has been raised.'
          }
          className="mt-1.5 w-full rounded-btn border border-border bg-card p-3 text-foreground placeholder:text-muted-foreground"
        />

        <button
          type="button"
          disabled={switchReason.trim() === '' || save.isPending}
          onClick={() =>
            save.mutate(
              {
                aiEnabled: !current.ai_enabled,
                confidenceThreshold: current.confidence_threshold,
                reason: switchReason,
              },
              { onSuccess: () => setSwitchReason('') },
            )
          }
          className={`mt-3 rounded-btn px-4 py-2.5 font-semibold disabled:opacity-50 ${
            current.ai_enabled
              ? 'border border-danger text-danger-foreground'
              : 'bg-success-strong text-white'
          }`}
        >
          {save.isPending
            ? 'Saving…'
            : current.ai_enabled
              ? 'Turn AI off'
              : 'Turn AI back on'}
        </button>
        {switchReason.trim() === '' && (
          <p className="mt-2 text-sm text-muted-foreground">
            Write a reason to enable this control.
          </p>
        )}
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

        {/* The reason and the button appear together, only once the slider has
            actually moved. Asking for a justification before there is anything
            to justify is how a required field becomes something people fill in
            with a full stop. */}
        {thresholdMoved && (
          <>
            <label
              htmlFor="threshold-reason"
              className="mt-4 block text-sm font-semibold text-foreground"
            >
              Why are you moving it from{' '}
              {Math.round(current.confidence_threshold * 100)}% to{' '}
              {Math.round(pendingThreshold * 100)}%?
            </label>
            <textarea
              id="threshold-reason"
              rows={2}
              value={thresholdReason}
              onChange={(e) => setThresholdReason(e.target.value)}
              placeholder="Three low-quality suggestions were reported this week, so more should go to a specialist first."
              className="mt-1.5 w-full rounded-btn border border-border bg-card p-3 text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="button"
              disabled={thresholdReason.trim() === '' || save.isPending}
              onClick={() =>
                save.mutate(
                  {
                    aiEnabled: current.ai_enabled,
                    confidenceThreshold: pendingThreshold,
                    reason: thresholdReason,
                  },
                  {
                    onSuccess: () => {
                      setThresholdReason('')
                      setThreshold(null)
                    },
                  },
                )
              }
              className="mt-3 rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {save.isPending
                ? 'Saving…'
                : `Change to ${Math.round(pendingThreshold * 100)}%`}
            </button>
            {thresholdReason.trim() === '' && (
              <p className="mt-2 text-sm text-muted-foreground">
                Write a reason to enable this control.
              </p>
            )}
          </>
        )}
      </div>

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

      {/* --- Spend ---------------------------------------------------------- */}
      <UsageSection />

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


/**
 * What the AI is being used for, and what may be spent — db/078.
 *
 * ---------------------------------------------------------------------------
 * db/026 BUILT ALL OF THIS AND NOBODY COULD SEE IT
 * ---------------------------------------------------------------------------
 * The quota, the per-school limit and a usage row per request have existed
 * since db/026, whose whole argument was that one school could exhaust the
 * budget in a morning and "the first sign of it would be strategies failing
 * everywhere at once, for everybody, with no clue why".
 *
 * The quota stops the runaway. Until this section, the person paying the bill
 * still found out from teachers reporting that strategies had stopped.
 *
 * ---------------------------------------------------------------------------
 * TWENTY-FOUR HOURS, NOT "TODAY"
 * ---------------------------------------------------------------------------
 * db/026's quota is a rolling 24-hour window. A count reset at midnight would
 * disagree with the limit doing the refusing, and a school told it has used 12
 * of 200 while being turned away is the worst version of this screen.
 */
function UsageSection() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [schoolLimit, setSchoolLimit] = useState('')
  const [userLimit, setUserLimit] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const controls = useQuery({
    queryKey: queryKeys.aiControls,
    queryFn: fetchAiControls,
  })
  const usage = useQuery({ queryKey: queryKeys.aiUsage, queryFn: fetchAiUsage })
  const schools = useQuery({ queryKey: queryKeys.schools, queryFn: fetchSchools })

  const save = useMutation({
    mutationFn: () =>
      updateAiLimits({
        schoolLimit: Number(schoolLimit),
        userLimit: Number(userLimit),
        reason,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.aiControls })
      await queryClient.invalidateQueries({ queryKey: queryKeys.aiControlEvents })
      setEditing(false)
      setReason('')
      setError(null)
      showToast('Limits changed, and recorded against your name.')
    },
    onError: (e) => setError(e.message),
  })

  const limit = controls.data?.daily_limit_per_school ?? null
  const nameOf = (id: string | null) =>
    id === null
      ? 'No school recorded'
      : (schools.data?.find((s) => s.id === id)?.name ?? 'A school')

  return (
    <section className="mt-10">
      <h2 className="mb-1 text-lg font-semibold text-foreground">
        Spend and limits
      </h2>
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        One row is counted for every request that reaches the model, which is
        the thing that costs money. The window is the last 24 hours, matching
        the quota that does the refusing.
      </p>

      {/* --- the limits ---------------------------------------------------- */}
      <div className="rounded-card border border-border bg-card shadow-raised p-5">
        {controls.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : controls.isError ? (
          <p className="text-sm text-danger-foreground">
            The limits could not be read, so the figures below have nothing to
            be measured against.
          </p>
        ) : !editing ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              <span className="font-semibold">
                {controls.data?.daily_limit_per_school}
              </span>{' '}
              requests a day per school,{' '}
              <span className="font-semibold">
                {controls.data?.daily_limit_per_user}
              </span>{' '}
              per person.
            </p>
            <button
              type="button"
              onClick={() => {
                setSchoolLimit(String(controls.data?.daily_limit_per_school ?? ''))
                setUserLimit(String(controls.data?.daily_limit_per_user ?? ''))
                setEditing(true)
              }}
              className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
            >
              Change the limits
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (reason.trim() === '')
                return setError(
                  'Say why. A limit decides how much can be spent, and the reason is recorded with it.',
                )
              setError(null)
              save.mutate()
            }}
          >
            {error && (
              <p
                role="alert"
                className="mb-3 rounded-btn border border-danger bg-danger-subtle p-2.5 text-sm text-danger-foreground"
              >
                {error}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ai-school-limit" className="block text-sm font-medium text-foreground">
                  Per school, per day
                </label>
                <input
                  id="ai-school-limit"
                  value={schoolLimit}
                  onChange={(e) => setSchoolLimit(e.target.value)}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                />
              </div>
              <div>
                <label htmlFor="ai-user-limit" className="block text-sm font-medium text-foreground">
                  Per person, per day
                </label>
                <input
                  id="ai-user-limit"
                  value={userLimit}
                  onChange={(e) => setUserLimit(e.target.value)}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
                />
              </div>
            </div>
            <div className="mt-3">
              <label htmlFor="ai-limit-reason" className="block text-sm font-medium text-foreground">
                Why
              </label>
              <input
                id="ai-limit-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Raised for the pilot at Parramatta West"
                className="mt-1 w-full rounded-btn border border-border bg-card px-3 py-2 text-foreground"
              />
              {/* Not this form's politeness: db/012's trigger refuses a change
                  with no reason, and db/078 made it record the limits too. */}
              <p className="mt-1 text-xs text-muted-foreground">
                Required, and kept on the change history below.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={save.isPending}
                className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {save.isPending ? 'Saving…' : 'Change the limits'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setError(null)
                }}
                className="rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* --- who is using it ----------------------------------------------- */}
      {usage.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading usage…</p>
      ) : usage.isError ? (
        <ErrorState
          message={usage.error.message}
          onRetry={() => void usage.refetch()}
        />
      ) : usage.data.length === 0 ? (
        <p className="mt-4 rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">
          No school has asked for a strategy yet. This fills in as soon as one
          does — an empty list here means nothing has been requested, not that
          counting failed.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border bg-card shadow-raised">
          <table className="w-full min-w-[44rem] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[20%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[16%]" />
            </colgroup>
            <caption className="sr-only">
              AI requests by school, against the daily limit
            </caption>
            <thead className="border-b border-border bg-background/60">
              <tr className="text-xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-4 py-3 font-semibold">School</th>
                <th scope="col" className="px-4 py-3 font-semibold">Last 24 hours</th>
                <th scope="col" className="px-4 py-3 font-semibold">7 days</th>
                <th scope="col" className="px-4 py-3 font-semibold">30 days</th>
                <th scope="col" className="px-4 py-3 font-semibold">People</th>
              </tr>
            </thead>
            <tbody>
              {usage.data.map((row) => {
                /*
                 * AT the limit, not merely near it. db/026 refuses the request
                 * that would exceed the cap, so a school on 200 of 200 is
                 * already being turned away — and that is the row somebody has
                 * to see before the phone rings.
                 */
                const atLimit = limit !== null && row.requests_24h >= limit
                const near = limit !== null && !atLimit && row.requests_24h >= limit * 0.8
                return (
                  <tr key={row.school_id ?? 'none'} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 align-top break-words font-medium text-foreground">
                      {nameOf(row.school_id)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={
                          atLimit
                            ? 'font-semibold text-danger-foreground'
                            : near
                              ? 'font-semibold text-warning-foreground'
                              : 'text-foreground'
                        }
                      >
                        {row.requests_24h}
                        {limit !== null && (
                          <span className="text-muted-foreground"> of {limit}</span>
                        )}
                      </span>
                      {atLimit && (
                        <span className="block text-xs text-danger-foreground">
                          Being refused
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      {row.requests_7d}
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      {row.requests_30d}
                    </td>
                    {/*
                      ZERO PEOPLE AND SOME REQUESTS IS NOT A CONTRADICTION, and
                      it must not read as one. `requested_by` is `on delete set
                      null` (db/026, so a usage record survives the account),
                      and `count(distinct ...)` ignores nulls — so a school
                      whose staff have since left reports requests with nobody
                      behind them. Rendering that as "0" says nobody made them.
                    */}
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      {row.people_30d === 0 && row.requests_30d > 0 ? (
                        <span title="The accounts that made these requests have since been deleted, so they can no longer be counted.">
                          —
                        </span>
                      ) : (
                        row.people_30d
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
