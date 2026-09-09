/**
 * Drawn pictures of the product itself.
 *
 * ---------------------------------------------------------------------------
 * WHY DRAWN, AND WHY NOT A SCREENSHOT EITHER
 * ---------------------------------------------------------------------------
 * The obvious hero image for a product about children is a photograph of
 * children. HeroDiagram has always refused that and the reason holds here: the
 * child in a stock library consented to a stock library, not to this, and a
 * face invites somebody to picture a real child while they read marketing copy.
 *
 * A real screenshot is the next obvious answer and it is worse than it looks.
 * A PNG of a screen is a file to fetch — this stylesheet self-hosts Inter
 * specifically so the product makes no external request (NFR2, NFR5) — and it
 * is a fixed set of pixels that goes stale the day the screen changes, blurs
 * on a retina display unless it ships at 2x, and carries whatever seed data
 * happened to be on screen the day it was taken.
 *
 * Drawn, it costs no request, stays sharp at any size, follows the palette
 * when the palette changes, and shows only what somebody chose to put in it.
 *
 * ---------------------------------------------------------------------------
 * THESE ARE ILLUSTRATIONS AND THE CLAIMS IN THEM ARE REAL
 * ---------------------------------------------------------------------------
 * Every element corresponds to something the software does: the timer and the
 * three categories are the twenty-second logging claim, the first-names-only
 * summary is what a family actually sees, and the goal bar is a figure
 * calculated from steps rather than typed in. Nothing here shows a feature
 * that does not exist — a picture is a claim, and this product's whole habit
 * is not making ones it cannot keep.
 *
 * aria-hidden, like the figures: each sits beside copy saying the same thing.
 */

function ShotDefs({ id }: { id: string }) {
  return (
    <defs>
      {/* Deeper than the figures' lift: these float over a gradient field
          rather than sitting on a flat card, so they need to read as the
          nearest thing to the viewer. */}
      <filter id={`${id}-float`} x="-25%" y="-25%" width="150%" height="160%">
        <feDropShadow
          dy="10"
          stdDeviation="14"
          floodColor="#0f172a"
          floodOpacity="0.16"
        />
      </filter>
      <clipPath id={`${id}-window`}>
        <rect x="0" y="0" width="480" height="310" rx="14" />
      </clipPath>
      <clipPath id={`${id}-phone`}>
        <rect x="8" y="0" width="224" height="410" rx="28" />
      </clipPath>
    </defs>
  )
}

/**
 * THE TWENTY-SECOND CLAIM, DRAWN.
 *
 * The homepage says a teacher records what they saw in three taps, a timer and
 * about twenty seconds. This is that screen: a child already chosen, a running
 * timer, three categories with one taken, and a save. The notes field is
 * visibly optional because the copy makes a point of it — a form that insists
 * on notes under pressure gets filled with rubbish or skipped.
 */
