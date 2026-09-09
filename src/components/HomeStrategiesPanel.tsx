import { useMutation, useQueryClient } from '@tanstack/react-query'
import { requestHomeStrategies, type HomeAiRequestRow } from '../lib/api'
import SupportContacts from './SupportContacts'

/**
 * Three things to try, for one observation a family wrote — db/114.
 *
 * ---------------------------------------------------------------------------
 * THE ASK IS A SECOND STEP, NOT PART OF WRITING
 * ---------------------------------------------------------------------------
 * The observation saves on its own and the school can read it whether or not
 * anybody presses this. Generating automatically would spend a request on
 * every note a family writes — including the good weeks, which are the ones
 * worth writing and the ones that need no advice — and would quietly make the
 * suggestion the point, with the record of what happened a by-product.
 *
 * ---------------------------------------------------------------------------
 * FOLDED, FOR THE REASON THE HOME PAGE'S IS
 * ---------------------------------------------------------------------------
 * Open, an answer is up to three suggestions with three "why this works"
 * bullets each, and one sits under every observation a family has asked about.
 * One of them already made this screen 1266px; a family a year in would scroll
 * past a wall of advice to reach what they wrote last week.
 *
 * The count is in the summary, so a folded answer still says how much is
 * inside — and the panel appears exactly where the button was, which is the
 * result somebody who just pressed it is looking for.
 *
 * ---------------------------------------------------------------------------
 * A HELD SUGGESTION IS SAID OUT LOUD
 * ---------------------------------------------------------------------------
 * db/094 discards what it cannot show, because an individual has no specialist
 * to wait for. A child has one, so here it waits — and a family told nothing
 * would reasonably assume the model had nothing to say. The count and the
 * reason are both on screen for the same purpose the count exists in the
 * database: a number with no explanation reads as the product losing
 * something.
 */
export default function HomeStrategiesPanel({
  observationId,
  answer,
  canAsk,
}: {
  observationId: string
  /** The answer already on record for this observation, if there is one. */
  answer?: HomeAiRequestRow
  /** False for a co-parent's observation — see below. */
  canAsk: boolean
}) {
  const queryClient = useQueryClient()

  const ask = useMutation({
    mutationFn: () => requestHomeStrategies(observationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['home-strategies'] })
    },
  })

  const strategies = answer?.home_ai_strategies ?? []
  const held = answer?.withheld_count ?? 0

  if (!answer) {
    /*
     * NOT OFFERED ON SOMEBODY ELSE'S WRITING. Both guardians read each other's
     * observations, and either could press this — but the answer is written
     * against the account that asked and counts against their daily limit, and
     * asking the AI about a note your co-parent wrote reads as speaking for
     * them. They can ask about it themselves.
     */
    if (!canAsk) return null

    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => ask.mutate()}
          disabled={ask.isPending}
          className="pressable inline-flex min-h-11 items-center rounded-btn border border-border px-4 py-2 text-sm font-semibold text-primary hover:bg-background disabled:opacity-60"
        >
          {ask.isPending ? 'Thinking…' : 'What could we try?'}
        </button>
        {ask.isError && (
          <p
            role="alert"
            className="mt-2 rounded-btn border border-danger bg-danger-subtle p-3 text-sm font-medium text-danger-foreground"
          >
            {ask.error.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <details className="mt-3 rounded-card bg-background px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-primary">
        {strategies.length > 0
          ? 'Things you could try at home'
          : 'What came back'}{' '}
        {strategies.length > 0 && (
          <span className="font-normal text-muted-foreground">
            ({strategies.length})
          </span>
        )}
      </summary>

      {/* SUPPORT, AND NO PRETENCE OF PRIVACY. The individual's version of
          this says "nobody has been told and nothing has been reported",
          which is true there and false here: db/007 shows a home observation
          to assigned staff the moment it is saved, so the school has already
          read it. Saying otherwise to a frightened parent would be the worst
          lie in the product. */}
      {answer.risk_flagged && (
        <section className="mb-4 rounded-card border border-warning bg-warning-subtle p-4">
          <h4 className="font-semibold text-foreground">
            If you want to talk to a person
          </h4>
          <p className="mt-1 max-w-prose text-sm text-foreground">
            Some of what you wrote sounds heavy going, and this is a computer.
            Your child&rsquo;s assigned staff can see observations you write
            here, as they always could &mdash; nothing extra has been reported
            because of this. These are here in case they are useful.
          </p>
          <SupportContacts />
        </section>
      )}

      {strategies.length > 0 && (
        <>
          <ul className="mt-2 space-y-3">
            {strategies.map((s) => (
              <li key={s.id}>
                <p className="font-semibold text-foreground">{s.title}</p>
                <p className="mt-0.5 text-sm text-foreground">{s.body}</p>
                {s.rationale.length > 0 && (
                  <>
                    <p className="mt-1 text-sm font-medium text-muted-foreground">
                      Why this works:
                    </p>
                    <ul className="mt-0.5 list-disc pl-5 text-sm text-muted-foreground">
                      {s.rationale.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* TWO SENTENCES, NOT ONE. `withheld_reason` is written by the server as
          a sentence of its own and begins with a capital, so joining it to a
          fragment produced "One more suggestion is Waiting for your child's
          specialist". The count and the reason are separate facts anyway. */}
      {held > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {held === 1
            ? 'One more suggestion has not been shown yet.'
            : `${held} more suggestions have not been shown yet.`}{' '}
          {answer.withheld_reason ??
            'It is waiting for your child’s specialist to look at it.'}
        </p>
      )}

      {strategies.length === 0 && held === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing came back for this one. That is not a judgement about what you
          wrote — sometimes there is no general suggestion worth giving, and
          your child’s teacher can be asked directly.
        </p>
      )}

      <p className="mt-3 text-sm text-muted-foreground">
        Written by MiZanova’s assistant from what you wrote, with names removed
        before it was sent. General suggestions, not clinical advice or a
        diagnosis.
      </p>
    </details>
  )
}
