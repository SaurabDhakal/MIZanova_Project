import { useState } from 'react'
import { Link } from 'react-router-dom'
import PublicLayout from '../components/PublicLayout'
import type { EnquiryPlan } from '../lib/api'

/**
 * Pricing — docs/Untitled (4)/P-005 Pricing.jpg and P-005 Pricing (Parents View).jpg.
 *
 * Every figure here is copied from those designs. Nothing is estimated,
 * averaged or rounded, because a price is a statement to a customer and
 * inventing one is a different kind of wrong from inventing a dashboard
 * number.
 *
 * TWO THINGS FROM THE DESIGN ARE MISSING, DELIBERATELY.
 *
 * The FAQ — "How does the trial work?", "Do you offer refunds?", "Is GST
 * included?" — has no answers anywhere in this project. They are commercial
 * policies belonging to a real Australian company, and writing plausible ones
 * would publish claims about refunds and tax that nobody at Special Miles has
 * agreed to. The questions are listed with that said plainly instead.
 *
 * The ABN reads "12 345 678 901" in the design, which is placeholder digits.
 * A fabricated company number on a public page is a false statement about a
 * real business.
 */

type Plan = {
  name: string
  subtitle: string
  price: string
  period: string
  annual?: string
  featured?: boolean
  features: string[]
  cta: string
  /**
   * The plan key, which is also what the enquiry is recorded against.
   *
   * WAS `to: string | null`, pointing at /signup, back when signing up was
   * imagined as the way to buy. It never was: a school account is created by
   * Special Miles, because creating one means creating the thing every account
   * at that school hangs off. Every button here now starts a conversation, and
   * the honest ones always did — "Contact sales" was right and the other four
   * were the odd ones out.
   */
  key: EnquiryPlan
}

const SCHOOL_PLANS: Plan[] = [
  {
    name: 'Small schools',
    subtitle: 'Up to 150 students',
    price: '$2,400',
    period: 'per term',
    annual: 'or $8,000 a year, saving 16%',
    cta: 'Talk to us about your school',
    key: 'small_school',
    features: [
      'All teachers and staff',
      'Parent accounts included',
      'AI classroom strategies',
      'Daily student reports',
      'Safeguarding workflow',
      'Compliance dashboard',
    ],
  },
  {
    name: 'Mid-size schools',
    subtitle: '150 to 600 students',
    price: '$5,800',
    period: 'per term',
    annual: 'or $19,500 a year, saving 15%',
    featured: true,
    cta: 'Talk to us about your school',
    key: 'mid_school',
    features: [
      'Everything in Small, plus:',
      'Specialist review queue',
      'Multi-campus support',
      'Advanced behaviour analytics',
      'Priority support by phone and chat',
      'Quarterly outcomes reports',
      'Custom data exports',
    ],
  },
  {
    name: 'Large schools',
    subtitle: '600+ students',
    price: 'Custom',
    period: 'enterprise pricing',
    cta: 'Contact sales',
    key: 'large_school',
    features: [
      'Everything in Mid-size, plus:',
      'Dedicated success manager',
      'Custom LMS integrations',
      'Single sign-on (SAML)',
      'Full API access',
      'White-labelled parent portal',
      'Annual on-site staff training',
    ],
  },
]

const FAMILY_PLANS: Plan[] = [
  {
    name: 'Essential',
    subtitle: 'Keeping track of daily progress',
    price: '$9.99',
    period: 'per month',
    annual: 'or $99 a year, saving $20',
    cta: 'Tell me when this opens',
    key: 'essential',
    features: [
      'Daily behaviour reports',
      'Up to 3 AI strategies a day',
      'Direct message with the teacher',
      'Home observation logging',
      'Basic library access',
    ],
  },
  {
    name: 'Premium',
    subtitle: 'Comprehensive support for specialised needs',
    price: '$19.99',
    period: 'per month',
    annual: 'or $199 a year, saving $40',
    featured: true,
    cta: 'Tell me when this opens',
    key: 'premium',
    features: [
      'Everything in Essential, plus:',
      'Unlimited AI strategies',
      'Quarterly 3-month progress report (PDF)',
      'Specialist booking system',
      'Strategy effectiveness tracking',
      'Premium video modules',
      'Export all data, and priority support',
    ],
  },
]

