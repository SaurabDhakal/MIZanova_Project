/**
 * The drawn figures for the public pages.
 *
 * ---------------------------------------------------------------------------
 * THEY ARE ON A GRID NOW, AND THAT IS WHY THEY LOOK DIFFERENT
 * ---------------------------------------------------------------------------
 * The first versions of these were drawn by hand, panel by panel: a 188-wide
 * box beside a 182-wide box, three 122s with 19 between them, text inset 18
 * here and 20 there, and three type sizes fighting inside a 126-unit column.
 * Nothing lined up with anything, every figure solved spacing again from
 * scratch, and one of them ran its own copy out through the side of its card —
 * which is what a drawing without a measure eventually does.
 *
 * So there is one measure and every figure obeys it:
 *
 *   W 420        the canvas, always
 *   M 8          the margin, always
 *   GAP 12       between columns, always
 *   FULL 404     one column
 *   HALF 196     two
 *   THIRD 126    three
 *   PAD 16       inset from a panel edge to its text, always
 *   ROW 66       a panel with a label and a value in it
 *
 * TWO TYPE SIZES, NOT THREE. A label at 12 and a value at 16. The old third
 * size existed to carry a sentence of explanation inside the drawing, and a
 * sentence inside a drawing is copy in the wrong place — it belongs in the
 * paragraph beside it, where it can wrap.
 *
 * WHAT FITS IS ARITHMETIC, NOT JUDGEMENT. At 16px Inter averages about 0.52em
 * a character, so a HALF panel holds roughly 19 characters and a THIRD holds
 * 12. Every string below was written to that budget rather than trimmed after
 * it overflowed.
 *
 * ---------------------------------------------------------------------------
 * THE RULES THAT DID NOT CHANGE
 * ---------------------------------------------------------------------------
 * DRAWN, NOT PHOTOGRAPHED. The obvious illustration for a product about
 * children is a photograph of children, and stock photography of neurodiverse
 * children on a page selling software about them is wrong twice over: the
 * child consented to a stock library, not to this.
 *
 * TOKENS, NOT HEX, so a figure cannot drift from the palette.
 *
 * aria-hidden, ALWAYS. Every figure restates something written beside it.
 *
 * ONE GRAMMAR: a white panel is a thing the product holds, a gradient stroke
 * is something moving between them, a dashed stroke is a route that does not
 * exist.
 */

export const W = 420
export const M = 8
const GAP = 12
export const FULL = W - M * 2
const HALF = (FULL - GAP) / 2
const THIRD = (FULL - GAP * 2) / 3
const PAD = 16
export const ROW = 66

/** Column x-positions, so no figure computes its own. */
const col = {
  full: M,
  half: [M, M + HALF + GAP],
  third: [M, M + THIRD + GAP, M + (THIRD + GAP) * 2],
}

export function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-brand`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--color-brand-navy)" />
        <stop offset="55%" stopColor="var(--color-brand-blue)" />
        <stop offset="100%" stopColor="var(--color-brand-green)" />
      </linearGradient>
      <filter id={`${id}-lift`} x="-20%" y="-20%" width="140%" height="170%">
        <feDropShadow
          dy="3"
          stdDeviation="5"
          floodColor="#0f172a"
          floodOpacity="0.1"
        />
      </filter>
    </defs>
  )
}

/**
 * A panel with a label and a value in it — which is every panel in every
 * figure. Written once so the inset, the two baselines and the corner radius
 * cannot disagree between drawings.
 */
export function Cell({
  id,
  x,
  y,
  w,
  label,
  value,
  tone = 'plain',
  h = ROW,
}: {
  id: string
  x: number
  y: number
  w: number
  label?: string
  value: string
  /** plain = a thing the product holds. brand = the thing being claimed. */
  tone?: 'plain' | 'brand'
  h?: number
}) {
  const brand = tone === 'brand'
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="12"
        fill={brand ? `url(#${id}-brand)` : 'var(--color-card)'}
        stroke={brand ? 'none' : 'var(--color-border)'}
        filter={`url(#${id}-lift)`}
      />
      {label && (
        <text
          x={x + PAD}
          y={y + 26}
          fontSize="12"
          fill={brand ? 'rgba(255,255,255,0.85)' : 'var(--color-muted-foreground)'}
        >
          {label}
        </text>
      )}
      <text
        x={x + PAD}
        y={y + (label ? 50 : 40)}
        fontSize="16"
        fontWeight="600"
        fill={brand ? '#ffffff' : 'var(--color-foreground)'}
      >
        {value}
      </text>
    </g>
  )
}

