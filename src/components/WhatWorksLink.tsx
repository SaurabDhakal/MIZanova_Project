import { Link } from 'react-router-dom'
import Icon from './Icon'

/**
 * The way to the "what works for me" page.
 *
 * ONE COMPONENT BECAUSE IT APPEARS IN THREE PLACES. The document is built from
 * goals and from answered suggestions, so it is offered on both of those
 * screens — where the material comes from, and where somebody is already
 * thinking about it — and on the account page beside the data export, which is
 * where people look for "something I can take away".
 *
 * OFF THE SIDEBAR ON PURPOSE. Nobody opens this weekly. It is the screen you
 * want on the day somebody has asked you for something, and a permanent tab
 * for it would push down the things people actually came for. That makes these
 * three links the only way in — which is exactly the shape of bug that left
 * individual/Receipts routed to nothing, so they are a shared component rather
 * than three copies that can rot separately.
 */
export default function WhatWorksLink({ from }: { from: 'goals' | 'suggestions' | 'account' }) {
  return (
    <section className="print-hide mt-10 rounded-card border border-border bg-background p-6">
      <div className="flex items-start gap-3">
        <Icon name="resources" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">What works for me</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {from === 'goals'
              ? 'These, and the suggestions you have said helped, make a one-page summary you can hand to somebody — a GP, an employer asking what would help, a disability office, or a specialist you are seeing for the first time.'
              : from === 'suggestions'
                ? 'Everything you have marked as having helped goes into a one-page summary you can print and hand to somebody. What you asked never appears in it — only what worked.'
                : 'A one-page summary of what you are working on and what has helped, for a GP, an employer, a disability office or a new specialist. You choose what goes in, and what you asked the AI never appears in it.'}
          </p>
          <Link
            to="/individual/what-works"
            className="pressable mt-3 inline-flex items-center gap-2 rounded-btn border border-border bg-card px-4 py-2.5 font-semibold text-foreground"
          >
            Make the page
          </Link>
        </div>
      </div>
    </section>
  )
}
