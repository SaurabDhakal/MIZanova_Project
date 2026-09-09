import PublicLayout from '../../components/PublicLayout'
import {
  CardGrid,
  Figure,
  Lead,
  NextStep,
  NotThis,
  Points,
  Section,
} from '../../components/PublicSections'
import HeroDiagram from '../../components/HeroDiagram'

/**
 * "Security" from the Figma footer.
 *
 * THE EASIEST PAGE ON THIS SITE TO WRITE DISHONESTLY, and the one where it
 * matters most. Security pages are traditionally a wall of words like
 * "enterprise-grade", "bank-level" and "military encryption", none of which
 * mean anything and none of which anybody checks.
 *
 * Everything below is a specific, checkable mechanism that is actually built.
 * Where something is NOT done — no penetration test, no certification — it says
 * so, because a school's IT department will ask and the answer will be found
 * out either way.
 */
export default function Security() {
  return (
    <PublicLayout
      title="Security"
      subtitle="What actually stops the wrong person seeing a child’s record."
    >
      <Lead>
        Access is decided by the database on every request, not by a setting
        on a screen &mdash; so a bug in the interface cannot hand somebody a
        record they were never entitled to.
      </Lead>

      <Figure>
        <HeroDiagram />
      </Figure>

      <CardGrid
        cards={[
          {
            icon: 'privacy',
            title: 'The database is the boundary',
            body: 'The database decides what each request may return. A screen asking for the wrong thing still gets nothing.',
          },
          {
            icon: 'ai',
            title: 'Names come off before the AI',
            body: 'Names, contact details and dates of birth are stripped before an observation is sent — and the exact text that went is stored.',
          },
          {
            icon: 'recordAccess',
            title: 'Every record opening is logged',
            body: 'Who opened which student record, and when. Visible to the school and to Special Miles — including their own staff.',
          },
        ]}
      />

      <Section title="Specific things that are true">
        <Points
          items={[
            'Data is stored in Sydney, on Australian infrastructure, and does not leave the country.',
            'Two-factor authentication is required for staff who can open student records.',
            'Access to a child comes from an assignment or a guardian link — never from a role name or an employer.',
            'Invitations and family access codes are stored hashed and single-use, so reading the database yields no working credential.',
            'Student records are never cached on the device, because school laptops are shared. Only the class roster is, so offline logging can work.',
            'A guardian can withdraw AI consent and it stops immediately.',
          ]}
        />
      </Section>

      <Section title="How it is checked">
        <p>
          The access rules have a test suite that signs in as each kind of
          person against a real database. The refusals are tested most: an
          administrator who cannot read another school, a teacher who cannot
          browse parents.
        </p>
      </Section>

      <NotThis title="What has not been done">
        <p>
          No independent penetration test, and no certification — not ISO
          27001, SOC 2 or IRAP. If procurement requires one, better you learn
          that here than in a questionnaire.
        </p>
        <p>
          No published incident-response commitment or uptime guarantee. Those
          are contractual promises Special Miles has not made yet.
        </p>
      </NotThis>

      <NextStep
        heading="Your IT team will have questions"
        body="Send them. Specific ones about data flow, hosting or access control get a specific answer, including where the answer is “not yet”."
        to="/enquiry"
        label="Ask us"
      />
    </PublicLayout>
  )
}
