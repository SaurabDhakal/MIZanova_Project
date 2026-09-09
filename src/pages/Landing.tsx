import { Link } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import Icon from '../components/Icon'
import HeroDiagram from '../components/HeroDiagram'
import {
  AnonymisedCard,
  FamilyPhoneShot,
  LoggerShot,
} from '../components/ProductShots'
import Reveal from '../components/Reveal'

/**
 * The public homepage — docs/Figma Pages Design/Landing Page.jpg.
 *
 * Four deliberate differences from that design:
 *
 * 1. The design is branded "InsightED". The product is MiZanova.
 * 2. The design's footer lists Careers, Blog, Changelog, Help Center,
 *    Community, Training and Status. None of those exist, and every link here
 *    goes somewhere real — a link that looks real and goes nowhere is worse
 *    than no link.
 * 3. The design prints "ABN 12 345 678 901", which is placeholder digits. A
 *    fabricated company number on a public page is a false statement about a
 *    real business, so it waits for Special Miles to supply the real one.
 * 4. The design's closing band has a heading and no button. This one has the
 *    button, because that band is the only reason the section exists.
 *
 * ---------------------------------------------------------------------------
 * THE COPY IS ABOUT HALF THE LENGTH IT WAS
 * ---------------------------------------------------------------------------
 * Every step and every audience used to carry three or four sentences, and the
 * page was a wall. Nothing has been softened: the offline claim, the stripped
 * names, the kept text, the specialist gate and the withdrawable consent are
 * all still here, in fewer words. What went was the second sentence explaining
 * the first — the reasoning belongs on the page the link goes to, and the
 * homepage's job is to say the thing and point at it.
 *
 * The one rule that did not bend: a claim is either true and short or it is
 * cut. Nothing became vaguer to become shorter, because a vague claim on a
 * page about children's records is worse than a long one.
 *
 * ---------------------------------------------------------------------------
 * THE PICTURES, AND WHY THEY ARE DRAWN
 * ---------------------------------------------------------------------------
 * See ProductShots.tsx. Short version: this stylesheet self-hosts Inter so the
 * product makes no external request, and a fetched hero image would hand that
 * away. Everything visual on this page — the gradient field, the grid, the app
 * window and the phone — is drawn by the browser from the brand tokens.
 */

const STEPS = [
  {
    icon: 'stopwatch' as const,
    title: 'A teacher records what they saw',
    body: 'Three taps and a timer. Notes optional, and it works offline.',
  },
  {
    icon: 'ai' as const,
    title: 'The AI suggests what has worked',
    body: 'Names are stripped before anything is sent, and the text that went is kept. It never diagnoses.',
  },
  {
    icon: 'shieldCheck' as const,
    title: 'A specialist stays in the loop',
    body: 'Low-confidence and sensitive ones reach a person before a teacher does.',
  },
]

const AUDIENCES = [
  {
    icon: 'schools' as const,
    title: 'For schools',
    to: '/for-schools',
    body: 'Anonymised trends, a safeguarding queue that gets answered, and staff you verified.',
  },
  {
    icon: 'people' as const,
    title: 'For families',
    to: '/for-parents',
    body: 'A daily summary in first names, shared goals, consent you can withdraw.',
  },
  {
    icon: 'caseload' as const,
    title: 'For specialists',
    to: '/for-specialists',
    body: 'A caseload, and the anonymised text behind every suggestion you release.',
  },
  {
    /* SHIPPED WITH db/088 AND UNMENTIONED HERE FOR ITS WHOLE LIFE. */
    icon: 'user' as const,
    title: 'For individuals',
    to: '/for-individuals',
    body: 'Courses and suggestions for neurodivergent adults. Nothing reported to anybody.',
  },
]

