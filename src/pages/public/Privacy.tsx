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
        What the software actually does with information. Not a legal privacy
        policy — Special Miles publishes that separately, and where the two
        differ the formal policy governs.
      </Lead>

      <Section title="What is stored, and where">
        <p>
          Everything — records, goals, IEP documents, messages, the audit
          trail — is stored in Sydney and does not leave the country.
        </p>
        <Points
          items={[
            'A child: name, year level, an optional school reference, observations, goals, IEP documents and specialist sessions.',
            'An adult: name, email, role, and which school or children they are connected to.',
            'A specialist applying: also a date of birth and screening numbers, used only to verify their Working With Children Check and visible only to Special Miles.',
            'A log of every time a student record is opened, and by whom.',
          ]}
        />
      </Section>

      <Section title="What leaves, and what does not">
        <p>
          Two optional features send anything outside. An observation goes to
          Anthropic for a strategy suggestion, only after names, contact details
          and dates of birth are removed. Browser dictation may send audio to
          the browser&rsquo;s own speech service.
        </p>
        <p>
          The exact text that was sent is stored, so a parent asking what left
          can be shown it. Dictation can be replaced by typing; a voice note
          stays in the Australian store with its conversation.
        </p>
        <p>
          Nothing is sold. There is no advertising, analytics or tracking
          anywhere in this application.
        </p>
      </Section>

      <Section title="Consent">
        <p>
          A guardian consents to AI suggestions and can withdraw at any moment.
          It takes effect immediately — the next request is refused by the
          database, not queued.
        </p>
      </Section>

      <Section title="Who can see a child’s record">
        <p>
          A teacher assigned to them, a specialist on whose caseload they sit,
          the school’s administrators, and their guardians. The database decides
          that on every request, so a fault in the interface cannot widen it.
        </p>
        <p>
          Special Miles staff can reach records for support and safeguarding,
          and every time is written to the access log the school can read.
        </p>
      </Section>

      <NotThis title="What this page is not">
        <p>
          Not a privacy policy, a collection notice, or a statement of your
          rights under the Privacy Act 1988. Those are legal documents, and
          Special Miles must publish them.
        </p>
        <p>
          Data retention periods are not stated here because none have been
          agreed. Ask Special Miles before assuming one.
        </p>
      </NotThis>

      <NextStep
        heading="Something here unclear?"
        body="Ask what is held about a child and you will get a specific answer."
        to="/enquiry"
        label="Ask us"
      />
    </PublicLayout>
  )
}
