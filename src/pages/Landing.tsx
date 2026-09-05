import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
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
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PAGE WAS MISSING, AND WHY IT WAS EASY TO MISS
 * ---------------------------------------------------------------------------
 * This file used to carry its OWN header, near-identical to PublicLayout's,
 * and the two drifted: "For individuals" was added to one and not the other,
 * so a whole audience could not be reached from the front door. Both now use
 * <PublicHeader />, which explains itself at length.
 *
 * Montessori was missing for a different reason. `OrganisationKind` has
 * admitted 'montessori' since the tenancy work and AddSchoolSection has offered
 * it in a dropdown, so the product could take the customer while every public
 * word said "school". docs/11 treats Montessori and early years as a real
 * market and sets out what changes; this page now says so, and db/095 lets
 * somebody actually enquire.
 */

/**
 * THE THREE STEPS ARE A SEQUENCE, AND THE SECTION FINALLY SAYS SO.
 *
 * This was headed "How it works" over three unnumbered capability cards —
 * speed, AI, offline — which is a feature grid wearing a process heading. The
 * intro line underneath it always described the real sequence: a teacher
 * records, the system suggests, a specialist stays in the loop.
 *
 * So the numbers are not decoration. They are the order the thing actually
 * happens in, and the offline and twenty-second claims sit inside step one,
 * which is where they belong — they are facts about recording, not steps.
 */
const STEPS = [
  {
    icon: 'stopwatch' as const,
    title: 'A teacher records what they saw',
    body: 'Three taps, a timer and optional voice-to-text, in about twenty seconds. Notes are never required — a form that insists on them under pressure gets filled with rubbish or skipped entirely. It works with no connection, and what is logged offline uploads by itself.',
  },
  {
    icon: 'ai' as const,
    title: 'The AI suggests what has worked elsewhere',
    body: 'Names, contact details and dates of birth are stripped before anything is sent, and the exact text that went is kept so the claim can be checked rather than trusted. It suggests classroom strategies. It never diagnoses.',
  },
  {
    icon: 'shieldCheck' as const,
    title: 'A specialist stays in the loop',
    body: 'Low-confidence or sensitive suggestions go to a human specialist before a teacher ever sees them. They can release one, replace it, or reject it — and they can read the anonymised text the AI was given.',
  },
]

