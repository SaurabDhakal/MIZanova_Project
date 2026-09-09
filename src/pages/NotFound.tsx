import { Link } from 'react-router-dom'

/**
 * The 404, which anybody can reach and nobody arrives at on purpose.
 *
 * It used to be a heading, a sentence and one button, top-aligned on an
 * otherwise empty page — no header, no footer, and nowhere to go but "/". That
 * is the correct destination for a signed-in user, whose "/" is their own
 * dashboard, and a dead end for a visitor who mistyped a link off the public
 * site: it puts them back on the homepage having lost whatever they were
 * looking for.
 *
 * So there are three ways out rather than one, and the two extra go to the
 * pages somebody who is lost actually wants. It is not wrapped in
 * PublicLayout, deliberately — this route is `path="*"`, so it catches bad
 * URLs inside the signed-in app too, and showing a signed-in teacher a "Log
 * in / Talk to us" header would be a stranger answer than a plain page.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      tabIndex={-1}
      aria-label="Page not found"
      className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16"
    >
      <div className="w-full max-w-lg text-center">
        <h1 className="text-display text-balance text-foreground">
          Page not found
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          That address doesn&rsquo;t match any screen in MiZanova. It may have
          been a typo, or a link that was never real.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          {/* "/" is right for everybody: signed out it is the homepage, signed
              in it is whichever dashboard the database role says. */}
          <Link
            to="/"
            className="pressable inline-flex min-h-11 items-center rounded-btn bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-raised hover:brightness-110"
          >
            Go back
          </Link>
          <Link
            to="/help"
            className="pressable inline-flex min-h-11 items-center rounded-btn border border-border bg-card px-6 py-3 font-semibold text-foreground hover:border-primary hover:text-primary"
          >
            Help
          </Link>
          <Link
            to="/enquiry"
            className="pressable inline-flex min-h-11 items-center rounded-btn border border-border bg-card px-6 py-3 font-semibold text-foreground hover:border-primary hover:text-primary"
          >
            Tell us what broke
          </Link>
        </div>
      </div>
    </main>
  )
}
