import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchPendingStrategies,
  fetchPendingHomeStrategies,
  queryKeys,
  reviewStrategy,
  undoReview,
  type PendingStrategyRow,
} from '../../lib/api'
import { showToast } from '../../lib/toast'
import { EmptyState, ErrorState } from '../../components/QueryState'
import { Link } from 'react-router-dom'
import {
  ANTECEDENTS,
  SETTING_EVENTS,
  WHAT_HELPED,
  labelFor,
} from '../../lib/behaviourContext'
import Icon from '../../components/Icon'
import HomeReviewCard from '../../components/HomeReviewCard'
import MyReviewDecisions from '../../components/MyReviewDecisions'
import SentToAi from '../../components/SentToAi'

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

  /* ------------------------------------------------------------------
     ACTED ON IMMEDIATELY, WITH A WAY BACK.
     ------------------------------------------------------------------
     Both buttons used to fire straight into the mutation with nothing between
     the click and the consequence, and "Release to teacher" is the one that
     matters: it puts AI advice in front of somebody who will act on it with a
     child, which is the exact thing this queue exists to gate.

     A confirmation was the obvious fix and the wrong one. This screen is
     twenty items deep and working through it is the specialist's job — a
     prompt answered twenty times in a row stops being read by about the
     fourth, so it would train the reflex it is meant to interrupt while
     doubling the clicks on their main task.

     So the decision still lands on one press, and the toast carries the way
     back. `undoReview` returns the strategy to the queue and clears the
     reviewer fields; what it cannot do is unsee a suggestion a teacher has
     already opened, which is why the message says what happened rather than
     asking whether it should.
     ------------------------------------------------------------------ */
  const undo = useMutation({
    mutationFn: () => undoReview(strategy.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.pendingStrategies,
      })
      /* Without this the decision vanishes from the queue and does not appear
         in the history until a reload — which reads as the review having
         been lost. */
      await queryClient.invalidateQueries({
        queryKey: queryKeys.myReviewDecisions,
      })
      showToast('Back in the queue.')
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const review = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') =>
      reviewStrategy(strategy.id, decision, note),
    onSuccess: async (_data, decision) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.pendingStrategies,
      })
      showToast(
        decision === 'approved'
          ? 'Released. The teacher can see it now.'
          : 'Rejected. It will not reach a classroom.',
        'success',
        { label: 'Undo', run: () => undo.mutate() },
      )
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const log = strategy.behaviour_logs

  /*
   * ---------------------------------------------------------------------------
   * IS THIS A REAL SUGGESTION OR DEMO FURNITURE
   * ---------------------------------------------------------------------------
   * Saurab: "can you highlight the ai generated part as well" — asked straight
   * after we established that all 21 cards in his queue were `demo-seed` and
   * not one was model output.
   *
   * A seeded card and a genuine one read identically: same title, same body,
   * same rationale, same confidence badge. So a specialist practising on the
   * demo cannot tell which decisions are rehearsal, and anybody watching a
   * demonstration is being shown fabricated advice with no marker on it. That
   * second one matters more — it is the difference between showing a client how
   * the product works and implying the model produced something it did not.
   *
   * `prompt_version` is the discriminator because the seed sets it to
   * 'demo-seed' explicitly (db/seed_demo_school.sql) and every real generation
   * carries the version the server used, v1 through v4.
   */
  const isSeed = strategy.prompt_version === 'demo-seed'
  const confidencePct = Math.round(strategy.confidence * 100)

  return (
    <li className="rounded-card border border-border bg-card shadow-raised p-5">
      {/* Provenance before the title, deliberately. It governs how the rest of
          the card should be read, and a reader who learns it afterwards has
          already formed a view. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {isSeed ? (
          <span className="inline-flex items-center gap-1.5 rounded-btn border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            <Icon name="flag" aria-hidden className="h-3.5 w-3.5" />
            Demo data &mdash; not a real AI suggestion
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-btn bg-accent-subtle px-2.5 py-1 text-xs font-semibold text-accent-foreground">
            <Icon name="ai" aria-hidden className="h-3.5 w-3.5" />
            Written by the AI
            {strategy.model ? (
              <span className="font-normal">· {strategy.model}</span>
            ) : null}
          </span>
        )}
      </div>

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
                {' · '}
                {new Date(log.occurred_at).toLocaleDateString('en-AU', {
                  day: 'numeric',
                  month: 'short',
                })}
              </>
            )}
          </p>

          {/* ---------------------------------------------------------------
              ONE PRESS TO THE CHILD'S HISTORY
              ---------------------------------------------------------------
              Saurab: "a link to see students history so the ai sugegstion can
              be compared and reviewed accordingly".

              Judging "let them choose the order of the two tasks" needs to
              know whether choice has been offered eleven times already and
              never helped. That is on the child's record — the timeline, the
              Patterns card, what staff believe sets them off — and reaching it
              used to mean leaving the queue, opening Caseload, and finding the
              name by eye. Opening in a new tab keeps the queue and the note
              being typed into it. */}
          <Link
            to={`/specialist/students/${strategy.student_id}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            Open their record
            <span aria-hidden>&nbsp;&rarr;</span>
            <span className="sr-only">(opens in a new tab)</span>
          </Link>
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

      {/* WHAT WAS GOING ON, which is the half of the log that decides whether
          a strategy fits. The card showed "physical, medium intensity" — true,
          and silent about whether it followed a demand or a denied request.
          Rendered as a definition list rather than a sentence so a reviewer
          scanning twenty cards finds the same fact in the same place. */}
      {log &&
      (log.antecedent || log.what_helped || log.setting_events?.length) ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          {log.antecedent && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Just before
              </dt>
              <dd className="font-semibold text-foreground">
                {labelFor(ANTECEDENTS, log.antecedent) ?? log.antecedent}
              </dd>
            </div>
          )}
          {log.what_helped && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                What the teacher did
              </dt>
              <dd className="font-semibold text-foreground">
                {labelFor(WHAT_HELPED, log.what_helped) ?? log.what_helped}
              </dd>
            </div>
          )}
          {log.setting_events && log.setting_events.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                True that day
              </dt>
              <dd className="font-semibold text-foreground">
                {log.setting_events
                  .map((e) => labelFor(SETTING_EVENTS, e) ?? e)
                  .join(', ')}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        /* SAID, NOT HIDDEN. An empty context is the most useful thing this
           card can tell a reviewer: the model was working from a behaviour
           type and a sentence, which is why the confidence came back low and
           why releasing it is a judgement rather than a rubber stamp. */
        <p className="mt-3 text-sm text-muted-foreground">
          The teacher did not record what was going on around this incident, so
          the model had the notes and little else.
        </p>
      )}

      {strategy.routing_reason && (
        <p className="mt-3 rounded-btn bg-background p-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Held because:</span>{' '}
          {strategy.routing_reason}
        </p>
      )}

      {/* THE THING BEING JUDGED, so it is the biggest text in the card.
          It was a 4px violet `border-left`, which is the lazy way to say
          "this matters" — and on a card that already has a coloured
          confidence badge and a grey "held because" band it was the third
          decoration competing to be noticed. Emphasis comes from size and
          space instead. */}
      <p className="mt-4 text-[0.9375rem] leading-relaxed text-foreground">
        {strategy.body}
      </p>

      {strategy.rationale.length > 0 && (
        <ul className="mt-3 space-y-1">
          {strategy.rationale.map((reason, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground">
              {/* The drawn tick from the icon set, not the "✓" character.
                  This project HAS a `tick` icon; a glyph borrows whatever the
                  reader's font decides and lands on a different baseline in
                  each one. */}
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

      {/* The specialist IS entitled to the original notes — they are assigned
          to this student. Showing them matters: judging a suggestion without
          the observation behind it is guesswork. */}
      {log?.notes && (
        <details className="mt-3">
          {/* A <summary> IS A CONTROL. This one was 20px while the two
              SentToAi disclosures on the same card were already 44 — and my
              own tap-target sweeps had never included `summary` in the
              selector, so every previous pass over this page reported zero
              while twenty of these sat here. */}
          <summary className="min-h-11 flex cursor-pointer items-center text-sm font-medium text-primary">
            Original observation notes
          </summary>
          <p className="mt-2 rounded-btn bg-background p-3 text-sm text-foreground">
            {log.notes}
          </p>
        </details>
      )}

      {/* db/122 made this payload a nested object with a patterns block and a
          list of prior outcomes. Pretty-printed JSON was fair enough for five
          flat fields and is not fair enough for that — a reviewer who cannot
          read the input is approving rather than reviewing, and the routing
          gate depends on them actually seeing what the model saw. The exact
          stored text is still one click further in. */}
      <SentToAi raw={strategy.anonymised_input} />

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
            className="pressable min-h-11 rounded-btn bg-success-strong px-4 py-2.5 font-semibold text-white disabled:opacity-60"
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
            className="min-h-11 rounded-btn border border-danger px-4 py-2.5 font-semibold text-danger-foreground disabled:opacity-60"
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

  /*
   * THE OTHER HALF OF THE QUEUE — db/114, and it was missing entirely.
   * Suggestions a FAMILY was given and the model held back. See
   * HomeReviewCard for why they are judged on their own terms rather than
   * merged into the classroom list.
   *
   * Separate query, so a failure on one does not blank the other: a specialist
   * who can still see nine classroom suggestions should not be shown an empty
   * page because one join failed.
   */
  const pendingHome = useQuery({
    queryKey: queryKeys.pendingHomeStrategies,
    queryFn: fetchPendingHomeStrategies,
  })

  const homeCount = pendingHome.data?.length ?? 0

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Review queue</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          AI suggestions held back before anyone saw them &mdash; from
          classrooms and from families at home. Nothing here reaches a teacher
          or a parent until you release it.
        </p>
      </header>

      {/* FAMILIES FIRST, and not because there are fewer of them. A parent has
          been shown a line on their own screen saying a suggestion is waiting
          on their child's specialist; a teacher has been told a count. Somebody
          is actively waiting on these, so they go where they are seen. */}
      {pendingHome.isError && (
        <p role="alert" className="mb-4 text-sm text-danger-foreground">
          Suggestions held back from families could not be loaded:{' '}
          {pendingHome.error.message}
        </p>
      )}

      {homeCount > 0 && (
        <section className="mb-8">
          <h2 className="text-section text-foreground">
            Waiting on you, for a family
          </h2>
          <p className="mt-1 mb-3 max-w-prose text-sm text-muted-foreground">
            {homeCount === 1
              ? 'One family has been told a suggestion is waiting for you to look at it.'
              : `${homeCount} families have been told a suggestion is waiting for you to look at it.`}
          </p>
          <ul className="space-y-4">
            {pendingHome.data?.map((strategy) => (
              <HomeReviewCard key={strategy.id} strategy={strategy} />
            ))}
          </ul>
        </section>
      )}

      {homeCount > 0 && pending.isSuccess && pending.data.length > 0 && (
        <h2 className="text-section mb-1 text-foreground">
          Waiting on you, for a classroom
        </h2>
      )}

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

      {/* Both halves empty, not just the classroom one — an "all clear" shown
          above three families still waiting would be the worst possible
          reading of this screen. */}
      {pending.isSuccess && pending.data.length === 0 && homeCount === 0 && (
        <EmptyState
          title="Nothing waiting for review"
          detail="Suggestions appear here when the model is not confident enough, or when it asks for specialist oversight — from a classroom log or from something a family wrote at home. An empty queue means every suggestion so far cleared the threshold on its own."
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

      {/* THE RECEIPT FOR THE WORK ABOVE. `reviewed_by`, `reviewed_at` and
          `review_note` were written on every review and read by nobody — see
          the component. It sits here, collapsed, because the queue is the job
          and this is the record of it; a nav item of its own would compete
          with "Review Queue" for the same glance. */}
      <MyReviewDecisions />
    </div>
  )
}
