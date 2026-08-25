import type { ReactNode } from 'react'

/**
 * The top of a screen: its name, one line saying what it is for, and whatever
 * you can do to the whole page.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A COMPONENT AND NOT A PATTERN PEOPLE COPY
 * ---------------------------------------------------------------------------
 * It was a pattern people copied, and by ten screens it had drifted: leads ran
 * to two and three sentences on some pages and one on others, spacing differed,
 * and every one of them was pinned to a narrow column on the left of a wide
 * screen — which reads as an unfinished draft rather than a considered page.
 *
 * Saurab's note was the same on eight screens in a row, which is the signal
 * that it is one fault rather than eight.
 *
 * ---------------------------------------------------------------------------
 * THE LEAD IS ONE SENTENCE, AND THAT IS ENFORCED BY HAVING NOWHERE TO PUT TWO
 * ---------------------------------------------------------------------------
 * A page heading answers "where am I". The lead answers "what is this for", in
 * the time somebody gives it, which is about one line. Anything longer is
 * background, and background belongs in <PageNote> at the foot of the screen
 * where it is available without being in the way.
 */
export default function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string
  /** ONE sentence. Longer context goes in <PageNote>. */
  lead: string
  /** Page-level controls — a primary button, a filter. Right-aligned. */
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 border-b border-border pb-5">
      {/*
        The actions sit on the heading's row from `sm` up and wrap beneath it on
        a phone. `gap-x-6` rather than `justify-between` alone, so a long title
        and a wide button cannot end up touching.
      */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <h1 className="text-title text-foreground">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {/*
        Full width, deliberately. It was `max-w-prose`, which is right for a
        paragraph and wrong for a single line — it left every screen's opening
        sentence hugging the left edge under a heading that spanned the page.
        One sentence cannot outrun a comfortable measure, so there is nothing
        left for the cap to protect.
      */}
      <p className="mt-1.5 text-muted-foreground">{lead}</p>
    </header>
  )
}

/**
 * The quiet paragraph at the foot of a screen: what this page does NOT show,
 * what a number cannot tell you, why something was left out.
 *
 * ---------------------------------------------------------------------------
 * KEPT, NOT DELETED — THESE ARE THE HONEST BITS
 * ---------------------------------------------------------------------------
 * Every one of these says something a reader would otherwise get wrong. That an
 * empty problem list means nothing was reported rather than that everything is
 * working. That an expired screening check removes nobody's access. That the
 * page shows "Ethan M." because a screen spanning every school has no business
 * being a directory of full names. Delete them and the screens become confident
 * about things they cannot actually know.
 *
 * ---------------------------------------------------------------------------
 * SPANS THE PAGE, BUT THE LINES DO NOT
 * ---------------------------------------------------------------------------
 * These were bare paragraphs capped at `max-w-prose`, sitting bottom-left of a
 * wide screen looking like something nobody finished. Spanning the full width
 * fixes the look and breaks the reading: on a 1400px monitor a single column of
 * 12px text runs to about 180 characters a line, and the eye loses its place
 * returning to the left margin.
 *
 * Two columns from `lg` up gives both — the block spans, the measure stays
 * short. Below `lg` there is not enough width for two, so it stays as one.
 *
 * The rule and the inset are what make it read as a footnote rather than as
 * content somebody forgot to format.
 */
export function PageNote({ children }: { children: ReactNode }) {
  return (
    <aside className="mt-10 rounded-card border border-border bg-background/60 px-5 py-4">
      <p className="text-xs leading-relaxed text-muted-foreground lg:columns-2 lg:gap-10">
        {children}
      </p>
    </aside>
  )
}
