import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import SiteFooter from '../components/SiteFooter'
import Icon from '../components/Icon'
import HeroDiagram from '../components/HeroDiagram'

/**
 * The public homepage — docs/Figma Pages Design/Landing Page.jpg.
 *
 * Four deliberate differences from that design:
 *
 * 1. The design is branded "InsightED". The product is MiZanova.
 *
 * 2. The design's footer lists Careers, Blog, Changelog, Help Center,
 *    Community, Training and Status. None of those exist. Every link here goes
 *    somewhere real — mostly to sections of this page — for the same reason
 *    Login.tsx omits the Google and Microsoft buttons: a link that looks real
 *    and goes nowhere is worse than no link.
 *
 * 3. The design prints "ABN 12 345 678 901", which is placeholder digits. A
 *    fabricated company number on a public page is a false statement about a
 *    real business, so it is left out until Special Miles supplies the real
 *    one.
 *
 * 4. The design's closing band has a heading and no button. This one has the
 *    button, because that band is the only reason the section exists.
 *
 * Every claim below is one the software actually keeps. "Works offline" says
 * what it really does, including what it does NOT do — records are not stored
 * on the device — because a promise a school discovers to be half-true in a
 * classroom is worse than one that was never made.
 */

const FEATURES = [
  {
    icon: 'stopwatch' as const,
    title: 'Log behaviour in 20 seconds',
    body: 'Three taps, a timer and optional voice-to-text. Notes are never required — a form that insists on them under pressure gets filled with rubbish or skipped entirely.',
  },
  {
    icon: 'shieldCheck' as const,
    title: 'AI suggestions a specialist can hold back',
    body: 'Names and contact details are stripped before anything reaches the AI. Low-confidence or sensitive suggestions go to a human specialist before a teacher ever sees them.',
  },
  {
    icon: 'offline' as const,
    title: 'Keeps working when the wifi does not',
    body: 'The app opens with no connection and observations logged offline are kept on the device, then upload by themselves. Existing records are not stored on the device, because school laptops are shared.',
  },
]

