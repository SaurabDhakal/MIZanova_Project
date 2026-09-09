import PublicLayout from '../../components/PublicLayout'
import {
  Lead,
  NextStep,
  NotThis,
  Points,
  Section,
  Split,
} from '../../components/PublicSections'
import { WhoCanSeeFigure } from '../../components/PublicFigures'

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
        you enter it once, and you see what they chose to share — and add what
        you are seeing at home.
      </Lead>

      <Split title="Who can see what" figure={<WhoCanSeeFigure />}>
        <p>
          You see your own child and nobody else’s. None of that is a setting
          somebody can get wrong — the database enforces it on every request,
          not the screen.
        </p>
        <p>
          You do not see every behaviour log, deliberately. A teacher chooses
          what to share, so you get the picture they meant to give rather than a
          raw feed of a hard day.
        </p>
      </Split>

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
          Names, contact details and dates of birth are removed before any
          observation is sent. You consent to that, and can withdraw it at any
          moment — which stops it
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
          {/* This said "children do not have their own accounts", which
              stopped being true with db/074. A child CAN have one — it shows
              their goals and nothing else — and it is issued by the school
              only after a family consents. Saying the opposite on the page a
              parent reads before deciding anything was the worst place in the
              product for that sentence to go stale. */}
          A child can have their own sign-in, but only if you agree and the
          school issues it. It shows their goals and nothing else &mdash; no
          behaviour notes, no documents, no messages between adults.
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
