import PublicLayout from '../../components/PublicLayout'
import { Lead, NextStep, Section } from '../../components/PublicSections'
import { FAQS } from '../../content/faqs'

/**
 * "Help Center" from the Figma footer.
 *
 * NOT A KNOWLEDGE BASE, AND NOT PRETENDING TO BE ONE. A help centre implies
 * search, categories and hundreds of articles; there are none, and a page with
 * an empty search box and three results is worse than a page that answers the
 * questions people actually arrive with.
 *
 * Every question below is one somebody has genuinely been confused by while
 * this was being built — most of them by Saurab, testing it. The account
 * questions come first because "how do I get in" is what nearly everybody
 * lands here for.
 */

export default function Help() {
  return (
    <PublicLayout
      title="Help"
      subtitle="The questions people actually arrive with."
    >
      <Lead>
        There is no ticket system and no chatbot. If your question is not
        answered below, a person reads what you send and replies.
      </Lead>

      {FAQS.map((group) => (
        <Section key={group.section} title={group.section}>
          <dl className="space-y-6">
            {group.items.map((item) => (
              <div key={item.q}>
                <dt className="font-semibold text-foreground">{item.q}</dt>
                <dd className="mt-1.5 text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ))}

      <NextStep
        heading="Not answered here?"
        body="Send the question. Say what you were trying to do and what happened instead — that gets a useful answer faster than anything else."
        to="/enquiry"
        label="Ask us"
      />
    </PublicLayout>
  )
}
