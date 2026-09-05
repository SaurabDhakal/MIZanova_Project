import { useState } from 'react'
import { Link } from 'react-router-dom'
import PublicLayout from '../components/PublicLayout'
import type { EnquiryPlan } from '../lib/api'

/**
 * Pricing — docs/Untitled (4)/P-005 Pricing.jpg and P-005 Pricing (Parents View).jpg.
 *
 * THE SCHOOL FIGURES ALSO LIVE IN src/lib/plans.ts, which Subscriptions reads
 * when a platform admin records what a school agreed. They were only here, so
 * that screen had nothing to compare a typed rate against and the first
 * agreement it recorded contradicted this page. Keep the two in step: this page
 * is what a customer is shown, and that screen is what they are charged.
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

type Audience = 'schools' | 'montessori' | 'families'

const AUDIENCE_LABELS: Record<Audience, string> = {
  schools: 'For schools',
  montessori: 'Montessori & early years',
  families: 'For families',
}

export default function Pricing() {
  const [audience, setAudience] = useState<Audience>('schools')

  return (
    <PublicLayout
      title="Pricing that fits your role"
      subtitle="Simple Australian-dollar pricing. Annual savings. No hidden fees."
    >
      {/* Radios, not buttons: a screen reader announces "2 of 2" and arrow
          keys move between them, which two styled buttons would not do. */}
      <fieldset className="mb-10 flex justify-center">
        <legend className="sr-only">Show pricing for</legend>
        <div className="inline-flex flex-wrap justify-center rounded-btn border border-border bg-card p-1">
          {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((value) => (
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
              {AUDIENCE_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <h2 className="text-center text-title text-foreground">
        {audience === 'schools'
          ? 'School subscriptions'
          : audience === 'montessori'
            ? 'Montessori centres and early years'
            : 'Family plans'}
      </h2>
      <p className="mt-1 mb-8 text-center text-muted-foreground">
        {audience === 'schools'
          ? 'Annual contracts. Pilot programmes available.'
          : audience === 'montessori'
            ? 'Quoted per centre, because a centre is not sized like a school.'
            : 'Reached through your school today. Nothing to pay.'}
      </p>

      {audience === 'schools' && (
        <ul className="grid gap-6 lg:grid-cols-3">
          {SCHOOL_PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </ul>
      )}

      {/* ---------------------------------------------------------------
          MONTESSORI — A PANEL, NOT A PRICE TABLE, AND THAT IS THE HONEST
          SHAPE.

          The school bands are per student. docs/11 sets out why that ruler
          does not fit: Montessori in Australia is substantially early
          childhood, a centre is not sized like a primary school, and these
          settings have no year levels to count children into. Three cards
          with figures arrived at by analogy would be inventing a price.

          So this says what is different, what is included, and asks for a
          conversation — which is what Large schools already does, for the
          same reason.
          --------------------------------------------------------------- */}
      {audience === 'montessori' && (
        <div className="mx-auto max-w-4xl">
          <div className="rounded-card border border-border bg-card p-6 shadow-raised sm:p-8">
            <p className="text-3xl font-bold text-foreground">
              Quoted per centre
            </p>
            <p className="mt-2 max-w-prose text-muted-foreground">
              Everything a school gets, in the language your setting actually
              uses. Tell us how many children you have and how your
              environments are arranged, and we will price it against that
              rather than against a student roll.
            </p>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="font-bold text-foreground">
                  What changes for you
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li>
                    Guides and environments, not teachers and classes. The
                    words on the screen match the ones in the room.
                  </li>
                  <li>
                    Three-year mixed-age groupings &mdash; Casa, Lower
                    Elementary, Upper Elementary &mdash; instead of year
                    levels.
                  </li>
                  <li>
                    Observations rather than behaviour incidents, which is
                    closer to how you already record.
                  </li>
                  <li>
                    Built for long day care, preschool and toddler programmes
                    as well as school-age settings.
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-foreground">
                  What is the same
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li>AI suggestions, with a specialist able to hold one back.</li>
                  <li>Family accounts included at no extra cost.</li>
                  <li>Safeguarding queue and acknowledgement times.</li>
                  <li>Staff verification and the compliance dashboard.</li>
                  <li>Records held in Sydney, never leaving Australia.</li>
                </ul>
              </div>
            </div>

            <Link
              to="/enquiry?plan=montessori"
              className="mt-8 inline-block rounded-btn bg-primary px-6 py-3 font-semibold text-primary-foreground hover:brightness-110"
            >
              Talk to us about your centre
            </Link>
          </div>

          {/* SAID PLAINLY RATHER THAN LEFT AS A GAP. A page that simply had
              no number where the others have three reads as an oversight. */}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            There is no published figure here yet because the school bands are
            priced per student, and that is the wrong measure for a centre. We
            would rather quote you than round you into somebody else&rsquo;s
            band.
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------------
          FAMILIES — DELIBERATELY THE SMALLEST SECTION ON THE PAGE.

          It used to be two full plan cards and a three-card add-on grid:
          more surface than the schools it sits beside, for something nobody
          can buy. A family reaches MiZanova through their child's school and
          pays nothing, so the useful answer is one short one.

          The client's published figures are all still here, as a compact
          list rather than a sales layout. Deleting them would lose real
          numbers from the P-005 design; displaying them as three-column
          cards oversells something that is not open.
          --------------------------------------------------------------- */}
      {audience === 'families' && (
        <div className="mx-auto max-w-2xl">
          <div className="rounded-card border border-border bg-card p-6 shadow-raised">
            <h3 className="font-bold text-foreground">
              Right now, families pay nothing
            </h3>
            <p className="mt-2 text-muted-foreground">
              You reach MiZanova through your child&rsquo;s school, and your
              account is included in what the school pays. There is no family
              plan to buy and no card to enter.
            </p>
            <Link
              to="/for-parents"
              className="mt-4 inline-block font-semibold text-primary hover:underline"
            >
              What families get &rarr;
            </Link>
          </div>

          <h3 className="mt-10 font-semibold text-foreground">
            What is planned, and not open
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Direct family subscriptions are designed but not built. These are
            the advertised figures, kept here so they are not lost &mdash; not
            an offer.
          </p>
          <dl className="mt-4 divide-y divide-border rounded-card border border-border bg-background">
            {FAMILY_PLANS.map((plan) => (
              <div
                key={plan.name}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4"
              >
                <dt className="font-medium text-foreground">
                  {plan.name}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {plan.subtitle}
                  </span>
                </dt>
                <dd className="text-sm text-muted-foreground">
                  {plan.price} {plan.period}
                </dd>
              </div>
            ))}
            {ADD_ONS.map((addOn) => (
              <div
                key={addOn.name}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4"
              >
                <dt className="font-medium text-foreground">{addOn.name}</dt>
                <dd className="text-sm text-muted-foreground">{addOn.price}</dd>
              </div>
            ))}
          </dl>

          <Link
            to="/enquiry?kind=family"
            className="mt-6 inline-block rounded-btn border border-border bg-card px-5 py-2.5 font-semibold text-foreground"
          >
            Tell me when this opens
          </Link>
        </div>
      )}

      {/* --- What this page cannot yet promise ----------------------------- */}
      <section className="mx-auto mt-14 max-w-3xl rounded-card border border-border bg-background p-6">
        <h2 className="font-semibold text-foreground">
          Before you choose a plan
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing on this page takes a payment. Every button here starts a
          conversation — a school account is created by Special Miles, because
          creating one means creating the thing every account at that school
          hangs off. No card is entered and no plan is applied.
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
