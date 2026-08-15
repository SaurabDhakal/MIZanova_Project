import type { StrategyConfidenceRow } from '../lib/api'

/**
 * How confident the model was, and where the routing line sits.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * The routing threshold decides whether a suggestion goes to a teacher or is
 * held for a specialist. It is the single most consequential number in the
 * product, and until now the governance screen let you change it while showing
 * nothing about its effect.
 *
 * An average would not have helped. This project has already had the failure
 * this chart is for: the prompt named the threshold, the model obligingly
 * answered near it, and scores piled up at 0.68–0.72 — so the publish-or-hold
 * decision was effectively a coin toss. A mean of 0.70 looked perfectly
 * healthy the whole time. Only the SHAPE shows it, as a spike on the line.
 *
 * ---------------------------------------------------------------------------
 * DECISIONS WORTH KNOWING
 * ---------------------------------------------------------------------------
 * BUCKETS OF 0.05, not 0.1. Clustering at the threshold is the thing this is
 * for, and ten buckets are too coarse to show it — a pile at 0.68–0.72 would
 * vanish into a single bar spanning 0.6–0.7.
 *
 * NO AXIS FOR THE COUNTS. The question is "what is the shape and where is the
 * line", not "how many were in bucket seven". The tallest bar is labelled and
 * that is enough; a y-axis would add furniture without adding an answer.
 *
 * IT DRAWS NOTHING WHEN THERE IS NOTHING. An empty histogram is a picture of a
 * flat distribution, which is a claim. The caller shows an empty state instead.
 */

const BUCKET = 0.05
const BUCKETS = Math.round(1 / BUCKET)

// A viewBox, so the chart scales with its column and needs no measuring.
const W = 640
const H = 180
const PAD_BOTTOM = 28

export default function ConfidenceHistogram({
  rows,
  threshold,
}: {
  rows: StrategyConfidenceRow[]
  threshold: number
}) {
  const counts = new Array<number>(BUCKETS).fill(0)
  for (const r of rows) {
    // 1.0 belongs in the last bucket rather than a twenty-first one.
    const i = Math.min(BUCKETS - 1, Math.floor(r.confidence / BUCKET))
    counts[i] += 1
  }

  const tallest = Math.max(...counts)
  if (tallest === 0) return null

  const barW = W / BUCKETS
  const plotH = H - PAD_BOTTOM
  const thresholdX = threshold * W

  const held = rows.filter((r) => r.confidence < threshold).length
  const atLine = rows.filter(
    (r) => Math.abs(r.confidence - threshold) <= 0.02,
  ).length

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Confidence of ${rows.length} suggestions. ${held} scored below the routing threshold of ${threshold} and were held for review. ${atLine} scored within 0.02 of the threshold.`}
      >
        <line
          x1={0}
          y1={plotH}
          x2={W}
          y2={plotH}
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {counts.map((count, i) => {
          const h = (count / tallest) * (plotH - 8)
          const mid = (i + 0.5) * BUCKET
          return (
            <rect
              key={i}
              x={i * barW + 1}
              y={plotH - h}
              width={barW - 2}
              height={h}
              rx={2}
              // Held and published are different outcomes, so they are
              // different colours. A single colour would make the threshold
              // line decorative rather than the thing the chart is about.
              fill={
                mid < threshold
                  ? 'var(--color-warning-foreground)'
                  : 'var(--color-primary)'
              }
            />
          )
        })}

        <line
          x1={thresholdX}
          y1={0}
          x2={thresholdX}
          y2={plotH}
          stroke="var(--color-danger-foreground)"
          strokeWidth={2}
          strokeDasharray="5 4"
        />

        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text
            key={t}
            x={Math.min(W - 12, Math.max(12, t * W))}
            y={H - 8}
            textAnchor="middle"
            fontSize={13}
            fill="var(--color-muted-foreground)"
          >
            {t.toFixed(2)}
          </text>
        ))}
      </svg>

      {/*
        The same facts in words. A chart that only exists as pixels is unusable
        with a screen reader, and this one carries the argument of the screen.
      */}
      <figcaption className="mt-3 text-sm text-muted-foreground">
        <span className="font-semibold text-warning-foreground">{held}</span> of{' '}
        {rows.length} suggestions fell below the threshold and were held for a
        specialist. The dashed line is the threshold at {threshold}.
        {atLine > 0 && (
          <>
            {' '}
            <span className="font-semibold text-danger-foreground">
              {atLine} landed within 0.02 of it
            </span>
            {' — '}
            scores piled up on the line mean the publish-or-hold decision is
            close to a coin toss, and usually mean the prompt has told the model
            what the threshold is.
          </>
        )}
      </figcaption>
    </figure>
  )
}
