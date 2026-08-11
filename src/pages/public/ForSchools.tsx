import PublicLayout from '../../components/PublicLayout'
import {
  CardGrid,
  Lead,
  NextStep,
  NotThis,
  Points,
  Section,
} from '../../components/PublicSections'

/**
 * "For School" from the Figma header.
 *
 * Every claim maps to a screen that exists. Where the design's marketing would
 * have said "powerful analytics", this says which figures a school actually
 * gets and where they come from — because a leader reading this will open the
 * product a week later and compare.
 */
export default function ForSchools() {
  return (
    <PublicLayout
      title="For schools"
      subtitle="See the pattern across a year group without reading every incident."
    >
      <Lead>
        A teacher records what they saw in about twenty seconds. Everything a
        school leader needs — trends, the safeguarding queue, who has access to
        what — is built from those records rather than from a separate reporting
        exercise nobody has time for.
      </Lead>

      <CardGrid
        cards={[
          {
            icon: 'safeguarding',
            title: 'A safeguarding queue that gets answered',
            body: 'A teacher can flag an incident as they log it. The queue shows what is open and how long acknowledgement is taking — the number a leader is actually asked about.',
          },
          {
            icon: 'kpis',
            title: 'Trends without names',
            body: 'Behaviour patterns by category and time of day across a year group. Leaders see the shape of a problem without reading individual children’s records.',
          },
          {
            icon: 'verification',
            title: 'You decide who is staff',
            body: 'Nobody claims to work at your school. An administrator invites them by email, and the account is created already attached and already verified.',
          },
        ]}
      />

      <Section title="What a school administrator can do">
        <Points
          items={[
            'Invite teachers, specialists and other administrators by email. The invitation works once and expires in fourteen days.',
            'Give a family access to their own child with a single-use code, sent to the address the school holds.',
            'Assign staff to students — which is what grants access to a record. Employment alone never does.',
            'See every time a student record was opened, and by whom.',
            'See which of your specialists Special Miles vetted, and which your school engaged directly.',
          ]}
        />
      </Section>

      <Section title="It keeps working when the wifi does not">
        <p>
          The app opens with no connection, and a behaviour log written offline
          is kept on the device and uploads by itself. Existing records are
          deliberately <strong className="text-foreground">not</strong> stored
          on the device, because school laptops are shared.
        </p>
      </Section>

      <NotThis>
        <p>
          There is no compliance score. Nothing here computes a per-staff
          percentage, and a number beside a person’s name that nobody can
          explain is worse than none — somebody will make a decision with it.
        </p>
        <p>
          It does not report to any authority. A safeguarding flag raises the
          incident inside your school; your existing obligations and processes
          are unchanged.
        </p>
      </NotThis>

      <NextStep
        heading="See it with your own year groups"
        body="Tell us roughly how many students you have and what you are trying to fix. We will show you what a term of logging actually looks like."
        to="/enquiry"
        label="Talk to us"
      />
    </PublicLayout>
  )
}
