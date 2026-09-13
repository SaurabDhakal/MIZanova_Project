import {
  ANTECEDENTS,
  SETTING_EVENTS,
  WHAT_HELPED,
  labelFor,
} from '../lib/behaviourContext'

/**
 * What the AI was told, written for the teacher who pressed the button.
 *
 * ---------------------------------------------------------------------------
 * REWRITTEN FOR A READER WITH NO TECHNICAL BACKGROUND
 * ---------------------------------------------------------------------------
 * The first version was a reviewer's panel: fourteen field names down the left
 * ("History given", "— most often after", "— clusters at"), a raw JSON payload
 * underneath, and an "Identifiers removed: 0" row sitting directly below a
 * promise that identifiers ARE removed — which reads as the audit trail
 * contradicting the reassurance, at the worst possible moment, with a parent
 * looking over a shoulder.
 *
 * A teacher opening this asks two questions, in this order:
 *
 *   1. Did my student's name go to a company?
 *   2. Why did it say that?
 *
 * So (1) is answered first and absolutely, before any list of what WAS sent —
 * because without it, that list reads as an admission. Then (2), as five short
 * plain-English groups instead of fourteen labelled rows.
 *
 * The exact stored text is still one click further in, unchanged, for the
 * specialist who has to audit rather than read.
 */

type Payload = {
  behaviourType?: string
  intensity?: string
  approximateDurationMinutes?: number | null
  yearLevel?: string | null
  notes?: string
  antecedent?: string | null
  whatHelped?: string | null
  settingEvents?: string[]
  antecedentNote?: string | null
  whatHelpedNote?: string | null
  settingEventsNote?: string | null
  patterns?: {
    total?: number
    window_days?: number
    top_antecedent?: { value: string; times: number }
    what_has_helped?: { value: string; times: number }[]
    peak_hour?: { hour: number; times: number }
    common_setting_events?: { value: string; times: number }[]
    nothing_worked?: number
  }
  profile?: {
    interests?: string | null
    strengths?: string | null
    findsHard?: string | null
    helps?: string[]
    triggers?: string[]
  } | null
  priorOutcomes?: { title: string; outcome: string }[]
  redactions?: number
  /**
   * db/134. True on demo-seed rows, where the payload was BUILT FROM THE LOG
   * afterwards rather than captured at the moment of sending — because nothing
   * was ever sent for those rows. Every field in it is true of the incident;
   * what is not true is that a model received it. This panel exists to be
   * honest about what left the building, so it says which kind it is looking
   * at rather than letting a reconstruction pass as a capture.
   */
  reconstructed?: boolean
}