const AUDIENCES = [
  {
    icon: 'schools' as const,
    title: 'For schools',
    body: 'Anonymised trends, a safeguarding queue with acknowledgement times, and staff verification. Leaders see patterns; they do not need to read every incident to do it.',
  },
  {
    icon: 'people' as const,
    title: 'For families',
    body: 'A daily summary using first names only, somewhere to record what home is seeing, shared goals, and a direct line to the care team. Consent can be withdrawn at any time.',
  },
  {
    icon: 'caseload' as const,
    title: 'For specialists',
    body: 'A caseload, the incidents behind each suggestion, and the exact anonymised text that was sent to the AI. Release a suggestion, or replace it.',
  },
]

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* First tab stop on the page. Keyboard and screen reader users should
          not have to pass the whole nav to reach the content. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-btn focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <Logo />

          <nav aria-label="Main" className="hidden gap-5 lg:flex">
            <Link to="/for-schools" className="text-foreground hover:underline">
              For schools
            </Link>
            <Link to="/for-parents" className="text-foreground hover:underline">
              For families
            </Link>
            <Link
              to="/for-specialists"
              className="text-foreground hover:underline"
            >
              For specialists
            </Link>
            <Link to="/pricing" className="text-foreground hover:underline">
              Pricing
            </Link>
            <Link to="/features" className="text-foreground hover:underline">
              Features
            </Link>
            <Link to="/about" className="text-foreground hover:underline">
              About
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* Padded to match the button beside it. As a bare link this was a
                24px tap target — the bare minimum WCAG 2.2 allows, and small
                for a thumb next to a 44px button it is meant to pair with. */}
            <Link
              to="/login"
              className="rounded-btn px-3 py-2.5 font-semibold text-primary hover:underline"
            >
              Log in
            </Link>
            {/* NOT "Get started". /signup creates no account any more — it is
                a signpost — so the old label promised something the next page
                immediately takes away. Three identical buttons all saying it
                was also the most templated thing on the page. */}
            <Link
              to="/enquiry"
              className="rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:brightness-110"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1">
        {/* --- Hero ---------------------------------------------------------- */}
        <section className="bg-primary-subtle">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
            <div>
              <p className="inline-block rounded-btn bg-card px-3 py-1 text-xs font-bold tracking-wider text-primary uppercase">
                Neurodiversity ecosystem
              </p>
              <h1 className="mt-4 text-4xl font-bold text-foreground md:text-5xl">
                Support every learner.
                <br />
                Empower every educator.
              </h1>
              <p className="mt-4 max-w-prose text-lg text-foreground">
                Evidence-based classroom strategies in under twenty seconds.
                Built with educators, checked by specialists, hosted in
                Australia.
              </p>

              {/* These four are the reasons a principal keeps reading, and
                  they were a flat bulleted list in body text. Ticked pills in
                  the brand green give them the weight they earn — and the flag
                  emoji is gone with the rest: it rendered as a different
                  picture on every operating system. */}
              <ul className="mt-6 flex flex-wrap gap-2">
                {[
                  'Hosted in Sydney',
                  'Privacy-first',
                  'Never diagnostic',
                  'Evidence-based',
                ].map((claim) => (
                  <li
                    key={claim}
                    className="inline-flex items-center gap-1.5 rounded-btn bg-card px-3 py-1.5 text-sm font-medium text-foreground"
                  >
                    <Icon
                      name="tick"
                      className="h-4 w-4 shrink-0 text-brand-green"
                    />
                    {claim}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/enquiry"
                  className="rounded-btn bg-primary px-6 py-3 font-semibold text-primary-foreground hover:brightness-110"
                >
                  Book a walkthrough
                </Link>
                <a
                  href="#how-it-works"
                  className="rounded-btn border border-border bg-card px-6 py-3 font-semibold text-foreground"
                >
                  See how it works
                </a>
              </div>
            </div>

            {/* SHOWN ON MOBILE TOO. The gradient this replaced was hidden
                below md, so more than half of visitors met a single column of
                text — the hero had no image at all on the device most people
                open a link on. */}
            <HeroDiagram />
          </div>
        </section>

        {/* --- How it works -------------------------------------------------- */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-bold text-foreground">How it works</h2>
          <p className="mt-2 max-w-prose text-muted-foreground">
            A teacher records what they saw. The system suggests what has worked
            elsewhere. A specialist stays in the loop wherever judgement is
            needed.
          </p>

          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="rounded-card border border-border bg-card shadow-raised p-6"
              >
                {/* A tinted tile rather than a bare glyph. The emoji this
                    replaced rendered as a different picture on every operating
                    system and could not take a brand colour. */}
                <span className="inline-flex rounded-btn bg-brand-navy/10 p-2.5 text-brand-navy">
                  <Icon name={feature.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-muted-foreground">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* --- Who it is for ------------------------------------------------- */}
        <section id="who-its-for" className="bg-card py-16">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-3xl font-bold text-foreground">
              Who it is for
            </h2>
            <ul className="mt-8 grid gap-6 md:grid-cols-3">
              {AUDIENCES.map((audience) => (
                <li
                  key={audience.title}
                  /* A LEFT RULE IN THE BRAND GREEN, not another bordered box.
                     These sat as bare headings while the cards above them had
                     borders — not a decision, just two sections written at
                     different times. Cards here would make four identical
                     grids in a row; a rule marks them as a different kind of
                     thing while still looking deliberate. */
                  className="border-l-2 border-brand-green pl-5"
                >
                  <span className="inline-flex text-brand-green">
                    <Icon name={audience.icon} className="h-6 w-6" />
                  </span>
                  <h3 className="mt-3 text-lg font-bold text-foreground">
                    {audience.title}
                  </h3>
                  <p className="mt-2 text-muted-foreground">{audience.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --- Privacy ------------------------------------------------------- */}
        <section id="privacy" className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-bold text-foreground">
            What happens to a child&rsquo;s information
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <p className="max-w-prose text-muted-foreground">
              Records are stored in Sydney and never leave Australia. Before any
              observation is sent for a strategy suggestion, names, contact
              details and dates of birth are removed — and the exact text that
              was sent is kept, so the claim can be checked rather than taken on
              trust.
            </p>
            <p className="max-w-prose text-muted-foreground">
              A guardian gives consent for AI suggestions and can withdraw it at
              any moment, which stops them immediately. MiZanova suggests
              classroom strategies. It does not diagnose, and it is not a
              clinical tool.
            </p>
          </div>
        </section>

        {/* --- Closing call to action ---------------------------------------- */}
        <section className="bg-primary py-16 text-center">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-3xl font-bold text-primary-foreground md:text-4xl">
              Ready to support every learner?
            </h2>
            {/* opacity on text is how contrast quietly fails a check that
                passed when it was written. The muted tone is a real token. */}
            <p className="mt-3 text-lg text-primary-foreground">
              Tell us about your school and we will show you what a term of
              logging actually looks like.
            </p>
            <Link
              to="/enquiry"
              className="mt-8 inline-block rounded-btn bg-card px-8 py-3 font-semibold text-primary hover:brightness-105"
            >
              Talk to us about your school
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