/** A route that does not exist: dashed, struck, and never in the danger red. */
function DeadEnd({
  x,
  y,
  w,
  label,
}: {
  x: number
  y: number
  w: number
  label: string
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height="44"
        rx="10"
        fill="var(--color-background)"
        stroke="var(--color-border)"
        strokeDasharray="4 5"
      />
      <text
        x={x + w / 2}
        y={y + 27}
        textAnchor="middle"
        fontSize="14"
        fill="var(--color-muted-foreground)"
        textDecoration="line-through"
      >
        {label}
      </text>
    </g>
  )
}

/** FOR SCHOOLS — a flag goes in with a time on it and comes out with a name. */
export function SafeguardingQueueFigure() {
  const id = 'fig-queue'
  return (
    <svg viewBox="0 0 420 232" className="h-auto w-full" aria-hidden="true">
      <Defs id={id} />

      <Cell id={id} x={col.half[0]} y={8} w={HALF} label="FLAGGED IN CLASS" value="9:12am" />
      <Cell id={id} x={col.half[1]} y={8} w={HALF} label="SAFEGUARDING QUEUE" value="3 open" />

      <path
        d={`M${W / 2} ${8 + ROW}v22`}
        stroke={`url(#${id}-brand)`}
        strokeWidth="2"
        strokeLinecap="round"
      />

      <Cell
        id={id}
        x={col.full}
        y={96}
        w={FULL}
        label="ACKNOWLEDGED"
        value="A. Patel, deputy head"
      />
      {/* The elapsed figure is the point of the whole drawing, so it is the one
          thing in the brand gradient. */}
      <circle cx={W - M - 46} cy={129} r="22" fill={`url(#${id}-brand)`} />
      <text
        x={W - M - 46}
        y={134}
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill="#ffffff"
      >
        14m
      </text>

      <path
        d={`M${M} 186h${FULL}`}
        stroke="var(--color-border)"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <text x={M} y={210} fontSize="14" fill="var(--color-muted-foreground)">
        Raised to acknowledged, timed
      </text>
    </svg>
  )
}

/** FOR FAMILIES — three routes in, and one that was never built. */
export function WhoCanSeeFigure() {
  const id = 'fig-see'
  const routes = [
    ['THEIR TEACHER', 'assigned'],
    ['YOU', 'guardian link'],
    ['A SPECIALIST', 'on caseload'],
  ] as const

  return (
    <svg viewBox="0 0 420 316" className="h-auto w-full" aria-hidden="true">
      <Defs id={id} />

      <Cell
        id={id}
        x={col.full}
        y={8}
        w={FULL}
        label="ONE CHILD'S RECORD"
        value="Held in Sydney"
      />

      <path
        d={`M${W / 2} 74v14`}
        stroke={`url(#${id}-brand)`}
        strokeWidth="2"
        strokeLinecap="round"
      />

      {routes.map(([who, why], i) => {
        const y = 88 + i * 56
        return (
          <g key={who}>
            <rect
              x={M}
              y={y}
              width={FULL}
              height="46"
              rx="12"
              fill="var(--color-card)"
              stroke="var(--color-border)"
              filter={`url(#${id}-lift)`}
            />
            <text x={M + PAD} y={y + 28} fontSize="14" fontWeight="600" fill="var(--color-foreground)">
              {who}
            </text>
            {/* Anchored right, so the reason lines up down the three rows
                however long the label beside it is. */}
            <text
              x={W - M - PAD}
              y={y + 28}
              textAnchor="end"
              fontSize="14"
              fill="var(--color-muted-foreground)"
            >
              {why}
            </text>
          </g>
        )
      })}

      <path
        d={`M${W / 2} 256v14`}
        stroke="var(--color-muted-foreground)"
        strokeWidth="2"
        strokeDasharray="4 5"
        strokeLinecap="round"
      />
      <DeadEnd x={M} y={270} w={FULL} label="Anybody else, however senior" />
    </svg>
  )
}

