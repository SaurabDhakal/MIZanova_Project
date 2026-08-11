import PublicLayout from '../../components/PublicLayout'
import {
  Lead,
  NextStep,
  NotThis,
  Points,
  Section,
} from '../../components/PublicSections'

/**
 * "About" from the Figma header.
 *
 * NO FOUNDING STORY, NO TEAM, NO CUSTOMER NUMBERS. I do not know when Special
 * Miles was founded, who works there, or how many schools use this — and an
 * about page is exactly where a product starts inventing those. What can be
 * written truthfully is what the thing is and the rules it was built to, so
 * that is what is here. Everything else waits for Joe.
 */
export default function About() {
  return (
    <PublicLayout
      title="About MiZanova"
      subtitle="Made by Special Miles, in Australia."
    >
      <Lead>
        MiZanova helps schools support neurodiverse students. A teacher records
        what they saw, the system suggests strategies that have worked
        elsewhere, and a specialist stays in the loop wherever judgement is
        needed.
      </Lead>

      <Section title="Special Miles, and MiZanova">
        <p>
          <strong className="text-foreground">Special Miles</strong> is the
          Australian company behind the platform, and the people who check every
          specialist’s registration and Working With Children Check before a
          school can engage them.{' '}
          <strong className="text-foreground">MiZanova</strong> is the software.
        </p>
      </Section>

      <Section title="The rules it was built to">
        <Points
          items={[
            'Names come off before anything reaches an AI, and the exact text that was sent is kept — so the claim can be checked rather than believed.',
            'A specialist can hold a suggestion back before a teacher ever sees it. Low confidence or a sensitive topic routes to a person.',
            'Access to a child comes from an assignment or a guardian link, never from a job title.',
            'Nothing on a screen is a number the system cannot actually measure.',
            'Records are stored in Sydney and do not leave Australia.',
          ]}
        />
      </Section>

      <NotThis title="What this site will not claim">
        <p>
          There are no customer numbers here, no school logos, and no
          testimonials. When there are real ones they will appear with the names
          of the people who gave them.
        </p>
        <p>
          MiZanova is not a diagnostic or clinical tool. It does not replace an
          assessment, a therapist, or a school’s own safeguarding process.
        </p>
      </NotThis>

      <NextStep
        heading="Want to talk to a person?"
        body="Tell us about your school or your practice and somebody will reply. There is no chatbot and no sales sequence."
        to="/enquiry"
        label="Get in touch"
      />
    </PublicLayout>
  )
}