const AUDIENCES = [
  {
    icon: 'schools' as const,
    title: 'For schools',
    to: '/for-schools',
    body: 'Anonymised trends, a safeguarding queue with acknowledgement times, and staff verification. Leaders see patterns; they do not need to read every incident to do it.',
  },
  {
    icon: 'people' as const,
    title: 'For families',
    to: '/for-parents',
    body: 'A daily summary using first names only, somewhere to record what home is seeing, shared goals, and a direct line to the care team. Consent can be withdrawn at any time.',
  },
  {
    icon: 'caseload' as const,
    title: 'For specialists',
    to: '/for-specialists',
    body: 'A caseload, the incidents behind each suggestion, and the exact anonymised text that was sent to the AI. Release a suggestion, or replace it.',
  },
  {
    /* SHIPPED WITH db/088 AND NEVER MENTIONED HERE. See the file header. */
    icon: 'user' as const,
    title: 'For individuals',
    to: '/for-individuals',
    body: 'No school, nobody else involved. Short courses and reading written for neurodivergent adults, and suggestions for your own situation — with nothing reported to anybody.',
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

      <PublicHeader />

      <main id="main" tabIndex={-1} className="flex-1">
        {/* --- Hero ---------------------------------------------------------- */}
        <section className="bg-primary-subtle">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
            <div>
              <p className="inline-block rounded-btn bg-card px-3 py-1 text-xs font-bold tracking-wider text-primary uppercase">
                Neurodiversity ecosystem
              </p>
              <h1 className="mt-4 text-4xl font-bold text-balance text-foreground md:text-5xl">
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
        <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
          {/* THE EYEBROW IS NOT ORNAMENT. Four sections in a row opened with a
              bare h2 and nothing to separate them but whitespace, so the page
              read as one long column. A small label above each heading gives
              the eye a place to land and says what kind of thing follows. */}
          <p className="text-xs font-bold tracking-wider text-brand-blue uppercase">
            The sequence
          </p>
          <h2 className="mt-2 text-3xl font-bold text-balance text-foreground">
            How it works
          </h2>
          <p className="mt-2 max-w-prose text-muted-foreground">
            A teacher records what they saw. The system suggests what has worked
            elsewhere. A specialist stays in the loop wherever judgement is
            needed.
          </p>

          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="relative rounded-card border border-border bg-card p-6 shadow-raised"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex rounded-btn bg-brand-navy/10 p-2.5 text-brand-navy">
                    <Icon name={step.icon} className="h-6 w-6" />
                  </span>
                  {/* The number is the step, so it is announced as one rather
                      than left as a decorative glyph beside the heading. */}
                  <span className="text-sm font-bold text-muted-foreground tabular-nums">
                    <span className="sr-only">Step </span>
                    {i + 1} of {STEPS.length}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-balance text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* --- Who it is for ------------------------------------------------- */}
        <section id="who-its-for" className="bg-card py-20">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-xs font-bold tracking-wider text-brand-green uppercase">
              Four ways in
            </p>
            <h2 className="mt-2 text-3xl font-bold text-balance text-foreground">
              Who it is for
            </h2>

            {/* TWO COLUMNS, NOT FOUR. A fourth audience arrived and a
                four-across grid at this text length gives each card a column
                too narrow to read. Two columns keep the measure sane and let
                the cards keep their body copy. */}
            <ul className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
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
                  {/* Each of these pages existed and the homepage named them
                      without linking to them. */}
                  <Link
                    to={audience.to}
                    className="mt-3 inline-block font-semibold text-primary hover:underline"
                  >
                    {audience.title} &rarr;
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --- Not only schools ---------------------------------------------
            THE PRODUCT HAS SOLD TO MORE THAN SCHOOLS SINCE THE TENANCY WORK
            AND THE PUBLIC SITE NEVER SAID SO. `OrganisationKind` admits
            montessori and ecec, AddSchoolSection offers them, and docs/11
            sets out what actually changes in one.

            Only Montessori and early years are named. The type also carries
            ndis_provider, corporate and practice, and claiming those on a
            homepage would be advertising markets nobody has agreed to enter —
            the same fault as printing an ABN we were never given.
            ------------------------------------------------------------------ */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="rounded-card border border-border bg-primary-subtle p-8 md:p-10">
            <div className="grid gap-8 md:grid-cols-2 md:items-center">
              <div>
                <p className="text-xs font-bold tracking-wider text-brand-blue uppercase">
                  Not only schools
                </p>
                <h2 className="mt-2 text-3xl font-bold text-balance text-foreground">
                  Montessori centres and early years
                </h2>
                <p className="mt-3 max-w-prose text-foreground">
                  A Montessori setting does not have teachers, classes or year
                  levels &mdash; it has guides, environments and mixed-age
                  groupings. A screen labelled &ldquo;Behaviour Incident &mdash;
                  Year 3&rdquo; tells a guide immediately that the product was
                  not built for them.
                </p>
                <p className="mt-3 max-w-prose text-foreground">
                  So it is not built that way. Same safeguarding, same
                  specialist review, same records held in Sydney &mdash; in the
                  words your setting actually uses.
                </p>
                <Link
                  to="/pricing"
                  className="mt-6 inline-block rounded-btn bg-primary px-6 py-3 font-semibold text-primary-foreground hover:brightness-110"
                >
                  What it costs for a centre
                </Link>
              </div>

              {/* THE COLUMNS ARE LABELLED because the strikethrough below is
                  the only other thing saying which word is which, and a
                  strikethrough is a visual signal a screen reader does not
                  announce. With the headings there, the list reads correctly
                  whether or not the styling arrives. */}
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border">
                <div className="contents">
                  <p className="bg-background p-4 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    Instead of
                  </p>
                  <p className="bg-background p-4 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    Your setting says
                  </p>
                </div>
                {[
                  ['Teacher', 'Guide'],
                  ['Class', 'Environment'],
                  ['Behaviour log', 'Observation'],
                  ['Year 3', 'Lower Elementary'],
                ].map(([standard, montessori]) => (
                  <div key={standard} className="contents">
                    <dt className="bg-card p-4 text-sm text-muted-foreground line-through">
                      {standard}
                    </dt>
                    <dd className="bg-card p-4 text-sm font-semibold text-foreground">
                      {montessori}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* --- Privacy ------------------------------------------------------- */}
        <section id="privacy" className="bg-card py-20">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-xs font-bold tracking-wider text-brand-green uppercase">
              Privacy
            </p>
            <h2 className="mt-2 text-3xl font-bold text-balance text-foreground">
              What happens to a child&rsquo;s information
            </h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <p className="max-w-prose text-muted-foreground">
                Records are stored in Sydney and never leave Australia. Before
                any observation is sent for a strategy suggestion, names,
                contact details and dates of birth are removed — and the exact
                text that was sent is kept, so the claim can be checked rather
                than taken on trust.
              </p>
              <p className="max-w-prose text-muted-foreground">
                A guardian gives consent for AI suggestions and can withdraw it
                at any moment, which stops them immediately. MiZanova suggests
                classroom strategies. It does not diagnose, and it is not a
                clinical tool.
              </p>
            </div>
            <Link
              to="/privacy"
              className="mt-6 inline-block font-semibold text-primary hover:underline"
            >
              How your data is handled &rarr;
            </Link>
          </div>
        </section>

        {/* --- Closing call to action ---------------------------------------- */}
        <section className="bg-primary py-20 text-center">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-3xl font-bold text-balance text-primary-foreground md:text-4xl">
              Ready to support every learner?
            </h2>
            {/* opacity on text is how contrast quietly fails a check that
                passed when it was written. The muted tone is a real token. */}
            <p className="mt-3 text-lg text-primary-foreground">
              Tell us about your school or centre and we will show you what a
              term of logging actually looks like.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/enquiry"
                className="rounded-btn bg-card px-8 py-3 font-semibold text-primary hover:brightness-105"
              >
                Talk to us
              </Link>
              {/* NOT EVERYONE READING THIS HAS AN ORGANISATION. The band
                  addressed schools only, on a page that now offers an account
                  to somebody with no school at all. */}
              <Link
                to="/for-individuals"
                className="rounded-btn border border-primary-foreground px-8 py-3 font-semibold text-primary-foreground"
              >
                I am here for myself
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