/** FOR SPECIALISTS — the gate, and the three ways out of it. */
export function ReviewGateFigure() {
  const id = 'fig-gate'
  return (
    <svg viewBox="0 0 420 214" className="h-auto w-full" aria-hidden="true">
      <Defs id={id} />

      <Cell
        id={id}
        x={col.half[0]}
        y={8}
        w={HALF}
        label="AI SUGGESTION"
        value="Low confidence"
      />
      <Cell
        id={id}
        x={col.half[1]}
        y={8}
        w={HALF}
        label="HELD FOR A SPECIALIST"
        value="Not yet visible"
        tone="brand"
      />

      <path
        d={`M${col.half[1] + HALF / 2} ${8 + ROW}v18M${col.third[0] + THIRD / 2} 92h${
          col.third[2] + THIRD / 2 - (col.third[0] + THIRD / 2)
        }M${col.third[0] + THIRD / 2} 92v14M${col.third[1] + THIRD / 2} 92v14M${
          col.third[2] + THIRD / 2
        } 92v14`}
        stroke={`url(#${id}-brand)`}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />

      {['Release', 'Reject', 'Replace'].map((verb, i) => (
        <g key={verb}>
          <rect
            x={col.third[i]}
            y={106}
            width={THIRD}
            height="52"
            rx="12"
            fill="var(--color-card)"
            stroke="var(--color-border)"
            filter={`url(#${id}-lift)`}
          />
          <text
            x={col.third[i] + THIRD / 2}
            y={137}
            textAnchor="middle"
            fontSize="16"
            fontWeight="600"
            fill="var(--color-foreground)"
          >
            {verb}
          </text>
        </g>
      ))}

      <path
        d={`M${M} 182h${FULL}`}
        stroke="var(--color-border)"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <text x={M} y={204} fontSize="14" fill="var(--color-muted-foreground)">
        With the anonymised text on screen
      </text>
    </svg>
  )
}

/** FOR INDIVIDUALS — one closed boundary, and three routes out of it that
 *  were never built. */
export function NothingLeavesFigure() {
  const id = 'fig-alone'
  return (
    <svg viewBox="0 0 420 290" className="h-auto w-full" aria-hidden="true">
      <Defs id={id} />

      <rect
        x={M}
        y={8}
        width={FULL}
        height="180"
        rx="16"
        fill="var(--color-primary-subtle)"
        stroke={`url(#${id}-brand)`}
        strokeWidth="2"
      />
      <text x={M + 20} y={36} fontSize="12" fontWeight="700" fill="var(--color-brand-blue-ink)">
        YOUR ACCOUNT
      </text>

      {/* Inset one PAD from the boundary, so the panels sit on the same
          measure the rest of the figures use. */}
      <Cell
        id={id}
        x={M + PAD}
        y={48}
        w={FULL - PAD * 2}
        label="WHAT YOU WRITE"
        value="Read by nobody else"
      />
      <Cell
        id={id}
        x={M + PAD}
        y={48 + ROW + GAP}
        w={FULL - PAD * 2}
        label="WHAT YOU GET BACK"
        value="Courses and suggestions"
      />

      {['A school', 'An employer', 'Anybody else'].map((who, i) => (
        <g key={who}>
          <path
            d={`M${col.third[i] + THIRD / 2} 188v18`}
            stroke="var(--color-muted-foreground)"
            strokeWidth="2"
            strokeDasharray="4 5"
            strokeLinecap="round"
          />
          <DeadEnd x={col.third[i]} y={206} w={THIRD} label={who} />
        </g>
      ))}

      <text x={M} y={278} fontSize="14" fill="var(--color-muted-foreground)">
        Nothing here is reported to anybody
      </text>
    </svg>
  )
}