export function LoggerShot() {
  const id = 'shot-log'
  const rail = ['Home', 'Class', 'Log', 'Goals', 'Messages']

  return (
    <svg
      viewBox="0 0 480 330"
      className="h-auto w-full"
      aria-hidden="true"
      role="presentation"
    >
      <ShotDefs id={id} />

      <g filter={`url(#${id}-float)`}>
        <g clipPath={`url(#${id}-window)`}>
          <rect x="0" y="0" width="480" height="310" fill="var(--color-card)" />

          {/* Window chrome. Three dots is the universal shorthand for "this is
              an application", and it costs 34 pixels to say it. */}
          <rect
            x="0"
            y="0"
            width="480"
            height="34"
            fill="var(--color-background)"
          />
          {[18, 36, 54].map((cx) => (
            <circle key={cx} cx={cx} cy="17" r="4.5" fill="var(--color-border)" />
          ))}
          {/* WHOSE SCREEN THIS IS. A window with nobody signed into it is a
              wireframe; one initial and a school name is the difference
              between a diagram of an app and a picture of one in use. */}
          <text x="196" y="21" fontSize="11" fill="var(--color-muted-foreground)">
            Rosewood Primary
          </text>
          <circle cx="452" cy="17" r="10" fill="var(--color-brand-navy)" />
          <text
            x="452"
            y="21"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="#ffffff"
          >
            KP
          </text>
          <path d="M0 34h480" stroke="var(--color-border)" strokeWidth="1" />

          {/* The navy rail, which is the rail all five dashboards share. */}
          <rect
            x="0"
            y="34"
            width="104"
            height="276"
            fill="var(--color-sidebar)"
          />
          {rail.map((item, i) => {
            const y = 58 + i * 30
            const active = item === 'Log'
            return (
              <g key={item}>
                {active && (
                  <rect
                    x="8"
                    y={y - 14}
                    width="88"
                    height="26"
                    rx="6"
                    fill="rgba(255,255,255,0.12)"
                  />
                )}
                <rect
                  x="18"
                  y={y - 6}
                  width="10"
                  height="10"
                  rx="2.5"
                  fill={
                    active
                      ? 'var(--color-brand-green)'
                      : 'var(--color-sidebar-muted)'
                  }
                />
                <text
                  x="36"
                  y={y + 3}
                  fontSize="11"
                  fontWeight={active ? '600' : '400'}
                  fill={
                    active
                      ? 'var(--color-sidebar-foreground)'
                      : 'var(--color-sidebar-muted)'
                  }
                >
                  {item}
                </text>
              </g>
            )
          })}

          <text
            x="128"
            y="72"
            fontSize="17"
            fontWeight="700"
            className="fill-foreground"
          >
            What did you see?
          </text>

          <rect
            x="128"
            y="86"
            width="108"
            height="26"
            rx="13"
            fill="var(--color-primary-subtle)"
          />
          {/* An initial, never a face. The product does not hold photographs of
              children and this picture will not imply that it does. */}
          <circle cx="141" cy="99" r="8" fill="var(--color-primary)" />
          <text
            x="141"
            y="103"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill="#ffffff"
          >
            M
          </text>
          <text x="155" y="103" fontSize="12" className="fill-primary">
            Maya R.
          </text>

          {/* THE TIMER, ACTUALLY RUNNING — see the animation block in
              index.css. The claim beside this artwork is "about twenty
              seconds", and a still 00:18 is a screenshot of that claim rather
              than the claim itself. Three readings share this position and the
              stylesheet shows one at a time; with reduced motion it settles on
              00:18, which is the frame this used to be. */}
          <rect
            x="380"
            y="86"
            width="76"
            height="26"
            rx="13"
            fill="var(--color-success-subtle)"
          />
          <circle
            className="logger-ring"
            cx="396"
            cy="99"
            r="4"
            fill="var(--color-success-strong)"
          />
          <circle
            className="logger-dot"
            cx="396"
            cy="99"
            r="4"
            fill="var(--color-success-strong)"
          />
          {(
            [
              ['00:06', 'logger-t1'],
              ['00:12', 'logger-t2'],
              ['00:18', 'logger-t3'],
            ] as const
          ).map(([reading, step]) => (
            <text
              key={reading}
              x="408"
              y="104"
              fontSize="13"
              fontWeight="600"
              className={`${step} fill-success-foreground tabular-nums`}
            >
              {reading}
            </text>
          ))}

          {/* A dot per category, in the colour the app gives that category.
              Three identical outlined rectangles is a wireframe; three with
              their own colour is a screen somebody uses. */}
          {(
            [
              /* SHORT BECAUSE THE BUTTON IS 104 UNITS WIDE AND THE DOT TAKES
                 SOME OF IT. With a colour dot in front, a 104-wide chip leaves
                 about 73 for words, and "Left the room" needs 84 — measured, it
                 ran 4 units out through the side. These are the lengths a real
                 category chip is anyway; the long version was only ever
                 possible because the button had nothing else in it. */
              ['Left room', 'var(--color-warning)'],
              ['Refusal', 'var(--color-accent)'],
              ['Noise', 'var(--color-brand-blue)'],
            ] as const
          ).map(([label, tint], i) => {
            const x = 128 + i * 116
            const taken = i === 0
            return (
              <g key={label}>
                <rect
                  x={x}
                  y="132"
                  width="104"
                  height="46"
                  rx="10"
                  fill={taken ? 'var(--color-primary)' : 'var(--color-card)'}
                  stroke={
                    taken ? 'var(--color-primary)' : 'var(--color-input-border)'
                  }
                />
                <circle cx={x + 16} cy="155" r="4.5" fill={taken ? '#ffffff' : tint} />
                <text
                  x={x + 28}
                  y="160"
                  fontSize="12.5"
                  fontWeight="600"
                  fill={taken ? '#ffffff' : 'var(--color-foreground)'}
                >
                  {label}
                </text>
              </g>
            )
          })}

          <rect
            x="128"
            y="192"
            width="328"
            height="42"
            rx="8"
            fill="var(--color-background)"
            stroke="var(--color-input-border)"
            strokeDasharray="5 4"
          />
          <text x="144" y="218" fontSize="12.5" className="fill-muted-foreground">
            Notes — optional, and it saves without them
          </text>

          <rect
            x="128"
            y="250"
            width="120"
            height="40"
            rx="8"
            fill="var(--color-primary)"
          />
          <text
            x="188"
            y="275"
            textAnchor="middle"
            fontSize="14"
            fontWeight="600"
            fill="#ffffff"
          >
            Save log
          </text>
          <text x="262" y="275" fontSize="12.5" className="fill-muted-foreground">
            Works with no connection
          </text>
        </g>

        <rect
          x="0.5"
          y="0.5"
          width="479"
          height="309"
          rx="14"
          fill="none"
          stroke="var(--color-border)"
        />
      </g>
    </svg>
  )
}

