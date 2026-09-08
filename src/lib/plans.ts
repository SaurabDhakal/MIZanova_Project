import type { EnquiryPlan } from './api'

/**
 * What Special Miles publishes as its prices.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * Two screens now talk about what a school pays and they were reading different
 * sources. The public Pricing page had these figures hard-coded in its own
 * component; Subscriptions (db/072) let a platform admin type any rate into a
 * free-text field with nothing to check it against.
 *
 * That is not a tidiness problem. The first agreement recorded on the new
 * screen read "Mid-size schools — $2,400 per year". The published price for
 * Mid-size is $5,800 PER TERM; $2,400 per term is SMALL schools. Wrong plan,
 * wrong period, wrong amount — and the screen had no way to notice, because it
 * had never been told what the company advertises.
 *
 * One source, both screens.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM, AND HOW MUCH THEY ARE WORTH
 * ---------------------------------------------------------------------------
 * They are copied from the client's own designs — P-005 Pricing — and are
 * already published on the public site, so they are a statement customers have
 * been shown. Nothing here is estimated or rounded.
 *
 * BUT THEY ARE NOT SETTLED. Joe Abboud's brief lists "willingness to pay,
 * pricing strategies, and market segmentation" as open questions being
 * researched with Practera, whose findings "will directly inform the design".
 * So these are what is advertised today, not what a school must be charged.
 *
 * That is exactly why Subscriptions compares rather than constrains: a platform
 * admin can agree any figure — a pilot, a discount, whatever the research
 * changes it to — and the screen simply says when it differs from the page a
 * customer can read.
 */

export type PublishedPlan = {
  key: EnquiryPlan
  name: string
  subtitle: string
  /**
   * Cents per term, or null where the published price is "Custom".
   *
   * NULL IS NOT ZERO AND NOT MISSING. Large schools are enterprise-priced by
   * negotiation, and putting a number here would invent one — the same fault
   * as a fabricated ABN on a public page.
   */
  termCents: number | null
  /** Cents per year where an annual rate is advertised alongside the term one. */
  annualCents: number | null
}

export const PUBLISHED_PLANS: PublishedPlan[] = [
  {
    key: 'small_school',
    name: 'Small schools',
    subtitle: 'Up to 150 students',
    termCents: 240000,
    annualCents: 800000,
  },
  {
    key: 'mid_school',
    name: 'Mid-size schools',
    subtitle: '150 to 600 students',
    termCents: 580000,
    annualCents: 1950000,
  },
  {
    key: 'large_school',
    name: 'Large schools',
    subtitle: '600+ students',
    termCents: null,
    annualCents: null,
  },
  {
    /*
     * NO FIGURE, AND THAT IS THE POINT — db/095.
     *
     * The bands above are priced per student. docs/11 sets out why that ruler
     * does not fit a Montessori setting: it is substantially early childhood
     * in Australia, a centre is not sized like a primary school, and there are
     * no year levels to count children into. A number here would be one
     * arrived at by analogy, which is inventing a price.
     */
    key: 'montessori',
    name: 'Montessori & early years',
    subtitle: 'Centres, preschools and long day care',
    termCents: null,
    annualCents: null,
  },
  {
    key: 'essential',
    name: 'Essential',
    subtitle: 'Families, per month',
    termCents: null,
    annualCents: null,
  },
  {
    key: 'premium',
    name: 'Premium',
    subtitle: 'Families, per month',
    termCents: null,
    annualCents: null,
  },
]

/** The published plan a free-text label refers to, matched leniently. */
export function findPublishedPlan(label: string): PublishedPlan | undefined {
  const wanted = label.trim().toLowerCase()
  if (!wanted) return undefined
  return PUBLISHED_PLANS.find(
    (p) => p.name.toLowerCase() === wanted || p.key === wanted,
  )
}