const CLAIMS = [
  'Hosted in Sydney',
  'Privacy-first',
  'Never diagnostic',
  'Evidence-based',
]

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-btn focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main" tabIndex={-1} className="flex-1">
        {/* --- Hero ------------------------------------------------------------
            DARK, AND THAT IS THE POINT RATHER THAN A MOOD.

            Every version of this before it was pale blue on white with grey
            body copy, and the complaint each time was that it looked flat. It
            was: nothing on the page was darker than #0f172a text or lighter
            than white, so there was no value contrast anywhere and no single
            object the eye had to land on. "Premium" is mostly just contrast,
            and a page with none reads as a template however good its type is.

            On navy the product window becomes the brightest thing on the
            screen by a distance, which is the correct hierarchy: the software
            is what is being sold. The glow behind it is doing real work —
            without it a white rectangle on a dark ground has a hard edge and
            looks pasted on rather than lit.

            THE MID-PAGE NAVY BAND WENT LIGHT IN THE SAME CHANGE. Two dark
            bands on one page and neither is a moment.

            The 225px void is gone too. The headline, the copy and the buttons
            are one column again: full-width type looked confident and put a
            quarter of the screen between a heading and the sentence explaining
            it, which is worse than a smaller headline that holds together.
            ------------------------------------------------------------------ */}
        {/* THE GROUND IS NAVY WITH WEATHER IN IT, NOT A GRADIENT.
            First attempt stacked .brand-wash, .aurora-deep and a green blob,
            and three green sources over one another put the entire right half
            of the hero in green — a brand colour used as a bedsheet. Dropping
            the wash leaves the sidebar navy as the actual ground, with a blue
            pool on the left and a small green one low on the right: the same
            three colours, doing lighting rather than upholstery. */}
        <section className="on-dark relative isolate overflow-hidden bg-sidebar">
          <div aria-hidden="true" className="aurora-deep absolute inset-0" />
          <div
            aria-hidden="true"
            className="blob absolute -top-32 -left-40 h-[520px] w-[620px] bg-brand-blue/35"
          />
          <div
            aria-hidden="true"
            className="blob-b absolute -right-24 -bottom-24 h-[360px] w-[460px] bg-brand-green/20"
          />

          <div className="relative mx-auto max-w-7xl px-6 pt-16 pb-14 md:pt-24 md:pb-20">
            <div className="grid items-center gap-14 md:grid-cols-2 md:gap-12">
              <div>
                <p className="text-caption inline-flex items-center gap-2 rounded-btn border border-white/20 bg-white/10 px-3 py-1.5 text-sidebar-foreground uppercase">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-accent-on-dark"
                  />
                  Neurodiversity ecosystem
                </p>

                <h1 className="text-hero mt-6 text-balance text-sidebar-foreground">
                  Support every learner.{' '}
                  {/* The mint, not --color-brand-green: the brand green is
                      built for white and measures about 3.1:1 on this navy. */}
                  <span className="text-accent-on-dark">
                    Empower every educator.
                  </span>
                </h1>

                {/* Directly under the headline. This is the sentence that
                    explains it; a gap between them is a gap in the argument. */}
                <p className="mt-6 max-w-prose text-lg text-pretty text-sidebar-muted">
                  Classroom strategies in twenty seconds — checked by
                  specialists, hosted in Australia.
                </p>

                <div className="mt-9 flex flex-wrap gap-3">
                  <Link
                    to="/enquiry"
                    className="pressable inline-flex min-h-11 items-center rounded-btn bg-card px-6 py-3 font-semibold text-brand-navy shadow-lifted hover:brightness-105"
                  >
                    Book a walkthrough
                  </Link>
                  <a
                    href="#how-it-works"
                    className="pressable inline-flex min-h-11 items-center rounded-btn border border-white/30 px-6 py-3 font-semibold text-sidebar-foreground hover:bg-white/10"
                  >
                    See how it works
                  </a>
                </div>
              </div>

              {/* THE GLOW IS NOT DECORATION. A white card on a dark ground has
                  a hard cut edge and reads as pasted on; a soft brand-coloured
                  pool behind it reads as lit, and the window looks like it is
                  in the room rather than on top of it. */}
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="blob-c absolute -inset-8 bg-brand-blue/35"
                />
                <div className="relative pb-20 md:pb-24">
                  <LoggerShot />
                  {/* Clear of the Save button. An overlap that hides the
                      control the picture is about is a collage, not depth. */}
                  <div className="absolute -bottom-2 -left-3 w-[50%] max-w-[286px] sm:-left-14">
                    <AnonymisedCard />
                  </div>
                </div>
              </div>
            </div>

            {/* Translucent, so the strip belongs to the dark ground rather
                than sitting on it as a white bar. */}
            <ul className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-white/15 bg-white/10 md:grid-cols-4">
              {CLAIMS.map((claim) => (
                <li
                  key={claim}
                  className="flex items-center gap-2 px-4 py-4 text-sm font-medium text-sidebar-foreground"
                >
                  <Icon
                    name="tick"
                    className="h-4 w-4 shrink-0 text-accent-on-dark"
                  />
                  {claim}
                </li>
              ))}
            </ul>
          </div>

        </section>

        {/* --- How it works --------------------------------------------------
            White, and the only section on the page with no tint at all. After
            a coloured hero the eye needs somewhere plain to read three
            paragraphs; this is it. The one violet shape in the corner keeps it
            from being a blank slab.
            ------------------------------------------------------------------ */}
        <section id="how-it-works" className="relative isolate overflow-hidden bg-card">
          <div
            aria-hidden="true"
            className="blob-c absolute -top-32 right-0 h-[380px] w-[420px] bg-decor-violet/12"
          />
          <div className="relative mx-auto max-w-6xl px-6 py-16 md:py-24">
          <h2 className="text-heading max-w-2xl text-balance text-foreground">
            How it works
          </h2>
          <p className="mt-3 max-w-prose text-lg text-muted-foreground">
            A teacher records. The system suggests. A specialist stays in the
            loop.
          </p>

          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              /* 70ms between siblings. Three cards arriving together is a
                 flash; three arriving 300ms apart is a queue you wait for.
                 Seventy reads as one movement with a direction in it. */
              <Reveal
                key={step.title}
                as="li"
                delayMs={i * 70}
                className="relative overflow-hidden rounded-card border border-border bg-card p-6 shadow-raised md:p-7"
              >
                {/* A hairline of the brand gradient across the top of each
                    card. It is the one place the three brand colours appear
                    together at small size, so the cards read as a set. */}
                <span
                  aria-hidden="true"
                  className="brand-rule absolute inset-x-0 top-0 h-1"
                />
                <div className="mt-2 flex items-center gap-3">
                  <span className="inline-flex rounded-btn bg-brand-navy/10 p-2.5 text-brand-navy">
                    <Icon name={step.icon} className="h-6 w-6" />
                  </span>
                  <span className="text-caption text-muted-foreground tabular-nums">
                    <span className="sr-only">Step </span>
                    {i + 1} of {STEPS.length}
                  </span>
                </div>
                <h3 className="text-section mt-5 text-balance text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-muted-foreground">{step.body}</p>
              </Reveal>
            ))}
          </ol>
          </div>
        </section>

        {/* --- Who it is for ------------------------------------------------- */}
        {/* --- Who it is for --------------------------------------------------
            THE ONE WARM SECTION. The palette is navy, blue and green, which run
            unbroken down a page reads cold — and this is the section about
            people rather than mechanisms, so it is the right one to warm.
            ------------------------------------------------------------------ */}
        <section
          id="who-its-for"
          className="wash-sand relative isolate overflow-hidden border-y border-border py-16 md:py-24"
        >
          <div className="relative mx-auto max-w-6xl px-6">
            <h2 className="text-heading text-balance text-foreground">
              Who it is for
            </h2>
            <p className="mt-3 max-w-prose text-lg text-muted-foreground">
              Four ways in. Which one you arrive by decides what you can see.
            </p>

            <ul className="mt-12 grid gap-x-10 gap-y-2 md:grid-cols-2">
              {AUDIENCES.map((audience, i) => (
                <Reveal key={audience.title} as="li" delayMs={i * 70}>
                  {/* THE WHOLE ROW IS THE LINK, and it is a row rather than a
                      card. The body copy used to sit outside a separate
                      "For schools →" anchor, so the four items carrying this
                      section were four short links under four paragraphs of
                      unclickable text. Rows also keep the three step cards
                      above as the only cards on the page. */}
                  <Link
                    to={audience.to}
                    className="pressable group flex h-full flex-col border-t-2 border-border py-5 hover:border-brand-green"
                  >
                    <span className="inline-flex text-brand-green">
                      <Icon name={audience.icon} className="h-6 w-6" />
                    </span>
                    <span className="text-section mt-3 flex items-center gap-1.5 text-foreground group-hover:underline">
                      {audience.title}
                      <span
                        aria-hidden="true"
                        className="text-primary transition-transform duration-150 ease-out-strong group-hover:translate-x-1"
                      >
                        &rarr;
                      </span>
                    </span>
                    <span className="mt-2 block text-muted-foreground">
                      {audience.body}
                    </span>
                  </Link>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* --- Privacy -------------------------------------------------------
            THE PHONE EARNS ITS PLACE HERE RATHER THAN IN THE HERO. This
            section's claim is that a family sees first names and only what was
            chosen for them, and that is a thing you can look at. Two paragraphs
            became one; the detail lives on /privacy, which this links to.
            ------------------------------------------------------------------ */}
        <section
          id="privacy"
          className="wash-cool relative isolate overflow-hidden py-16 md:py-24"
        >
          <div className="relative mx-auto max-w-6xl px-6">
            <div className="grid items-center gap-12 md:grid-cols-[1.1fr_0.9fr]">
              <div>
                <h2 className="text-heading text-balance text-foreground">
                  What happens to a child&rsquo;s information
                </h2>
                <p className="mt-4 max-w-prose text-lg text-pretty text-muted-foreground">
                  Records stay in Sydney. Names come off before anything is
                  sent, and a guardian can withdraw consent at any moment —
                  which stops it immediately.
                </p>
                <Link
                  to="/privacy"
                  className="mt-6 inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
                >
                  How your data is handled &rarr;
                </Link>
              </div>

              <div className="mx-auto w-full max-w-[260px]">
                <FamilyPhoneShot />
              </div>
            </div>
          </div>
        </section>

        {/* --- The anonymising step, drawn ------------------------------------
            HeroDiagram's own claim, on the section that makes it. It opened
            the page for its whole life, where it competed with the headline
            and explained a mechanism nobody had been told about yet. It reads
            better as the proof under the sentence it proves.
            ------------------------------------------------------------------ */}
        {/*
          THE ONE DARK BAND, AND IT IS HERE FOR RHYTHM AS MUCH AS EMPHASIS.

          Every section above and below this is a pale surface — background,
          card, background, card — so the page had one tone from the header to
          the closing call to action and nothing in it read as a peak. Six
          sections of equal weight is a list, not a composition.

          The navy is the product's own sidebar colour, so the loudest moment
          on the marketing site is the colour somebody meets every day once
          they are inside it. And the claim earns the emphasis: this diagram is
          the thing that distinguishes the product from every other page that
          says "we have AI".

          THE DIAGRAM SITS IN A WHITE CARD rather than directly on the navy,
          and that is a contrast decision rather than a stylistic one.
          HeroDiagram draws its labels in --color-muted-foreground (#586678),
          which is built for a pale ground and measures about 2:1 on this navy.
          Rather than teach the drawing about dark backgrounds, it keeps the
          surface it was designed for and the band frames it.
        */}
        {/* WAS THE DARK BAND, AND IS NOT ANY MORE. The hero took the navy in
            the same change, and two dark bands on one page means neither is a
            moment — the second just reads as the first repeating. This keeps
            its own identity through the brand-gradient frame around the
            diagram rather than through its ground. */}
        <section className="relative isolate overflow-hidden bg-card">
          <div
            aria-hidden="true"
            className="blob-b absolute -left-32 bottom-0 h-[420px] w-[520px] bg-brand-green/12"
          />
          <div className="relative mx-auto max-w-4xl px-6 py-16 md:py-24">
            <h2 className="text-heading text-center text-balance text-foreground">
              The name comes off before anything is sent
            </h2>
            <p className="mx-auto mt-3 max-w-prose text-center text-muted-foreground">
              And the text that went is kept, so the claim can be checked.
            </p>
            {/* A one-pixel gradient frame, made by padding a gradient box and
                putting a white card inside it. The section lost its dark
                ground and this is what it kept instead — the three brand
                colours around the one drawing that earns them. */}
            <div className="brand-wash mx-auto mt-10 max-w-lg rounded-card p-px shadow-lifted">
              <div className="rounded-[calc(var(--radius-card)-1px)] bg-card p-5 sm:p-6">
                <HeroDiagram />
              </div>
            </div>
          </div>
        </section>

        {/* --- Not only schools ---------------------------------------------
            OrganisationKind has admitted montessori and ecec since the tenancy
            work, AddSchoolSection offers them, and docs/11 sets out what
            changes. Only those two are named: the type also carries
            ndis_provider, corporate and practice, and claiming those would be
            advertising markets nobody has agreed to enter — the same fault as
            printing an ABN we were never given.
            ------------------------------------------------------------------ */}
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="relative isolate overflow-hidden rounded-card border border-border bg-primary-subtle p-8 md:p-12">
            <div aria-hidden="true" className="aurora absolute inset-0" />
            <div className="relative grid items-center gap-10 md:grid-cols-2">
              <div>
                <h2 className="text-heading text-balance text-foreground">
                  Montessori centres and early years
                </h2>
                <p className="mt-4 max-w-prose text-pretty text-foreground">
                  A Montessori setting has guides and environments, not teachers
                  and year levels. Same safeguarding, same records in Sydney, in
                  the words your setting actually uses.
                </p>
                <Link
                  to="/pricing"
                  className="pressable mt-7 inline-flex min-h-11 items-center rounded-btn bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lifted hover:brightness-110"
                >
                  What it costs for a centre
                </Link>
              </div>

              {/* THE COLUMNS ARE LABELLED because the strikethrough is the only
                  other thing saying which word is which, and a strikethrough is
                  a visual signal a screen reader does not announce. */}
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border shadow-lifted">
                <div className="contents">
                  <p className="text-caption bg-background p-4 text-muted-foreground uppercase">
                    Instead of
                  </p>
                  <p className="text-caption bg-background p-4 text-muted-foreground uppercase">
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

        {/* --- Closing call to action ---------------------------------------- */}
        {/* on-dark switches :focus-visible to white here. #2563eb on this
            gradient measures 1.12:1 — a ring a keyboard user cannot see. */}
        <section className="brand-wash on-dark relative isolate overflow-hidden py-20 text-center md:py-28">
          <div aria-hidden="true" className="aurora-deep absolute inset-0" />
          <div className="relative mx-auto max-w-3xl px-6">
            <h2 className="text-display text-balance text-primary-foreground">
              Ready to support every learner?
            </h2>
            {/* opacity on text is how contrast quietly fails a check that
                passed when it was written. This is a solid token on a surface
                dark enough to carry it. */}
            <p className="mt-4 text-lg text-pretty text-primary-foreground">
              Tell us about your setting and we will show you a term of logging.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                to="/enquiry"
                className="pressable inline-flex min-h-11 items-center rounded-btn bg-card px-8 py-3 font-semibold text-primary shadow-lifted hover:brightness-105"
              >
                Talk to us
              </Link>
              {/* NOT EVERYONE READING THIS HAS AN ORGANISATION. */}
              <Link
                to="/for-individuals"
                className="pressable inline-flex min-h-11 items-center rounded-btn border border-primary-foreground px-8 py-3 font-semibold text-primary-foreground hover:bg-primary-foreground hover:text-brand-navy"
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
