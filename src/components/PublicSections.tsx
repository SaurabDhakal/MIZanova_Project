import { Link } from 'react-router-dom'
import Icon, { type IconName } from './Icon'

/**
 * The shared furniture of a public page.
 *
 * Ten marketing pages arrived at once. Written separately they would each have
 * their own heading size and their own idea of the gap under a paragraph, and
 * the site would look assembled rather than designed — which is the exact
 * complaint that started this work.
 *
 * ---------------------------------------------------------------------------
 * TWO WIDTHS, AND ONE RULE BETWEEN SECTIONS
 * ---------------------------------------------------------------------------
 * PublicLayout sets the frame at max-w-4xl and the prose column at max-w-2xl,
 * both centred on one axis. Everything here that is read sits in the prose
 * column; CardGrid is the single deliberate break-out to the frame. That is
 * the whole width system, and it replaces the three that disagreed.
 *
 * The hairline above each <Section> is doing the job the uppercase labels on
 * the homepage were doing badly: four headings separated by nothing but
 * whitespace read as one long column, so the eye needs somewhere to land. A
 * rule says "a new thing starts here" without adding a second heading above
 * the heading.
 */

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mx-auto max-w-2xl text-lg text-foreground">{children}</p>
}

export function Section({
  title,
  icon,
  children,
}: {
  title: string
  /* Optional, and only Features asks for one. It had its own copy of this
     whole block — icon chip, heading, intro, ticked list — written before
     Section existed, at a different heading size and with no rule above it.
     One prop was cheaper than a second section component that drifts. */
  icon?: IconName
  children: React.ReactNode
}) {
  return (
    /* MORE SPACE ABOVE THE HEADING THAN BELOW IT. A heading belongs to what
       follows it, and the old mt-12/mt-4 pair was already close to right; the
       rule makes the grouping visible rather than implied. */
    <section className="mx-auto mt-14 max-w-2xl border-t border-border pt-10">
      {icon && (
        <span className="mb-4 inline-flex rounded-btn bg-brand-navy/10 p-2.5 text-brand-navy">
          <Icon name={icon} className="h-6 w-6" />
        </span>
      )}
      <h2 className="text-heading text-balance text-foreground">{title}</h2>
      <div className="mt-4 space-y-4 text-muted-foreground">{children}</div>
    </section>
  )
}

/**
 * A drawn figure on a tinted ground.
 *
 * THE CAPTION IS GONE AND THAT IS THE POINT. Each of these used to carry two
 * lines of explanation under the drawing, restating the paragraph three inches
 * above it in smaller type. The drawing is already a restatement of the copy —
 * a caption made it a third telling, and it was the thing that turned a figure
 * into a slab of text with a picture in it.
 *
 * The padding came down with it. At p-10 with a 300-unit drawing the box was
 * mostly empty tint, which reads as a placeholder rather than as a frame.
 */
export function Figure({ children }: { children: React.ReactNode }) {
  return (
    <figure className="mt-10 rounded-card border border-border bg-primary-subtle p-5 sm:p-7">
      <div className="mx-auto max-w-lg">{children}</div>
    </figure>
  )
}

/**
 * A section that puts its figure beside its prose rather than under it.
 *
 * Every public page was one column of text at one width, top to bottom —
 * nothing was ever wider or narrower or beside anything else, so there was no
 * rhythm to read by. Section stays the default; this is what a page reaches
 * for when it has something to show as well as something to say.
 */
export function Split({
  title,
  figure,
  reverse = false,
  children,
}: {
  title: string
  figure: React.ReactNode
  /* Alternates which side the drawing sits on. Two Splits in a row with the
     figure in the same place is a column again, wearing a grid. */
  reverse?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="mt-14 border-t border-border pt-10">
      <div className="grid gap-8 md:grid-cols-[1fr_1.15fr] md:items-center md:gap-10">
        <div className={reverse ? 'md:order-2' : undefined}>
          <h2 className="text-heading text-balance text-foreground">{title}</h2>
          <div className="mt-4 space-y-4 text-muted-foreground">{children}</div>
        </div>
        <div
          className={`rounded-card border border-border bg-primary-subtle p-4 sm:p-5 ${
            reverse ? 'md:order-1' : ''
          }`}
        >
          {figure}
        </div>
      </div>
    </section>
  )
}

/** A list where each item earns a tick — used for what something actually does. */
export function Points({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          {/* The tick used to float loose beside the text at the same weight
              as the words. Seated in a disc it reads as a mark against the
              line rather than as punctuation inside it, and the pale green
              carries the meaning at a size where the icon alone could not. */}
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-subtle">
            <Icon
              name="tick"
              className="h-3.5 w-3.5 text-brand-green-ink"
            />
          </span>
          <span className="text-foreground">{item}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * What the page deliberately does NOT claim.
 *
 * Every one of these pages has one. It is the habit that runs through this
 * whole product — a promise a school discovers to be half-true in a classroom
 * is worse than one that was never made — and on a marketing page it is also
 * the most persuasive thing on it, because nobody else writes it down.
 *
 * Its heading used to be text-lg while <Section> above it was 24px, so two
 * h2s at the same level were set six pixels apart for no reason anybody chose.
 * It is text-title now: a step below a section heading, which is what a
 * callout is, and no longer a different answer to the same question.
 */
export function NotThis({
  title = 'What this does not do',
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <section className="mx-auto mt-14 max-w-2xl rounded-card border border-border bg-card p-6 shadow-raised md:p-8">
      <h2 className="text-title text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-muted-foreground">{children}</div>
    </section>
  )
}

export function CardGrid({
  cards,
}: {
  cards: { icon: IconName; title: string; body: string }[]
}) {
  return (
    /* THE ONE BREAK-OUT. It fills the frame rather than sitting at a third
       width of its own, so the page has two measures instead of three. */
    <ul className="mt-10 grid gap-5 md:grid-cols-3">
      {cards.map((card) => (
        <li
          key={card.title}
          className="rounded-card border border-border bg-card p-6 shadow-raised"
        >
          <span className="inline-flex rounded-btn bg-brand-navy/10 p-2.5 text-brand-navy">
            <Icon name={card.icon} className="h-6 w-6" />
          </span>
          {/* h2, not h3. Both pages using this put the grid directly under
              the page title with no heading between, so an h3 skipped a level
              — and the cards are peers of the <Section> blocks below them,
              which are h2. */}
          <h2 className="text-section mt-4 text-balance text-foreground">
            {card.title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{card.body}</p>
        </li>
      ))}
    </ul>
  )
}

/** The band at the foot of a page, so every one ends somewhere useful. */
export function NextStep({
  heading,
  body,
  to,
  label,
}: {
  heading: string
  body: string
  to: string
  label: string
}) {
  return (
    <section className="mt-16 rounded-card bg-primary p-8 text-center md:p-12">
      <h2 className="text-heading text-balance text-primary-foreground">
        {heading}
      </h2>
      <p className="mx-auto mt-3 max-w-prose text-primary-foreground">{body}</p>
      <Link
        to={to}
        className="pressable mt-7 inline-flex min-h-11 items-center rounded-btn bg-card px-6 py-3 font-semibold text-primary hover:brightness-105"
      >
        {label}
      </Link>
    </section>
  )
}
