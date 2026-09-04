import type { ReactNode } from 'react'

/**
 * What a screen does not do, folded away.
 *
 * WHY THESE NOTES EXIST AT ALL, AND WHY NONE OF THEM IS BEING DELETED. The
 * rule this product works to is that a control which looks authoritative and
 * changes nothing is worse than an admission — so where the design promised
 * something the database cannot support, the promise is absent and the absence
 * is stated. That sentence is the only thing standing between an honest gap and
 * a feature somebody believes in.
 *
 * WHY IT IS A <details> NOW. The note was a full-width card headed "Not built
 * yet", and two of the five sit on Account → Profile and Security, which every
 * one of the six roles reaches from the account menu. The effect was that a
 * finished screen announced itself as unfinished, in the same weight as its
 * real content, on almost every page a person visits. Folding it changes not
 * one word of the claim: the summary still says what it is, it is still one
 * keystroke away, and <details> is natively accessible — it simply stops the
 * absence outshouting the thing that is actually there.
 *
 * NOT FOR A WARNING. If a person needs the sentence in order to use the screen
 * safely — "nobody will remind you, so it appears here and nowhere else" —
 * that is not a list of missing features and it does not belong behind a fold.
 * Leave those as ordinary visible copy.
 */
export default function NotBuiltYet({
  title = 'What this screen does not do yet',
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <details className="mt-6 rounded-card border border-border bg-background px-6 py-4">
      <summary className="cursor-pointer font-medium text-primary">
        {title}
      </summary>
      <div className="mt-2 max-w-prose space-y-2 text-sm text-muted-foreground">
        {children}
      </div>
    </details>
  )
}
