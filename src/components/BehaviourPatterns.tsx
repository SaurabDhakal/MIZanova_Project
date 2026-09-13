import { useQuery } from '@tanstack/react-query'
import {
  fetchStudentPatterns,
  fetchStudentProfile,
  queryKeys,
  type BehaviourPatterns as Patterns,
} from '../lib/api'
import {
  ANTECEDENTS,
  SETTING_EVENTS,
  WHAT_HELPED,
  labelFor,
} from '../lib/behaviourContext'
import Icon from './Icon'

/**
 * What this child's own logs add up to — db/122, db/123, db/132.
 *
 * ---------------------------------------------------------------------------
 * THIS IS NOT AN AI FEATURE, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 * db/122 built this counting so the strategy prompt could stop being generic,
 * and then showed it to nobody but the model. A teacher reading "seven of the
 * last nine followed a demand with no warning" can act on that with no AI in
 * the room at all, and a specialist can bring it to a meeting — which is the
 * artefact the market report means when it talks about producing evidence for
 * an inspection.
 *
 * It also has to be here for a duller reason: a teacher who reads one thing on
 * the page and hears the AI say another has been handed two versions of their
 * own classroom. Both read the same function, so they cannot disagree.
 *
 * ---------------------------------------------------------------------------
 * IT WAS PAINTED THE COLOUR OF THE PAGE
 * ---------------------------------------------------------------------------
 * Saurab: "if that is a genuine thing, i want you to show it with some
 * contrast, right now it is not that visible". Measured, that was something
 * exact rather than a preference — this card's background was `bg-background`,
 * which is `#F5F8FB`, which is the page it sits on, byte for byte. It was not
 * a quiet card. It was a 1px outline drawn on nothing, while the two cards
 * either side of it were white.
 *
 * Underneath that, the hierarchy was inverted. Every LABEL was `text-foreground
 * font-semibold`, and every FINDING was `text-muted-foreground` — so "Most
 * often happens after" was typeset louder than the answer to it. The reader
 * scanned five bold field names to reach five grey facts. Now the finding
 * carries the weight and the label recedes, which is the order they are
 * wanted in.
 *
 * The card recipe is the one its siblings use — white, `p-5`, `shadow-raised`,
 * an icon and a `text-section` heading — because three cards in one column had
 * three different recipes, and the fix for that is not a fourth.
 *
 * ---------------------------------------------------------------------------
 * EVERY NUMBER SHOWS WHAT IT RESTS ON
 * ---------------------------------------------------------------------------
 * "Most often after being asked to do something" is a claim about a child. It
 * is worth something drawn from thirty incidents and nothing drawn from three,
 * and the difference is invisible unless the count is on the screen — so the
 * count is always on the screen, next to the claim, not in a tooltip. It is
 * set quieter than the claim and in `tabular-nums`: it is the evidence for the
 * sentence, not part of the sentence.
 *
 * The recovery trend is withheld entirely by the database below six timed
 * incidents. Nothing here can render it, because it is not sent.
 *
 * NO SCORE, NO PERCENTAGE, NO RAG RATING. db/054 refused to compute a
 * compliance percentage next to a child and the reasoning has not changed: a
 * single number invites comparison between children, and none of this supports
 * that.
 */

const TREND_WORDING = {
  lengthening: 'taking longer than it was',
  shortening: 'getting quicker',
  steady: 'about the same as it was',
} as const

/** The recipe the whole right-hand column uses. One card, one look. */
const CARD =
  '@container rounded-card border border-border bg-card p-5 shadow-raised'

/**
 * One counted finding.
 *
 * The weight is on `value`, not on `label` — a reader scanning this column
 * wants the five answers, and the five questions are only there to say what
 * kind of answer each one is. `detail` is the denominator, set down a step so
 * it reads as the evidence under the claim rather than part of it.
 */
