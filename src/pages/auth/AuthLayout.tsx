import { Link } from 'react-router-dom'
import Logo from '../../components/Logo'

/**
 * The frame shared by every signed-out screen: brand bar, centred card, footer.
 *
 * Extracted when the password-reset pages arrived and there were suddenly four
 * copies of the same markup. Worth doing for more than tidiness — the footer
 * carries the Australian-hosting statement, and four hand-maintained copies is
 * how one of them ends up saying something different.
 */
export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-primary-subtle">
      <header className="border-b border-border bg-card px-6 py-4">
        <Link to="/" aria-label="MiZanova home">
          <Logo />
        </Link>
      </header>

      {/* `id` and `tabIndex` so DocumentTitle can move focus here on a route
          change, and `aria-label` so landing here says WHICH signed-out screen
          you are on. Every other layout in the product had these; this one did
          not, so moving between Sign in, Forgot password and Enter your code
          announced nothing and left focus on the link you came from. */}
      <main
        id="main"
        tabIndex={-1}
        aria-label={title}
        className="flex flex-1 items-center justify-center p-4"
      >
        {/* shadow-lifted, not raised. This card is the only thing on the
            screen and it now sits on a coloured ground; the higher of the two
            elevation tokens is what says "this is the thing" rather than "this
            is one of several panels". */}
        <div className="w-full max-w-md rounded-card border border-border bg-card p-8 shadow-lifted">
          {/* text-title. It was text-3xl — 30px, untracked — inside a 448px
              card, which is a page-title size in a place that is not a page
              title. */}
          <h1 className="text-title text-center text-balance text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-center text-muted-foreground">{subtitle}</p>
          )}
          <div className="mt-8">{children}</div>
        </div>
      </main>

      {/* Privacy and Help are reachable from every page of the public site and
          were reachable from none of the signed-out ones — which is backwards.
          Somebody who cannot get in is the person most likely to want help, and
          a product holding children's records should never make its privacy
          statement something you have to be signed in to find. */}
      <footer className="px-6 py-6 text-center text-xs text-muted-foreground">
        <nav aria-label="Footer" className="mb-2 flex justify-center gap-4">
          <Link to="/privacy" className="inline-flex min-h-6 items-center hover:text-foreground hover:underline">
            Privacy
          </Link>
          <Link to="/help" className="inline-flex min-h-6 items-center hover:text-foreground hover:underline">
            Help
          </Link>
          <Link to="/security" className="inline-flex min-h-6 items-center hover:text-foreground hover:underline">
            Security
          </Link>
        </nav>
        © 2026 MiZanova · Special Miles · Data hosted in Australia
      </footer>
    </div>
  )
}
