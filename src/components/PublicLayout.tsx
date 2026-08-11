import { Link, NavLink } from 'react-router-dom'
import Logo from './Logo'
import SiteFooter from './SiteFooter'

/**
 * The frame for public, signed-out pages that are not the home page.
 *
 * Extracted when Pricing arrived rather than after the fourth copy of a header
 * had drifted apart — the footer carries the Australian-hosting and
 * not-a-clinical-tool statements, and those must read identically everywhere.
 *
 * The nav lists only destinations that exist. As For Schools, For Parents, For
 * Specialists, Resources and About are built, they join it here and nowhere
 * else.
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
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'font-semibold text-primary'
      : 'text-foreground hover:underline'

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-btn focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <Link to="/" aria-label="MiZanova home">
            <Logo />
          </Link>

          {/* The six the Figma header asks for. Each goes to a real page —
              which is why this list took until now: the pages had to exist
              before the links could. */}
          <nav aria-label="Main" className="hidden gap-5 lg:flex">
            <NavLink to="/for-schools" className={linkClass}>
              For schools
            </NavLink>
            <NavLink to="/for-parents" className={linkClass}>
              For families
            </NavLink>
            <NavLink to="/for-specialists" className={linkClass}>
              For specialists
            </NavLink>
            <NavLink to="/pricing" className={linkClass}>
              Pricing
            </NavLink>
            <NavLink to="/features" className={linkClass}>
              Features
            </NavLink>
            <NavLink to="/about" className={linkClass}>
              About
            </NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:brightness-110"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

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
