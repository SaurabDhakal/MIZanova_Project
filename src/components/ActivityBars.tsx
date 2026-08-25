import { useId, useState } from 'react'

/**
 * Administrative activity, one bar per day.
 *
 * ---------------------------------------------------------------------------
 * NO CHART LIBRARY, FOR THE REASON THE ICONS HAVE NO ICON FONT
 * ---------------------------------------------------------------------------
 * Recharts is ~90kB to draw fourteen rectangles, and this app is expected to
 * open on a school laptop with the wifi off — the service worker precaches the
 * bundle, and a chart library is a second thing that has to arrive. Inline SVG
 * is already in the JavaScript the worker caches. `ConfidenceHistogram` set the
 * precedent on AI Governance.
 *
 * ---------------------------------------------------------------------------
 * ONE SERIES, DELIBERATELY
 * ---------------------------------------------------------------------------
 * The first design had two — actions by a person, and actions by nobody (the
 * test suite and the server, which have no `auth.uid()`). The palette validator
 * refused the second colour: a muted grey fails the chroma floor, because a
 * categorical palette is a set of identities and grey is not one.
 *
 * That was the design being wrong rather than the colour. System noise is not a
 * peer of human action — on this database 73 of 229 audit rows come from CI
 * alone, and giving them their own bar would let them swamp the very thing the
 * chart is for. They are excluded, and the caption says so, which is more
 * honest than colouring them quietly.
 *
 * One series also means no legend is needed: the heading names it.
 */

export type ActivityDay = { date: Date; count: number }

const WIDTH = 720
const HEIGHT = 132
const PAD_BOTTOM = 22
const PAD_TOP = 12
/** Rounded data-end, anchored to the baseline: top corners only. */
const RADIUS = 3

function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, h, w / 2)
  if (h <= 0) return ''
  return [
    `M${x},${y + h}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ')
}

const dayLabel = (d: Date) =>
  d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

export default function ActivityBars({ days }: { days: ActivityDay[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const titleId = useId()

  const peak = Math.max(1, ...days.map((d) => d.count))
  const plot = HEIGHT - PAD_BOTTOM - PAD_TOP
  // A 2px surface gap between adjacent fills, per the mark spec.
  const slot = WIDTH / days.length
  const barW = Math.max(4, slot - 2)

  const total = days.reduce((sum, d) => sum + d.count, 0)
  const busiest = days.reduce((a, b) => (b.count > a.count ? b : a), days[0])

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-labelledby={titleId}
        onMouseLeave={() => setHover(null)}
      >
        {/* The text alternative. A screen reader gets the shape of the data in
            a sentence rather than fourteen unlabelled rectangles. */}
        <title id={titleId}>
          {total === 0
            ? 'No administrative actions by a person in the last fourteen days.'
            : `${total} administrative action${total === 1 ? '' : 's'} over fourteen days, busiest on ${dayLabel(busiest.date)} with ${busiest.count}.`}
        </title>

        {/* Baseline only. No gridlines: the values are small integers and a
            tooltip carries the exact number, so a grid would be furniture. */}
        <line
          x1={0}
          x2={WIDTH}
          y1={HEIGHT - PAD_BOTTOM}
          y2={HEIGHT - PAD_BOTTOM}
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {days.map((d, i) => {
          const h = (d.count / peak) * plot
          const x = i * slot + (slot - barW) / 2
          const y = HEIGHT - PAD_BOTTOM - h
          const isHover = hover === i
          return (
            <g key={d.date.toISOString()}>
              {/* A hit target the full height of the plot, so a day with one
                  action is as easy to hover as the busiest one. */}
              <rect
                x={i * slot}
                y={PAD_TOP}
                width={slot}
                height={HEIGHT - PAD_TOP - PAD_BOTTOM}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {d.count > 0 && (
                <path
                  d={barPath(x, y, barW, h)}
                  fill="var(--color-primary)"
                  opacity={hover === null || isHover ? 1 : 0.45}
                  pointerEvents="none"
                />
              )}
            </g>
          )
        })}

        {/* Ends only. Fourteen dates across 720px collide; the first and last
            are what orient the reader, and the tooltip names the rest. */}
        <text
          x={0}
          y={HEIGHT - 6}
          className="fill-[var(--color-muted-foreground)] text-[11px]"
        >
          {dayLabel(days[0].date)}
        </text>
        <text
          x={WIDTH}
          y={HEIGHT - 6}
          textAnchor="end"
          className="fill-[var(--color-muted-foreground)] text-[11px]"
        >
          {dayLabel(days[days.length - 1].date)}
        </text>
      </svg>

      {hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute -top-1 rounded-btn border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-lifted"
          style={{
            left: `${((hover + 0.5) / days.length) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {dayLabel(days[hover].date)} · {days[hover].count}
          {days[hover].count === 1 ? ' action' : ' actions'}
        </div>
      )}
    </div>
  )
}