/**
 * WHAT A FAMILY ACTUALLY SEES, on the device they actually see it on.
 *
 * First name only, one thing the teacher chose to share, a goal figure
 * calculated from steps rather than typed, and somewhere to add what home is
 * seeing. Deliberately NOT a feed of every behaviour log — the product does
 * not give a parent that, and a picture promising it would be the page's one
 * dishonest pixel.
 */
export function FamilyPhoneShot() {
  const id = 'shot-phone'

  return (
    <svg
      viewBox="0 0 240 418"
      className="h-auto w-full"
      aria-hidden="true"
      role="presentation"
    >
      <ShotDefs id={id} />

      <g filter={`url(#${id}-float)`}>
        <g clipPath={`url(#${id}-phone)`}>
          <rect x="8" y="0" width="224" height="410" fill="var(--color-background)" />

          {/* The notch, which is what makes a rounded rectangle read as a
              phone rather than as another card. */}
          <rect x="92" y="10" width="56" height="9" rx="4.5" fill="var(--color-border)" />

          <text x="28" y="52" fontSize="11" className="fill-muted-foreground">
            WEDNESDAY
          </text>
          <text
            x="28"
            y="74"
            fontSize="18"
            fontWeight="700"
            className="fill-foreground"
          >
            Maya&rsquo;s day
          </text>

          {/* Shared by the school. One item, because one is what gets shared. */}
          <rect
            x="24"
            y="90"
            width="192"
            height="86"
            rx="12"
            fill="var(--color-card)"
            stroke="var(--color-border)"
          />
          <text x="40" y="112" fontSize="10.5" className="fill-brand-green-ink">
            FROM SCHOOL
          </text>
          <text
            x="40"
            y="134"
            fontSize="13.5"
            fontWeight="600"
            className="fill-foreground"
          >
            A good morning
          </text>
          <text x="40" y="154" fontSize="12" className="fill-muted-foreground">
            Settled in reading, asked
          </text>
          <text x="40" y="168" fontSize="12" className="fill-muted-foreground">
            for her break card
          </text>

          {/* A goal, with a figure the system calculated. */}
          <rect
            x="24"
            y="188"
            width="192"
            height="82"
            rx="12"
            fill="var(--color-card)"
            stroke="var(--color-border)"
          />
          <text x="40" y="210" fontSize="10.5" className="fill-brand-blue-ink">
            SHARED GOAL
          </text>
          <text
            x="40"
            y="232"
            fontSize="13.5"
            fontWeight="600"
            className="fill-foreground"
          >
            Asking for a break
          </text>
          <rect x="40" y="244" width="160" height="7" rx="3.5" fill="var(--color-border)" />
          <rect
            x="40"
            y="244"
            width="104"
            height="7"
            rx="3.5"
            fill="var(--color-brand-green)"
          />
          <text x="40" y="264" fontSize="11.5" className="fill-muted-foreground">
            4 of 6 steps
          </text>

          {/* The half a parent supplies. */}
          <rect
            x="24"
            y="282"
            width="192"
            height="72"
            rx="12"
            fill="var(--color-primary-subtle)"
          />
          <text x="40" y="304" fontSize="10.5" className="fill-brand-blue-ink">
            AT HOME
          </text>
          <text x="40" y="326" fontSize="13" className="fill-foreground">
            Add what you saw
          </text>
          <rect x="40" y="334" width="120" height="1" fill="var(--color-primary)" opacity="0.25" />
          <circle cx="196" cy="318" r="14" fill="var(--color-primary)" />
          <path
            d="M196 312v12M190 318h12"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
          />

          <text x="28" y="382" fontSize="11" className="fill-muted-foreground">
            First names only. Consent can be
          </text>
          <text x="28" y="396" fontSize="11" className="fill-muted-foreground">
            withdrawn at any time.
          </text>
        </g>

        <rect
          x="8.5"
          y="0.5"
          width="223"
          height="409"
          rx="28"
          fill="none"
          stroke="var(--color-border)"
        />
      </g>
    </svg>
  )
}

