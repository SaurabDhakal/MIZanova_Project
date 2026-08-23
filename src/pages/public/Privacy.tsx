import PublicLayout from '../../components/PublicLayout'
import { Lead, NextStep, NotThis, Points, Section } from '../../components/PublicSections'

/**
 * "Privacy Policy" from the Figma footer.
 *
 * IT IS NOT CALLED A POLICY, AND IT IS NOT ONE. A privacy policy is a legal
 * instrument that binds a real company to real commitments, and writing one on
 * Special Miles' behalf would be inventing promises Joe has not made — the
 * same fault as printing a made-up ABN, with worse consequences.
 *
 * What CAN be written truthfully is what the software actually does with data,
 * because that is observable in the code. So this describes the mechanism and
 * says plainly, at the top and the bottom, that the formal policy is a separate
 * document that Special Miles must publish.
 */
export default function Privacy() {
  return (
    <PublicLayout
      title="How your data is handled"
      subtitle="A plain-English description of what the software actually does."
    >
      <Lead>
        This page describes how MiZanova stores and moves information. It is a
        description of the software, not a legal privacy policy — Special Miles
        publishes that separately, and where the two ever differ, the formal
        policy governs.
      </Lead>

      <Section title="What is stored, and where">
        <p>
          Everything is stored in Sydney, on Australian infrastructure, and does
          not leave the country. That includes behaviour records, goals, IEP
          documents, messages and the audit trail.
        </p>
        <Points
          items={[
            'About a child: first and last name, year level, an optional school reference, behaviour observations, goals, IEP documents, and sessions delivered by specialists.',
            'About an adult: name, email address, role, and which school or children they are connected to.',
            'About a specialist applying to the network: additionally a date of birth and screening numbers, used only to verify their Working With Children Check and visible only to Special Miles staff.',
            'A log of every time a student record is opened, and by whom.',
          ]}
        />
      </Section>

      <Section title="What leaves, and what does not">
        <p>
          Two optional features can send information to an external processor.
          An anonymised behaviour observation is sent to Anthropic to generate
          a strategy suggestion, only after names, contact details and dates of
          birth have been removed. Browser dictation may send microphone audio
          to the browser provider&rsquo;s speech service (for example Google in
          Chrome) so it can return text.
        </p>
        <p>
          The exact anonymised text that was sent is stored against the record.
          If a parent asks what left, they can be shown it rather than assured
          about it.
        </p>
        <p>
          Dictation is optional and can be replaced by typing. A voice note is
          different: it is deliberately attached to a message and stored with
          that student conversation in the private Australian data store.
        </p>
        <p>
          Nothing is sold, and there is no advertising, analytics or tracking
          product anywhere in this application.
        </p>
      </Section>

      <Section title="Consent">
        <p>
          A guardian consents to AI suggestions for their child, and can
          withdraw that consent at any moment. Withdrawal takes effect
          immediately: the next request for a suggestion about that child is
          refused by the database, not queued.
        </p>
      </Section>

      <Section title="Who can see a child’s record">
        <p>
          A teacher assigned to them, a specialist with them on their caseload,
          the school’s administrators, and their own guardians. That is decided
          on every request by the database rather than by the screen, so a fault
          in the interface cannot widen it.
        </p>
        <p>
          Special Miles staff can reach records for support and safeguarding.
          When they do, it is written to the same access log the school can
          read.
        </p>
      </Section>

      <NotThis title="What this page is not">
        <p>
          It is not a privacy policy, a collection notice, or a statement of
          your rights under the Privacy Act 1988. Those are legal documents and
          Special Miles must publish them — written by somebody qualified to,
          which is not this software and not me.
        </p>
        <p>
          Data retention periods are not stated here because none have been
          agreed. Ask Special Miles before assuming one.
        </p>
      </NotThis>

      <NextStep
        heading="Something here unclear?"
        body="If you are a parent or a school with a question about what is held about a child, ask and you will get a specific answer."
        to="/enquiry"
        label="Ask us"
      />
    </PublicLayout>
  )
}
