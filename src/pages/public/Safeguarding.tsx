import PublicLayout from '../../components/PublicLayout'
import {
  Lead,
  NextStep,
  NotThis,
  Points,
  Section,
} from '../../components/PublicSections'

/**
 * "Safeguarding" from the Figma footer's Legal column.
 *
 * THE MOST IMPORTANT THING ON THIS PAGE IS THE LIMIT. Software that touches
 * child safety and is vague about its boundaries invites a school to assume it
 * covers more than it does — and the assumption is only discovered on the day
 * it matters. So the boundary is stated as plainly as the capability.
 */
export default function Safeguarding() {
  return (
    <PublicLayout
      title="Safeguarding"
      subtitle="What the software does, and where your own obligations begin."
    >
      <Lead>
        MiZanova raises concerns inside your school and records who acted and
        when. It is a tool for your process — not the process, and not a route
        to any authority.
      </Lead>

      <Section title="Raising a concern">
        <p>
          A teacher flags an incident as they log it, without leaving the form
          or finding anybody. It reaches the school’s queue immediately.
        </p>
        <Points
          items={[
            'The queue shows what is open and how long acknowledgement is taking.',
            'Acknowledging records who did it and when — it cannot be back-dated.',
            'A flagged log locks, so what was first written survives.',
            'Nothing about a flag depends on the teacher knowing who to email.',
          ]}
        />
      </Section>

      <Section title="Who is allowed near a child’s record">
        <p>
          Access comes from a relationship, not a job title: a teacher is
          assigned, a specialist has the child on their caseload, a guardian was
          issued a code for that child.
        </p>
        <p>
          Staff are verified before they can open any record, and somebody who
          moves school loses the children they left behind the day they accept
          the new invitation.
        </p>
      </Section>

      <Section title="Screening for specialists">
        <p>
          A specialist gives their registration and Working With Children
          Check, and a named person verifies both at the source before they are
          admitted.
        </p>
        <p>
          Expiry dates are held and reported when one runs out or was never
          recorded. A school can see whether a specialist was vetted by Special
          Miles or engaged directly — both are allowed.
        </p>
      </Section>

      <NotThis title="Where this stops">
        <p>
          <strong className="text-foreground">
            It does not report to police, child protection or any regulator.
          </strong>{' '}
          A flag raises a concern inside your school. Your mandatory reporting
          obligations are unchanged.
        </p>
        <p>
          It does not decide whether something is a safeguarding matter. A
          person does.
        </p>
        <p>
          Verifying records that a named person confirmed it on a date.
          MiZanova does not connect to the Office of the Children’s Guardian —
          the button is the attestation, not the check.
        </p>
        <p>
          An expired check does not remove access by itself. Whether it should
          is a decision for Special Miles, not one the software makes quietly.
        </p>
      </NotThis>

      <NextStep
        heading="Does this fit your Child Safe Standards work?"
        body="Tell us how you record concerns now and we will say where this helps and where it does not."
        to="/enquiry"
        label="Talk to us"
      />
    </PublicLayout>
  )
}
