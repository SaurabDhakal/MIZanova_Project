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
        MiZanova raises concerns inside your school and keeps a record of who
        acted and when. It is a tool for your process. It is not the process,
        and it is not a route to any authority.
      </Lead>

      <Section title="Raising a concern">
        <p>
          A teacher can flag an incident at the moment they log it, without
          leaving the form or finding anybody. The flag goes to the school’s
          safeguarding queue immediately.
        </p>
        <Points
          items={[
            'The queue shows what is open and how long acknowledgement is taking.',
            'Acknowledging records who did it and when — it cannot be back-dated.',
            'A flagged log is locked from casual editing, so the record of what was first written survives.',
            'Nothing about a flag depends on the teacher knowing who to email.',
          ]}
        />
      </Section>

      <Section title="Who is allowed near a child’s record">
        <p>
          Access comes from a relationship, not a job title. A teacher reaches a
          child because they are assigned to them; a specialist because the
          child is on their caseload; a guardian because a school issued them a
          code for that specific child.
        </p>
        <p>
          Staff are verified by Special Miles before they can open any student
          record, and a member of staff who moves school loses access to the
          children they left behind on the day they accept the new invitation.
        </p>
      </Section>

      <Section title="Screening for specialists">
        <p>
          A specialist joining the Special Miles network gives their
          professional registration and their Working With Children Check, and a
          named person verifies both at the source — the Office of the
          Children’s Guardian and the relevant register — before they are
          admitted.
        </p>
        <p>
          Checks expire, so the expiry date is held and the platform reports
          when one is running out or was never recorded. A school can also see
          whether a specialist was vetted by Special Miles or engaged directly
          by the school itself, because those are different things and both are
          allowed.
        </p>
      </Section>

      <NotThis title="Where this stops">
        <p>
          <strong className="text-foreground">
            It does not report to police, child protection or any regulator.
          </strong>{' '}
          A flag raises a concern inside your school. Your mandatory reporting
          obligations are unchanged and are not discharged by using this.
        </p>
        <p>
          It does not decide whether something is a safeguarding matter. A
          person does.
        </p>
        <p>
          Verifying a check records that a named person confirmed it on a date.
          MiZanova does not connect to the Office of the Children’s Guardian —
          the button is the attestation, not the check.
        </p>
        <p>
          An expired check does not automatically remove anybody’s access.
          Whether it should, and after how long, is a decision for Special Miles
          and is not made quietly by the software.
        </p>
      </NotThis>

      <NextStep
        heading="Does this fit your Child Safe Standards work?"
        body="Tell us how your school currently records concerns and acknowledgements, and we will tell you honestly where this helps and where it does not."
        to="/enquiry"
        label="Talk to us"
      />
    </PublicLayout>
  )
}