function Finding({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">
        {value}
        {detail ? (
          <span className="ml-1.5 whitespace-nowrap text-xs font-normal tabular-nums text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </dd>
    </div>
  )
}

export default function BehaviourPatterns({
  studentId,
  studentName,
}: {
  studentId: string
  studentName: string
}) {
  const patterns = useQuery({
    queryKey: queryKeys.studentPatterns(studentId),
    queryFn: () => fetchStudentPatterns(studentId),
  })

  /*
   * db/127. WHAT THE SCHOOL BELIEVES, ALONGSIDE WHAT IT HAS RECORDED.
   *
   * This is the whole reason the profile reuses the logging vocabularies. A
   * teacher writes down that transitions set this child off; the logs then say
   * demands, in most incidents. Both sides are the same coded value, so the two
   * sentences can be put next to each other — and that gap is usually the most
   * useful thing anybody says at a review meeting.
   *
   * It could not exist with free text on one side, and it is worth more than
   * either half on its own.
   */
  const profile = useQuery({
    queryKey: queryKeys.studentProfile(studentId),
    queryFn: () => fetchStudentProfile(studentId),
  })

  // Silent while loading and silent on failure. This is a supporting panel, not
  // the record — an error box here would sit above a child's actual history
  // and imply something was lost, when the logs themselves are fine.
  if (patterns.isLoading || patterns.isError || !patterns.data) return null

  const p: Patterns = patterns.data

  const before = p.top_antecedent
    ? labelFor(ANTECEDENTS, p.top_antecedent.value)
    : null
  const helped = (p.what_has_helped ?? [])
    .map((h) => ({ label: labelFor(WHAT_HELPED, h.value), times: h.times }))
    .filter((h): h is { label: string; times: number } => Boolean(h.label))
  const events = (p.common_setting_events ?? [])
    .map((s) => ({ label: labelFor(SETTING_EVENTS, s.value), times: s.times }))
    .filter((s): s is { label: string; times: number } => Boolean(s.label))

  /*
   * `peak_hour` IS NOT A FINDING FOR THIS PURPOSE, and treating it as one hid
   * the whole point of the panel.
   *
   * It is derived from `occurred_at`, which every log has always had — so it
   * fires for every child with a single observation, whether or not anybody
   * has ever answered "what was going on". The first version of this component
   * counted it towards `hasFindings`, which meant the invitation below was
   * unreachable in practice: a school could log four hundred incidents,
   * record the antecedent for none of them, and be shown a confident-looking
   * panel that never once said why the advice stays generic.
   *
   * So the two are separated. The clock cluster is still shown — it is real,
   * and it costs nothing — but only the ABC columns count as CONTEXT, and the
   * absence of context is stated even when other figures are present.
   */
  const hasContext = Boolean(before) || helped.length > 0 || events.length > 0

  /* Only a DISAGREEMENT, and only when staff named triggers at all. A school
     that named several and got one of them right has not disagreed with
     anything, so `includes` rather than "is it the top one". */
  const believedTriggers = profile.data?.triggers ?? []
  const recordedTop = p.top_antecedent?.value
  const mismatch =
    believedTriggers.length > 0 &&
    recordedTop &&
    !believedTriggers.includes(recordedTop)
      ? {
          believed: believedTriggers
            .map((t) => labelFor(ANTECEDENTS, t))
            .filter((t): t is string => Boolean(t))
            .join(' or '),
          recorded: labelFor(ANTECEDENTS, recordedTop) ?? recordedTop,
        }
      : null

  /* The denominator for the whole card, said once beside the heading rather
     than repeated in prose. Every figure below still carries its own. */
  const heading = (
    <div className="flex items-center gap-3">
      <span className="inline-flex shrink-0 rounded-btn bg-brand-navy/10 p-2.5 text-brand-navy">
        <Icon name="progress" className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-section text-foreground">Patterns</h2>
        <p className="text-xs text-muted-foreground">
          {p.total === 0
            ? `Nothing logged for ${studentName} yet`
            : `From ${p.total} observation${p.total === 1 ? '' : 's'} in the last ${p.window_days} days`}
        </p>
      </div>
    </div>
  )

  if (p.total === 0) return <section className={CARD}>{heading}</section>

  return (
    <section className={CARD}>
      {heading}

      <dl className="mt-4 grid gap-x-6 gap-y-4 @xs:grid-cols-2">
        {before && p.top_antecedent && (
          <Finding
            label="Most often happens after"
            value={before.toLowerCase()}
            detail={`${p.top_antecedent.times} of ${p.total}`}
          />
        )}

        {helped.length > 0 && (
          <Finding
            label={`What has helped ${studentName}`}
            value={helped
              .map((h) => `${h.label.toLowerCase()} (${h.times})`)
              .join(', ')}
          />
        )}

        {/* db/132. The school's clock, not the server's. */}
        {p.peak_hour && (
          <Finding
            label="Clusters around"
            value={`${String(p.peak_hour.hour).padStart(2, '0')}:00`}
            detail={`${p.peak_hour.times} of ${p.total}`}
          />
        )}

        {events.length > 0 && (
          <Finding
            label="Often also true that day"
            value={events
              .map((s) => `${s.label.toLowerCase()} (${s.times})`)
              .join(', ')}
          />
        )}

        {/* Only ever present when the database sent it, which is only above six
            timed incidents. There is no branch here for a smaller sample
            because there is no data for one. */}
        {p.recovery_trend && (
          <Finding
            label="Settling is"
            value={TREND_WORDING[p.recovery_trend]}
            detail={`across ${p.recovery_trend_from} timed`}
          />
        )}
      </dl>

      {/* THE ONE THING HERE THAT IS NOT A STATISTIC.
          A child for whom nothing an adult tried worked is not a child who
          needs a better classroom strategy. It is stated, and it stops there —
          this panel does not decide what should happen next, and a threshold
          that escalated on somebody's behalf would be a clinical judgement
          made by a SQL comparison.

          It is the only thing on this card that keeps a surface of its own,
          because it is an alert rather than a finding. That is what makes it
          carry: when three separate notes were all boxed, the card had no way
          left to say that this one is different. */}
      {p.nothing_worked !== undefined && p.nothing_worked > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-btn border border-warning bg-warning-subtle px-3 py-2 text-sm text-warning-foreground">
          <Icon name="bolt" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            On {p.nothing_worked} occasion
            {p.nothing_worked === 1 ? '' : 's'} nothing that was tried worked.
            Worth raising with {studentName}&rsquo;s specialist.
          </span>
        </p>
      )}

      {/* SAID TO THE ONE PERSON WHO CAN FIX IT, on the screen where they can.
          Hiding the panel until it fills up would mean a school gets generic
          advice forever and is never told why — and the reason is four seconds
          of tapping they were never asked for.

          A rule rather than a box: a bordered panel inside a bordered panel is
          a nested card, and it read as an error when it is an invitation. */}
      {!hasContext && (
        <p className="mt-4 max-w-prose border-t border-border pt-3 text-sm text-muted-foreground">
          None of these {p.total} observations record what was going on around
          the incident. Answering that when you log &mdash; or afterwards, under
          &ldquo;Correct this observation&rdquo; &mdash; is what turns them into
          a pattern, and what makes the AI&rsquo;s suggestions specific to{' '}
          {studentName}.
        </p>
      )}

      {/* db/127. Only when there is something to compare AND the two differ.
          Agreement needs no sentence — a panel that congratulates a school for
          being right is noise, and this one is only worth reading when it says
          something the reader did not already believe. */}
      {mismatch && (
        <p className="mt-4 max-w-prose border-t border-border pt-3 text-sm text-muted-foreground">
          Staff recorded that{' '}
          <span className="font-semibold text-foreground">
            {mismatch.believed.toLowerCase()}
          </span>{' '}
          usually sets {studentName} off, but the logs most often say{' '}
          <span className="font-semibold text-foreground">
            {mismatch.recorded.toLowerCase()}
          </span>
          . Worth a conversation rather than a correction &mdash; both can be
          true, and which one is in front of you changes what helps.
        </p>
      )}

      {/* THE "the options did not fit" LINE MOVED OFF THIS CARD.
          It is a note about this product's vocabularies, not a fact about the
          child, and it sat under a heading that promises facts about a child.
          It belongs at platform altitude (docs/20 §3.3), where whether the
          lists are failing people is actually actionable. */}

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Counted from this school&rsquo;s own logs, not from the AI. Small
        numbers are a hint rather than a finding.
      </p>
    </section>
  )
}
