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
import { SafeguardingQueueFigure } from '../../components/PublicFigures'

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
        A teacher records what they saw in about twenty seconds. Trends, the
        safeguarding queue and who has access to what are built from those
        records — not from a reporting exercise nobody has time for.
      </Lead>

      <Figure>
        <SafeguardingQueueFigure />
      </Figure>

      <CardGrid
        cards={[
          {
            icon: 'safeguarding',
            title: 'A safeguarding queue that gets answered',
            body: 'Flagged as it is logged. The queue shows what is open and how long acknowledgement took.',
          },
          {
            icon: 'kpis',
            title: 'Trends without names',
            body: 'Patterns by category and time of day, so you see the shape of a problem without reading a child’s record.',
          },
          {
            icon: 'verification',
            title: 'You decide who is staff',
            body: 'Nobody claims to work at your school. An administrator invites them, and the account arrives verified.',
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
          The app opens with no connection, and a log written offline uploads by
          itself. Existing records are deliberately{' '}
          <strong className="text-foreground">not</strong> stored on the device,
          because school laptops are shared.
        </p>
      </Section>

      <NotThis>
        <p>
          There is no compliance score. A number beside a person’s name that
          nobody can explain is worse than none &mdash; somebody will make a
          decision with it.
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