/** One plain group: a short heading and the sentences under it. */
function Group({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <div>
      <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      <ul className="mt-0.5 space-y-0.5">
        {lines.map((line) => (
          <li key={line} className="text-xs text-muted-foreground">
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}

const lower = (value: string | null | undefined) => value?.toLowerCase() ?? ''

export default function SentToAi({ raw }: { raw: string }) {
  let payload: Payload | null = null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      payload = parsed as Payload
    }
  } catch {
    payload = null
  }

  const p = payload?.patterns
  const prof = payload?.profile
  const outcomes = payload?.priorOutcomes ?? []

  const incident: string[] = []
  if (payload) {
    const parts = [payload.behaviourType, payload.intensity].filter(Boolean)
    if (parts.length > 0) incident.push(`${parts.join(', ')}.`)
    if (payload.approximateDurationMinutes != null) {
      incident.push(`About ${payload.approximateDurationMinutes} minutes.`)
    }
    if (payload.yearLevel) incident.push(`Year ${payload.yearLevel}.`)
    if (payload.notes) incident.push(`Your notes: “${payload.notes}”`)
  }

  const around: string[] = []
  if (payload?.antecedent) {
    around.push(
      `Just before: ${
        payload.antecedent === 'other' && payload.antecedentNote
          ? payload.antecedentNote
          : lower(labelFor(ANTECEDENTS, payload.antecedent))
      }.`,
    )
  }
  if (payload?.whatHelped) {
    around.push(
      `What you did: ${
        payload.whatHelped === 'other' && payload.whatHelpedNote
          ? payload.whatHelpedNote
          : lower(labelFor(WHAT_HELPED, payload.whatHelped))
      }.`,
    )
  }
  if (payload?.settingEvents?.length) {
    around.push(
      `That day: ${payload.settingEvents
        .map((e) =>
          e === 'other' && payload?.settingEventsNote
            ? payload.settingEventsNote
            : lower(labelFor(SETTING_EVENTS, e)),
        )
        .join(', ')}.`,
    )
  }

  /* Every figure keeps its denominator, the same rule the Patterns card
     follows — a teacher reading "most often after being asked" deserves to
     know whether that is 4 of 6 or 4 of 40. */
  const history: string[] = []
  if (p && (p.total ?? 0) > 0) {
    history.push(
      `${p.total} observation${p.total === 1 ? '' : 's'} in the last ${p.window_days} days.`,
    )
    if (p.top_antecedent) {
      history.push(
        `Most often after ${lower(labelFor(ANTECEDENTS, p.top_antecedent.value))} — ${p.top_antecedent.times} of ${p.total}.`,
      )
    }
    if (p.what_has_helped?.length) {
      history.push(
        `What has helped: ${p.what_has_helped
          .map((h) => `${lower(labelFor(WHAT_HELPED, h.value))} (${h.times})`)
          .join(', ')}.`,
      )
    }
    if (p.nothing_worked) {
      history.push(
        `Nothing worked on ${p.nothing_worked} occasion${p.nothing_worked === 1 ? '' : 's'}.`,
      )
    }
  }

  const recorded: string[] = []
  if (prof?.interests) recorded.push(`Loves: ${prof.interests}`)
  if (prof?.strengths) recorded.push(`Good at: ${prof.strengths}`)
  if (prof?.findsHard) recorded.push(`Finds hard: ${prof.findsHard}`)
  if (prof?.helps?.length) {
    recorded.push(
      `Staff say this helps: ${prof.helps
        .map((h) => lower(labelFor(WHAT_HELPED, h)))
        .join(', ')}.`,
    )
  }

  const tried = outcomes.map(
    (o) =>
      `“${o.title}” — ${
        o.outcome === 'did_not_help'
          ? 'did not help'
          : o.outcome === 'helped'
            ? 'helped'
            : 'was tried'
      }.`,
  )

  return (
    <details className="mt-2">
      <summary className="min-h-11 flex cursor-pointer items-center text-sm font-medium text-primary hover:underline">
        What the AI was told
      </summary>

      <div className="mt-2 space-y-3 rounded-btn border border-border bg-background p-3">
        {/* THE QUESTION THEY ACTUALLY OPENED THIS TO ASK, answered before
            anything else. A list of what WAS sent reads as an admission until
            you already know what was not. */}
        <p className="text-xs text-foreground">
          <span className="font-semibold">Not sent:</span> their name, date of
          birth, student ID, or your school. The AI cannot tell who this is.
        </p>

        {payload ? (
          <>
            <Group title="The incident" lines={incident} />
            <Group title="What was going on" lines={around} />
            <Group title="Their history here" lines={history} />
            <Group title="What your school has recorded" lines={recorded} />
            <Group title="Already suggested" lines={tried} />

            {/* NOT "Identifiers removed: 0". A zero beneath a promise that
                names are removed reads as the audit contradicting the promise.
                This names what happened instead of counting what did not. */}
            <p className="text-xs text-muted-foreground">
              {payload.redactions
                ? `${payload.redactions} name${payload.redactions === 1 ? '' : 's'} or contact detail${
                    payload.redactions === 1 ? ' was' : 's were'
                  } taken out of your notes before they were sent.`
                : 'Nothing in your notes needed taking out.'}
            </p>
          </>
        ) : null}

        {payload?.reconstructed ? (
          <p className="text-xs text-muted-foreground">
            This is demo data. The details above are taken from the observation
            itself &mdash; nothing was sent to an AI service for this one.
          </p>
        ) : null}

        {/* For the specialist auditing it, not the teacher reading it. */}
        <details>
          <summary className="min-h-11 flex cursor-pointer items-center text-xs text-muted-foreground hover:underline">
            {payload
              ? 'Show the exact text, for a specialist'
              : 'Show it as it was stored'}
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-btn bg-card p-3 text-xs text-muted-foreground">
            {raw}
          </pre>
        </details>
      </div>
    </details>
  )
}
