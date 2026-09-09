import SiteFooter from './SiteFooter'
import SiteHeader from './SiteHeader'

/**
 * The frame for public, signed-out pages that are not the home page.
 *
 * Extracted when Pricing arrived rather than after the fourth copy of a header
 * had drifted apart — the footer carries the Australian-hosting and
 * not-a-clinical-tool statements, and those must read identically everywhere.
 *
 * The header went the same way, one component later: it is SiteHeader, shared
 * with the homepage, and the link list lives there. A new public page joins
 * PUBLIC_LINKS in that file and appears in both places and in the mobile menu
 * at once.
 *
 * ---------------------------------------------------------------------------
 * THE MASTHEAD, AND THE THREE COLUMN WIDTHS IT REPLACED
 * ---------------------------------------------------------------------------
 * A page used to open with a centred h1 sitting on the page background, with
 * left-aligned body copy underneath it — two alignment axes on one page, and
 * no relationship at all to the homepage, which opens with a full-width band.
 * A visitor moving from the homepage to About met what looked like a different
 * site.
 *
 * Underneath it there were three widths in play and none of them agreed: this
 * frame was max-w-6xl, every <Section> was max-w-3xl, and <CardGrid> was
 * max-w-5xl. Two of those are now one:
 *
 *   FRAME  max-w-4xl — the outer bound, and the width a card grid fills.
 *   PROSE  max-w-2xl — every block of reading text, and the masthead.
 *
 * Both are centred, so they share one axis and a card grid reads as a
 * deliberate break-out rather than as a fourth guess at a width. The prose
 * width is the reason for the change: at max-w-3xl the body copy on About
 * measured 76 characters a line, past the point where the eye starts losing
 * the start of the next one. At max-w-2xl it is 68.
 */
export default function PublicLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-btn focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main" tabIndex={-1} aria-label={title} className="flex-1">
        {/* THE SAME BAND THE HOMEPAGE HERO SITS IN. That is the whole point of
            it: ten pages that used to begin on the bare page background now
            begin the way the homepage does, so the site holds together when
            somebody moves between them. */}
        {/* The same gradient field the homepage hero sits in, so a visitor
            moving from / to /about meets one site rather than two. `isolate`
            gives the two decorative layers a stacking context of their own —
            without it their z-order is settled against the sticky header. */}
        <div className="relative isolate overflow-hidden border-b border-border bg-primary-subtle">
          <div aria-hidden="true" className="aurora absolute inset-0" />
          <div className="relative mx-auto max-w-4xl px-6 py-14 md:py-20">
            <div className="mx-auto max-w-2xl">
              {/* text-display, not text-4xl. They are the same 36px on a
                  phone; only this one carries the tracking, and it is the
                  token that has always said it was for exactly this. */}
              <h1 className="text-display text-balance text-foreground">
                {title}
              </h1>
              <span
                aria-hidden="true"
                className="brand-rule mt-6 block h-1 w-20 rounded-full"
              />
              {subtitle && (
                <p className="mt-5 text-lg text-pretty text-foreground">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-6 pt-12 pb-20 md:pt-16">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
