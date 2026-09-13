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
 * screen read "Mid-size schools — $2,400 per year". Mid-size was published at
 * $5,800 PER TERM at the time, and $2,400 per term was SMALL schools. Wrong
 * plan, wrong period, wrong amount — and the screen had no way to notice,
 * because it had never been told what the company advertises. (Those figures
 * have since been replaced; see below. The failure they illustrate has not.)
 *
 * One source, both screens.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM, AND HOW MUCH THEY ARE WORTH
 * ---------------------------------------------------------------------------
 * THE RESEARCH ARRIVED, AND THESE CHANGED BECAUSE OF IT.
 *
 * The earlier figures — $2,400 and $5,800 per term, $8,000 and $19,500 a year —
 * were copied from the client's own designs (P-005 Pricing). This file said at
 * the time that they were "not settled", because Joe Abboud's brief listed
 * "willingness to pay, pricing strategies, and market segmentation" as open
 * questions being researched with Practera, whose findings "will directly
 * inform the design".
 *
 * That research is docs/Team 6 Presentation (Final Report) - 2025.12.17. It
 * recommends, for the Australian market this product sells into:
 *
 *   - AUD 1,500-2,000 per school per year for urban primary and Catholic
 *     schools (its named target segment, 250-800 enrolments)
 *   - AUD 1,000-1,500 per school per year for rural schools
 *   - a target band of roughly AUD 1.5k-2.5k per school per year overall
 *   - Australian competitors benchmarked at AUD 395-3,030 per school per year
 *
 * and it characterises "often AUD 5k+ per school/year" as enterprise budget
 * territory — the weakness it tells us to attack in Compass Education, not to
 * occupy. The old annual figures sat four to ten times above that band.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS CHOSEN, AND WHAT WAS NOT
 * ---------------------------------------------------------------------------
 * The report gives bands, not figures, so a number inside a band had to be
 * picked. Small schools take the rural band (a sub-150 school is rarely a
 * metropolitan one); mid-size takes the middle of the urban band. Term rates
 * are the annual rate plus the same annual-payment discount the page always
 * advertised, so the two lines still agree with each other.
 *
 * THE REPORT CONTRADICTS ITSELF and this file follows the headline. Its
 * per-student figure of AUD 13-15 implies roughly AUD 7,800 for a 600-student
 * school, which is four times its own per-school recommendation for the same
 * school. The per-school band is the one stated as the "target effective
 * price", so that is what is published here. Worth resolving with Joe.
 *
 * Large schools and early years still carry no figure. The report prices
 * neither, and putting a number against them would be inventing one — the
 * fault this file was written to prevent.
 *
 * These remain what is ADVERTISED, not what a school must be charged. That is
 * why Subscriptions compares rather than constrains: a platform admin can agree
 * any figure — a pilot, a discount, a later revision — and the screen simply
 * says when it differs from the page a customer can read.
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
    // AUD 1,200/year — the rural band (1,000-1,500). $350 x 4 terms = $1,400,
    // so paying annually saves 14%.
    termCents: 35000,
    annualCents: 120000,
  },
  {
    key: 'mid_school',
    name: 'Mid-size schools',
    subtitle: '150 to 600 students',
    // AUD 1,800/year — the middle of the urban band (1,500-2,000). $530 x 4
    // terms = $2,120, so paying annually saves 15%.
    termCents: 53000,
    annualCents: 180000,
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
