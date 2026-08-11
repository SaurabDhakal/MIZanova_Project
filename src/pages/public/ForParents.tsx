import PublicLayout from '../../components/PublicLayout'
import {
  Lead,
  NextStep,
  NotThis,
  Points,
  Section,
} from '../../components/PublicSections'

/**
 * "For Parent" from the Figma header.
 *
 * WRITTEN FOR SOMEBODY WORRIED, not for somebody buying. A parent arrives here
 * because a school mentioned it, and their first question is never "what are
 * the features" — it is "who can see things about my child". So that is the
 * first section, and consent gets one of its own.
 */
export default function ForParents() {
  return (
    <PublicLayout
      title="For families"
      subtitle="See how the school day is going, in first names and plain words."
    >
      <Lead>
        MiZanova costs a family nothing. Your child’s school gives you a code,
        you enter it once, and you can see what the school has chosen to share
        about your child — and add what you are seeing at home.
      </Lead>

      <Section title="Who can see what">
        <p>
          You see your own child and nobody else’s. Teachers see the children
          they are assigned to. A specialist sees the children on their
          caseload. None of that is a setting somebody can get wrong — it is
          enforced by the database on every request, not by the screen.
        </p>
        <p>
          You do not see every behaviour log, and that is deliberate. A teacher
          chooses what to share, so the picture you get is the one they meant to
          give rather than a raw feed of a hard day.
        </p>
      </Section>

      <Section title="What you can do">
        <Points
          items={[
            'Read the updates your child’s teachers have shared with you.',
            'Record what you are seeing at home, so the school has the other half of the picture.',
            'See the goals set for your child and how far along each one is — the same figures the staff see.',
            'Confirm you have read an IEP document, which records the date against your account.',
            'Message the teachers and specialists working with your child.',
          ]}
        />
      </Section>

      <Section title="Consent, and taking it back">
        <p>
          Before any observation is sent for an AI strategy suggestion, names,
          contact details and dates of birth are removed. You give consent for
          that, and you can withdraw it at any moment — which stops it
          immediately, not at the end of term.
        </p>
        <p>
          The exact text that was sent is kept. If you ask what left the
          building, you can be shown it rather than told about it.
        </p>
      </Section>

      <NotThis>
        <p>
          MiZanova does not diagnose anything and is not a clinical tool. It
          suggests classroom strategies to teachers.
        </p>
        <p>
          Confirming you have read a document is not an electronic signature,
          and does not replace signing something where the school requires it.
        </p>
        <p>
          Children do not have their own accounts. Nothing here asks a child to
          log in.
        </p>
      </NotThis>

      <NextStep
        heading="Has your school given you a code?"
        body="It looks like K7QP-4M2X-9RTB and arrives by email or from the school office. Entering it sets up your account and connects you to your child in one step."
        to="/link"
        label="Enter my code"
      />
    </PublicLayout>
  )
}
