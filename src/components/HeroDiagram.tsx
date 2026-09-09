import { Cell, Defs, FULL, M, ROW, W } from './PublicFigures'

/**
 * What actually happens to an observation, drawn.
 *
 * WHAT THIS REPLACED. A radial gradient in hot pink, violet and indigo — the
 * largest element on the page, meaning nothing, in three colours the brand
 * does not contain. It was the single thing that made the page read as
 * generated: every templated landing page has a gradient blob where the
 * product should be.
 *
 * MiZanova's promise is not "we have AI" — half the market says that. It is
 * that the names come off before anything leaves the building, and the exact
 * text that was sent is kept. That is a sequence, so it is drawn as one.
 *
 * ---------------------------------------------------------------------------
 * IT IS ON THE SHARED GRID NOW, AND VERTICAL
 * ---------------------------------------------------------------------------
 * This was the last figure drawn by hand: a 196-wide panel beside a 174-wide
 * one, a third panel of 314 starting at x=98 under neither of them, and three
 * type sizes. Nothing aligned with anything, and next to the figures in
 * PublicFigures.tsx — which all sit on one measure — it was visibly the odd
 * one out, which is exactly how it read on the page.
 *
 * It is three full-width rows now, top to bottom, because that is what the
 * thing is: an observation goes in, a stripped version goes out, a strategy
 * comes back. Side by side, the first two rows had about 146 units for a line
 * like "Maya left the room", which needs 150. Stacked, every row has the full
 * measure and the sequence reads in the direction people read.
 *
 * Inline SVG rather than a file: no request, works offline with the rest of
 * the shell, and it takes the brand tokens so it cannot drift from the logo.
 *
 * `aria-hidden` because the three steps are written out in the copy beside it.
 */
export default function HeroDiagram() {
  const id = 'hero'

  return (
    <svg viewBox={`0 0 ${W} 274`} className="h-auto w-full" aria-hidden="true">
      <Defs id={id} />

      {/* 1. A name, legible, because the next row is about removing it. */}
      <Cell
        id={id}
        x={M}
        y={8}
        w={FULL}
        label="WHAT THE TEACHER SAW"
        value="Maya left the room"
      />

      {/* The anonymising step, which is the whole point. */}
      <path
        d={`M${W / 2} ${8 + ROW}v10M${W / 2} ${8 + ROW + 34}v10`}
        stroke={`url(#${id}-brand)`}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx={W / 2} cy={8 + ROW + 22} r="16" fill={`url(#${id}-brand)`} />
      {/* A struck-through tag: the name coming off. */}
      <path
        d={`M${W / 2 - 7} ${8 + ROW + 22}h14M${W / 2 - 5} ${8 + ROW + 16}l10 12`}
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* 2. What actually left the building. */}
      <Cell
        id={id}
        x={M}
        y={122}
        w={FULL}
        label="WHAT THE AI RECEIVED"
        value="A student left"
        tone="brand"
      />

      {/* 3. What comes back. */}
      <Cell
        id={id}
        x={M}
        y={200}
        w={FULL}
        label="SUGGESTED STRATEGY"
        value="Offer a planned break card"
      />

    </svg>
  )
}
