import { Link } from 'react-router-dom'
import Icon, { type IconName } from './Icon'

/**
 * The shared furniture of a public page.
 *
 * Ten marketing pages arrived at once. Written separately they would each have
 * their own heading size and their own idea of the gap under a paragraph, and
 * the site would look assembled rather than designed — which is the exact
 * complaint that started this work.
 */

export function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto max-w-3xl text-lg text-foreground">{children}</p>
  )
}

export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mx-auto mt-12 max-w-3xl">
      <h2 className="text-title text-foreground">{title}</h2>
      <div className="mt-4 space-y-4 text-muted-foreground">{children}</div>
    </section>
  )
}

/** A list where each item earns a tick — used for what something actually does. */
export function Points({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <Icon
            name="tick"
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-green"
          />
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
 */
export function NotThis({
  title = 'What this does not do',
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <section className="mx-auto mt-12 max-w-3xl rounded-card border border-border bg-card shadow-raised p-6">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
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
    <ul className="mx-auto mt-8 grid max-w-5xl gap-6 md:grid-cols-3">
      {cards.map((card) => (
        <li
          key={card.title}
          className="rounded-card border border-border bg-card shadow-raised p-6"
        >
          <span className="inline-flex rounded-btn bg-brand-navy/10 p-2.5 text-brand-navy">
            <Icon name={card.icon} className="h-6 w-6" />
          </span>
          <h3 className="mt-4 font-bold text-foreground">{card.title}</h3>
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
    <section className="mx-auto mt-14 max-w-3xl rounded-card bg-primary p-8 text-center">
      <h2 className="text-2xl font-bold text-primary-foreground">{heading}</h2>
      <p className="mx-auto mt-2 max-w-prose text-primary-foreground">{body}</p>
      <Link
        to={to}
        className="mt-6 inline-block rounded-btn bg-card px-6 py-3 font-semibold text-primary hover:brightness-105"
      >
        {label}
      </Link>
    </section>
  )
}