const ADD_ONS = [
  {
    name: 'Additional child',
    price: '$4.99 / month per child',
    detail: 'For families needing separate logging for more than one child.',
  },
  {
    name: 'External teacher collaborator',
    price: '$4.99 / month per teacher',
    detail:
      'Invite tutors or extracurricular teachers to view logs and strategies.',
  },
  {
    name: 'Specialist collaborator',
    price: '$19.99 / month per specialist',
    detail:
      'Full collaboration with external psychologists or occupational therapists.',
  },
]

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <li
      className={`flex flex-col rounded-card border bg-card p-6 ${
        plan.featured ? 'border-primary shadow-lg' : 'border-border'
      }`}
    >
      {plan.featured && (
        <p className="mb-3 inline-block self-start rounded-btn bg-primary px-3 py-1 text-xs font-bold tracking-wide text-primary-foreground uppercase">
          Most popular
        </p>
      )}

      <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
      <p className="text-sm text-muted-foreground">{plan.subtitle}</p>

      <p className="mt-4">
        <span className="text-4xl font-bold text-foreground">{plan.price}</span>{' '}
        <span className="text-muted-foreground">{plan.period}</span>
      </p>
      {plan.annual && (
        <p className="mt-1 text-sm text-muted-foreground">{plan.annual}</p>
      )}

      <ul className="mt-5 flex-1 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm text-foreground">
            <span aria-hidden="true" className="text-success-foreground">
              ✓
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* There is a sales inbox now — db/045 — so "Contact sales" is a button
          that contacts sales rather than a sentence telling somebody to find
          another way. The plan travels with them so the form does not ask what
          they just pressed. */}
      <Link
        to={`/enquiry?plan=${plan.key}`}
        className={`mt-6 rounded-btn px-4 py-3 text-center font-semibold ${
          plan.featured
            ? 'bg-primary text-primary-foreground'
            : 'border border-border text-foreground'
        }`}
      >
        {plan.cta}
      </Link>
    </li>
  )
}

export default function Pricing() {
  const [audience, setAudience] = useState<'schools' | 'families'>('schools')
  const plans = audience === 'schools' ? SCHOOL_PLANS : FAMILY_PLANS

  return (
    <PublicLayout
      title="Pricing that fits your role"
      subtitle="Simple Australian-dollar pricing. Annual savings. No hidden fees."
    >
      {/* Radios, not buttons: a screen reader announces "2 of 2" and arrow
          keys move between them, which two styled buttons would not do. */}
      <fieldset className="mb-10 flex justify-center">
        <legend className="sr-only">Show pricing for</legend>
        <div className="inline-flex rounded-btn border border-border bg-card p-1">
          {(['schools', 'families'] as const).map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-btn px-5 py-2 text-sm font-semibold ${
                audience === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground'
              }`}
            >
              <input
                type="radio"
                name="audience"
                value={value}
                checked={audience === value}
                onChange={() => setAudience(value)}
                className="sr-only"
              />
              {value === 'schools' ? 'For schools' : 'For families'}
            </label>
          ))}
        </div>
      </fieldset>

      <h2 className="text-center text-title text-foreground">
        {audience === 'schools' ? 'School subscriptions' : 'Family plans'}
      </h2>
      <p className="mt-1 mb-8 text-center text-muted-foreground">
        {audience === 'schools'
          ? 'Annual contracts. Pilot programmes available.'
          : 'Monthly or annual. No hidden costs.'}
      </p>

      {/* SAID BEFORE THE PRICES, NOT AFTER THEM. Family subscriptions have
          prices on this page because the client's design has prices, but there
          is nothing to buy yet — a parent reaches MiZanova through their
          child's school. Letting somebody read three cards and press a button
          before mentioning that would make the button the thing that broke the
          news. The buttons say "Tell me when this opens" for the same reason. */}
      {audience === 'families' && (
        <p className="mx-auto mb-8 max-w-2xl rounded-btn border border-border bg-card px-4 py-3 text-center text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">
            Family plans are not open yet.
          </strong>{' '}
          Today, families reach MiZanova through their child&rsquo;s school,
          which costs them nothing. Leave your details and we will tell you when
          these open.
        </p>
      )}

      <ul className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.name} plan={plan} />
        ))}
      </ul>

      {audience === 'families' && (
        <>
          <h2 className="mt-14 text-center text-title text-foreground">
            Optional add-ons
          </h2>
          <ul className="mt-6 grid gap-6 md:grid-cols-3">
            {ADD_ONS.map((addOn) => (
              <li
                key={addOn.name}
                className="rounded-card border border-border bg-card shadow-raised p-5"
              >
                <h3 className="font-bold text-foreground">{addOn.name}</h3>
                <p className="mt-1 font-semibold text-warning-foreground">
                  {addOn.price}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {addOn.detail}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* --- What this page cannot yet promise ----------------------------- */}
      <section className="mx-auto mt-14 max-w-3xl rounded-card border border-border bg-background p-6">
        <h2 className="font-semibold text-foreground">
          Before you choose a plan
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Creating an account is free and does not charge you. Paid plans are
          not yet connected to billing, so choosing one here signs you up and
          nothing more — no card is taken and no plan is applied.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          The design for this page also carries a list of frequently asked
          questions covering trials, refunds, upgrades and GST. Those are
          commercial policies belonging to Special Miles, and MiZanova will not
          publish answers to them that nobody has agreed to. They are the
          questions to settle before this page goes live.
        </p>
      </section>
    </PublicLayout>
  )
}
