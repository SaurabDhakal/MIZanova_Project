/**
 * What actually happens to an observation, drawn.
 *
 * WHAT THIS REPLACED, AND WHY IT MATTERED. A radial gradient in hot pink,
 * violet and indigo — the largest element on the page, meaning nothing, in
 * three colours the brand does not contain. It is the single thing that made
 * the page read as generated: every templated landing page has a gradient blob
 * where the product should be.
 *
 * A hero image should show the product or the promise. MiZanova's promise is
 * not "we have AI" — half the market says that. It is that **the names come
 * off before anything leaves the building, and the exact text that was sent is
 * kept**. That is the sentence a principal needs, and it is a sequence, so it
 * is drawn as one.
 *
 * ---------------------------------------------------------------------------
 * DRAWN, NOT PHOTOGRAPHED, AND DELIBERATELY SO
 * ---------------------------------------------------------------------------
 * The obvious hero for a product about children is a photograph of children.
 * Stock photography of neurodiverse children on a page selling software about
 * them is the wrong instinct twice over: the child in it consented to a stock
 * library, not to this, and it invites a reader to picture a real child while
 * reading marketing copy. Nothing here needs a face.
 *
 * Inline SVG rather than a file: it costs no request, works offline with the
 * rest of the shell, and takes the brand tokens so it cannot drift from the
 * logo the way a flat image would.
 *
 * `aria-hidden` because the three steps are written out in the copy beside it.
 * A screen reader hearing the diagram would hear the page twice.
 */
export default function HeroDiagram() {
  return (
    <svg
      viewBox="0 0 420 320"
      className="h-auto w-full"
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        {/* The logo's own gradient, navy through to green. */}
        <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-navy)" />
          <stop offset="55%" stopColor="var(--color-brand-blue)" />
          <stop offset="100%" stopColor="var(--color-brand-green)" />
        </linearGradient>
      </defs>

      {/* --- 1. what the teacher saw ------------------------------------- */}
      <g>
        <rect
          x="8"
          y="18"
          width="196"
          height="96"
          rx="12"
          fill="var(--color-card)"
          stroke="var(--color-border)"
        />
        <text x="26" y="44" className="fill-muted-foreground" fontSize="11">
          WHAT THE TEACHER SAW
        </text>
        {/* A name, legible, because the next panel is about removing it. */}
        <text x="26" y="70" className="fill-foreground" fontSize="15" fontWeight="600">
          Maya left the room
        </text>
        <text x="26" y="92" className="fill-muted-foreground" fontSize="13">
          during reading, 11:20am
        </text>
      </g>

      {/* --- the anonymising step, the whole point ------------------------ */}
      <g>
        <path
          d="M204 66h34"
          stroke="url(#brand)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="221" cy="66" r="17" fill="url(#brand)" />
        {/* A struck-through tag: the name coming off. */}
        <path
          d="M214 66h14M216 60l10 12"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>

      {/* --- 2. what the AI received -------------------------------------- */}
      <g>
        <rect
          x="238"
          y="18"
          width="174"
          height="96"
          rx="12"
          fill="var(--color-card)"
          stroke="url(#brand)"
        />
        <text x="256" y="44" className="fill-muted-foreground" fontSize="11">
          WHAT THE AI RECEIVED
        </text>
        <text x="256" y="70" className="fill-foreground" fontSize="15" fontWeight="600">
          A student left
        </text>
        <text x="256" y="92" className="fill-muted-foreground" fontSize="13">
          during reading, morning
        </text>
      </g>

      {/* --- the strategy comes back -------------------------------------- */}
      <path
        d="M325 114v34"
        stroke="url(#brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 5"
      />

      {/* --- 3. what the teacher gets back -------------------------------- */}
      <g>
        <rect
          x="98"
          y="148"
          width="314"
          height="104"
          rx="12"
          fill="var(--color-card)"
          stroke="var(--color-border)"
        />
        <text x="118" y="174" className="fill-muted-foreground" fontSize="11">
          SUGGESTED STRATEGY
        </text>
        <text x="118" y="200" className="fill-foreground" fontSize="15" fontWeight="600">
          Offer a planned break card
        </text>
        <text x="118" y="222" className="fill-muted-foreground" fontSize="13">
          Used by 3 other classrooms
        </text>
        {/* The specialist gate — a held suggestion is the other half of the
            claim, and it is what stops this being another AI wrapper. */}
        <rect
          x="118"
          y="230"
          width="150"
          height="6"
          rx="3"
          fill="var(--color-brand-green)"
          opacity="0.25"
        />
      </g>

      {/* --- the audit line ----------------------------------------------- */}
      <g>
        <path
          d="M8 282h404"
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <text x="8" y="304" className="fill-muted-foreground" fontSize="12">
          Every sent message is kept, so the claim can be checked
        </text>
      </g>
    </svg>
  )
}
