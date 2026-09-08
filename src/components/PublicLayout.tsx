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
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-center text-4xl font-bold text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mx-auto mt-3 max-w-2xl text-center text-lg text-muted-foreground">
              {subtitle}
            </p>
          )}
          <div className="mt-10">{children}</div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
