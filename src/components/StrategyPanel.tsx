import { useEffect, useState } from 'react'
import Icon from './Icon'
import SentToAi from './SentToAi'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  flagStrategyForReview,
  queryKeys,
  recordStrategyFeedback,
  fetchMyStrategyFeedback,
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

/**
 * What a teacher looks at while the model works.
 *
 * ---------------------------------------------------------------------------
 * BECAUSE IT TAKES SIXTEEN SECONDS, NOT THREE
 * ---------------------------------------------------------------------------
 * Measured end to end on 8 September, six consecutive generations against the
 * live API: 15.8s, 16.5s, 15.8s, 15.9s, 18.1s, 19.7s — median 16.5. NFR1 asks
 * for under three. The cause is not a bug: `ai_controls.paid_model` is
 * `claude-opus-5`, and db/099 chose the capable model on purpose because the
 * cheap one "returns nothing on the cases that matter".
 *
 * That trade is Special Miles' to make. What is NOT defensible is a button
 * that says "Thinking…" and then shows nothing at all for a quarter of a
 * minute — on the one screen this product is built around. Sixteen silent
 * seconds is indistinguishable from a frozen page, and a teacher who presses
 * it twice pays for two generations.
 *
 * So this says what is happening, and counts. It makes no promise about how
 * long: it names the usual range, and past it says so rather than pretending.
 */