/**
 * The anonymised half, as a card small enough to float over the window.
 *
 * THE HERO USED TO BE ONE FLAT RECTANGLE ON A FIELD. A single screenshot
 * centred in its column is the most common hero on the internet and it has no
 * depth: there is one plane, so nothing is in front of anything and the eye
 * has no route through the picture.
 *
 * Two planes fix that, and the second one is not decoration — it is the claim.
 * The window behind shows a teacher typing a child's name; this card shows what
 * actually left the building. Overlapped, the two are the product's whole
 * argument in one glance, before a word of copy is read.
 */
export function AnonymisedCard() {
  const id = 'shot-anon'
  return (
    <svg
      viewBox="0 0 260 132"
      className="h-auto w-full"
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        <linearGradient id={`${id}-brand`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-navy)" />
          <stop offset="55%" stopColor="var(--color-brand-blue)" />
          <stop offset="100%" stopColor="var(--color-brand-green)" />
        </linearGradient>
        {/* Heavier than the window's own shadow, because this sits in front of
            it and has to look like it. */}
        <filter id={`${id}-float`} x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow
            dy="12"
            stdDeviation="16"
            floodColor="#0f172a"
            floodOpacity="0.22"
          />
        </filter>
      </defs>

      <g filter={`url(#${id}-float)`}>
        <rect
          x="4"
          y="4"
          width="252"
          height="112"
          rx="14"
          fill="var(--color-card)"
          stroke="var(--color-border)"
        />
        <text x="24" y="34" fontSize="12" fill="var(--color-muted-foreground)">
          WHAT THE AI RECEIVED
        </text>
        <text
          x="24"
          y="62"
          fontSize="19"
          fontWeight="700"
          fill="var(--color-foreground)"
        >
          A student left
        </text>
        <text x="24" y="86" fontSize="13.5" fill="var(--color-muted-foreground)">
          during reading
        </text>

        {/* The name coming off, as a mark rather than a sentence. */}
        <circle cx="220" cy="60" r="20" fill={`url(#${id}-brand)`} />
        <path
          d="M211 60h18M213 52l14 16"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