function GeneratingNotice() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      role="status"
      className="mt-3 rounded-card border border-border bg-background/60 p-4"
    >
      <p className="font-semibold text-foreground">
        Reading the observation
        <span aria-hidden="true"> · {seconds}s</span>
      </p>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        {seconds < 20
          ? 'The child’s name and details are stripped out before this leaves the school. It usually takes about fifteen to twenty seconds.'
          : 'Longer than usual. It is still working — leave this open rather than pressing again, or you will be charged for two.'}
      </p>
    </div>
  )
}
export default function StrategyPanel({
  logId,
  studentId,
  strategies,
  status,
  statusUnknown = false,
}: {
  logId: string
  studentId: string
  strategies: StrategyRow[]
  /**
   * What happened to this log's suggestions, including the ones RLS hides from
   * a teacher. Undefined while it loads.
   */
  status?: LogStrategyStatus
  /** True when the status query FAILED, which `status === undefined` cannot
   *  distinguish from "still loading" on its own. */
  statusUnknown?: boolean
}) {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  // Kept separate from `notice` on purpose: a safeguarding flag is about the
  // incident and must not be buried in a sentence about AI routing.
  const [safeguarding, setSafeguarding] = useState(false)

  /* db/129. Open when the teacher wants to say WHY the first set did not fit —
     shut by default, because "just give me different ones" is the common case
     and making somebody justify themselves before helping them is a tax. */
  const [askingOpen, setAskingOpen] = useState(false)
  const [because, setBecause] = useState('')

  const generate = useMutation({
    mutationFn: (again?: { because?: string }) =>
      requestStrategies(logId, again),
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
      setAskingOpen(false)
      setBecause('')
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

  /* What I have already said about each of these. Durable, so it survives a
     reload — the record itself always did. */
  const myFeedback = useQuery({
    queryKey: queryKeys.myStrategyFeedback(logId),
    queryFn: () => fetchMyStrategyFeedback(strategies.map((s) => s.id)),
    enabled: strategies.length > 0,
  })

  /* Empty while it loads, which renders the two buttons — the same thing an
     unanswered suggestion shows, so nothing flickers into a wrong state. */
  const mine = myFeedback.data ?? {}

  const feedback = useMutation({
    mutationFn: ({
      strategyId,
      action,
    }: {
      strategyId: string
      action: 'applied' | 'dismissed'
    }) => recordStrategyFeedback(strategyId, action),
    /* No banner at the top of the list. It named no strategy, so with three on
       screen it could not say WHICH one had been recorded — and it vanished on
       reload while the record did not. The answer now lives on the card. */
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.myStrategyFeedback(logId),
      }),
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

    /*
     * A FAILED STATUS QUERY IS NOT "NOTHING HAPPENED".
     *
     * Both counts fall to 0 when the query fails, which sends this straight to
     * the bare Generate button — recreating precisely the confusion the comment
     * above describes: a teacher whose suggestions were held or rejected sees
     * no sign of it, presses the button, and is told to wait for a specialist
     * who may have already decided.
     */
    if (statusUnknown) {
      return (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-sm text-warning-foreground">
            Whether earlier suggestions are with a specialist could not be
            checked. Asking for a fresh set may duplicate a request that is
            already waiting.
          </p>
        </div>
      )
    }

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
              onClick={() => generate.mutate(undefined)}
              disabled={generate.isPending}
              className="min-h-11 mt-3 rounded-btn bg-accent-subtle px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
            >
              {generate.isPending ? 'Thinking…' : 'Ask for new suggestions'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => generate.mutate(undefined)}
            disabled={generate.isPending}
            className="min-h-11 rounded-btn bg-accent-subtle px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon name="ai" className="h-4 w-4" />
              {generate.isPending ? 'Thinking…' : 'Suggest classroom strategies'}
            </span>
          </button>
        )}

        {generate.isPending && <GeneratingNotice />}

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
      {/* A REAL HEADING, and in the page's own register.

          It was a <p>, so a screen-reader user navigating by heading found
          nothing at all inside an expanded row. And "RECOMMENDED
          INTERVENTIONS" is clinical shorthand on a page that otherwise speaks
          plainly — "How did it end?", "What was going on", "Usually sets it
          off". The uppercase treatment now matches the day labels in the
          timeline, so the two read as the same level of thing. */}
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Suggestions
      </h3>

      {notice && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {safeguardingBanner}

      <ul className="mt-2 space-y-3">
        {strategies.map((strategy, index) => (
          <li
            key={strategy.id}
            className="rounded-card border border-border bg-background p-4"
          >
            {/* NUMBERED. Three untitled-looking cards are hard to talk about —
                "the second one" is how a teacher refers to these to a colleague
                or a specialist, and until now there was no second one, only
                three headings. The number is decorative to a screen reader,
                which already announces "2 of 3" from the list itself. */}
            <p className="flex gap-2 font-bold text-foreground">
              <span className="text-muted-foreground" aria-hidden>
                {index + 1}.
              </span>
              <span>{strategy.title}</span>
            </p>

            {/* db/118, db/124 — WHERE THIS CAME FROM, when it did not come from
                the model.

                The evidence library answers during an outage and when the kill
                switch is pulled, which is to say on the worst day. Until now a
                teacher was handed three paragraphs with no source and no way to
                tell whether they were chosen for this situation or are general
                advice that happened to rank. db/118 made provenance not-null
                because a strategy with no evidence is an opinion with better
                placement — which is only true if somebody can read it. */}
            {strategy.provenance && (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Icon name="audit" className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  From the evidence library
                  {strategy.targeted
                    ? ' — chosen for what happened just before this'
                    : ' — general guidance for this kind of behaviour'}
                  . Source: {strategy.provenance}
                </span>
              </p>
            )}

            {/* The instruction itself. The accent stripe that used to sit on
                the left is gone: at 375px it cost width the text could not
                spare (the body renders in 202px of a 375px viewport once the
                nested padding is counted), and a heavy coloured rule is
                decoration standing in for hierarchy the type already carries. */}
            <p className="mt-2 text-foreground">{strategy.body}</p>

            {/* COLLAPSED — docs/20 follow-up, 2026-09-12.
                Three strategies with their rationales open came to 512 words
                on one screen. A teacher reading between lessons needs the
                ACTION; the reasoning is what they want when deciding whether
                to trust it, or when explaining it to a parent, and that is a
                different moment. Shut by default takes the page to about 150
                visible words without removing anything. */}
            {strategy.rationale.length > 0 && (
              <details className="mt-2 group">
                <summary className="min-h-11 flex cursor-pointer items-center text-sm font-medium text-primary hover:underline">
                  Why this works
                </summary>
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
              </details>
            )}


            {/* A QUIET ACTION ROW, from the generator reference in
                docs/log inspiration: small actions sitting under each output
                rather than three competing calls to action. Three suggestions
                used to mean nine chunky buttons — one of them primary blue, one
                danger-outlined — which made the panel shout louder than the
                advice inside it.

                "Applied" keeps the only fill, because it is the one that says
                something happened in a classroom. */}
            {/* WHAT PRESSING THESE ACTUALLY DOES, said on the card.

                Neither button is a rating. "Applied" records that this was
                tried in a real classroom. "Not useful" is stronger than it
                looks: `student_strategy_outcomes` reads it, and the prompt is
                told never to suggest that idea for this child again — so it is
                a decision about the future, not a thumbs-down, and the teacher
                should know that before pressing it and after.

                Both are changeable. db/006 keeps every row rather than editing
                one, so changing your mind is a new row and the newest wins —
                which means a mis-tap is not permanent. */}
            <div className="mt-3 border-t border-border pt-3">
              {mine[strategy.id] ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {mine[strategy.id] === 'applied' ? (
                      <span className="inline-flex items-center gap-1.5 text-success-foreground">
                        <Icon name="tick" className="h-4 w-4" />
                        You tried this
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Icon name="cross" className="h-4 w-4" />
                        Marked not useful
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mine[strategy.id] === 'applied'
                      ? 'Recorded on this child’s history, so later suggestions build on it.'
                      : 'This will not be suggested for this child again.'}
                  </p>
                  <button
                    type="button"
                    disabled={feedback.isPending}
                    onClick={() =>
                      feedback.mutate({
                        strategyId: strategy.id,
                        action:
                          mine[strategy.id] === 'applied'
                            ? 'dismissed'
                            : 'applied',
                      })
                    }
                    className="min-h-11 -mx-2 inline-flex items-center px-2 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      feedback.mutate({ strategyId: strategy.id, action: 'applied' })
                    }
                    disabled={feedback.isPending}
                    className="pressable min-h-11 inline-flex items-center gap-1.5 rounded-btn bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    <Icon name="tick" className="h-4 w-4" />
                    I tried this
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
                    className="min-h-11 inline-flex items-center gap-1.5 rounded-btn px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-background disabled:opacity-60"
                    title="Records that this did not suit, and stops it being suggested for this child again."
                  >
                    <Icon name="cross" className="h-4 w-4" />
                    Not useful
                  </button>

                  {/* FLAG IS NOT FEEDBACK, so it sits apart from the two that
                      are. It sends the suggestion to a specialist and removes
                      it from this screen — a different kind of act from saying
                      whether it worked. */}
                  <button
                    type="button"
                    onClick={() => flag.mutate(strategy.id)}
                    disabled={flag.isPending}
                    className="min-h-11 ml-auto inline-flex items-center gap-1.5 rounded-btn px-2.5 py-1.5 text-sm font-medium text-danger-foreground hover:bg-danger-subtle disabled:opacity-60"
                  >
                    <Icon name="flag" className="h-4 w-4" />
                    {flag.isPending ? 'Sending…' : 'Flag for review'}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* ONCE, NOT ONCE PER SUGGESTION — the same fault as the privacy notice,
          and it survived that fix.

          All three suggestions come from ONE request with ONE payload, so
          rendering this under each of them repeated the identical disclosure
          three times. Worse, it invited the reading that each suggestion had
          its own input, which is false.

          One request, one record of what was sent, placed where it belongs:
          under the set it produced. */}
      {strategies[0]?.anonymised_input && (
        <SentToAi raw={strategies[0].anonymised_input} />
      )}


      {/* Errors were never rendered for these mutations, so a failure looked
          identical to a button that did nothing. */}
      {(flag.isError || feedback.isError) && (
        <p role="alert" className="mt-3 text-sm font-medium text-danger-foreground">
          {(flag.error ?? feedback.error)?.message}
        </p>
      )}

      {/* --- Ask again (db/129) ----------------------------------------
          THE THIRD BUTTON FROM THE ORIGINAL DESIGN. db/006 wrote down all
          three — "Strategy Applied", "Flag this response", "Show Different
          Strategy" — and only two were built, so a teacher who did not like
          any of the three had nowhere to go: "Not useful" recorded a verdict
          and left the screen identical.

          The "because" box is the classroom version of db/110, which has let
          an individual say "I cannot do that because I share a room" since it
          was written. A teacher with no quiet corner in their room had no way
          to say so. Optional, because being made to justify yourself before
          getting help is a tax. */}
      {strategies.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          {!askingOpen ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={generate.isPending}
                onClick={() => generate.mutate({})}
                className="pressable min-h-11 rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-primary hover:bg-background disabled:opacity-50"
              >
                {generate.isPending ? 'Thinking…' : 'Show me different ones'}
              </button>
              <button
                type="button"
                disabled={generate.isPending}
                onClick={() => setAskingOpen(true)}
                className="pressable min-h-11 rounded-btn border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-background disabled:opacity-50"
              >
                These will not work because…
              </button>
            </div>
          ) : (
            <div>
              <label
                htmlFor={`because-${logId}`}
                className="text-sm font-semibold text-foreground"
              >
                What stops these working in your room?
              </label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                One sentence. &ldquo;There is no quiet corner&rdquo;,
                &ldquo;we have already tried the timer&rdquo;, &ldquo;I am on my
                own with thirty of them&rdquo;.
              </p>
              <input
                id={`because-${logId}`}
                value={because}
                maxLength={500}
                onChange={(e) => setBecause(e.target.value)}
                className="mt-2 w-full rounded-btn border border-border bg-card px-3 py-2 text-sm text-foreground"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={because.trim() === '' || generate.isPending}
                  onClick={() => generate.mutate({ because })}
                  className="pressable min-h-11 rounded-btn bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {generate.isPending ? 'Thinking…' : 'Try again with that'}
                </button>
                <button
                  type="button"
                  onClick={() => setAskingOpen(false)}
                  className="pressable min-h-11 rounded-btn border border-border px-3 py-2 text-sm font-semibold text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* THE PRIVACY NOTICE MOVED OUT OF HERE — one per page, not one per log.
          This panel renders once per behaviour log, so a student with five
          logs carried five identical copies of an 85-word notice: 425 words of
          verbatim boilerplate on one screen. Text that reassures at the first
          reading becomes an anxiety signal by the fifth.

          It now sits once at the foot of the Activity card. What stays on each
          suggestion is the part that is about THAT suggestion — the provenance
          line, and "What the AI was told". */}

    </div>
  )
}
