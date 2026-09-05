import PublicLayout from '../../components/PublicLayout'
import {
  Lead,
  NextStep,
  NotThis,
  Points,
  Section,
} from '../../components/PublicSections'

/**
 * For somebody who is not connected to a school — db/088.
 *
 * ---------------------------------------------------------------------------
 * THE PAGE THE ROLE HAD NO DOOR WITHOUT
 * ---------------------------------------------------------------------------
 * db/088 built the account. Nothing on the public site mentioned it: the header
 * offered schools, families and specialists, the pricing page never used the
 * word, and the only way in was a card at the bottom of /signup that nobody
 * arrives at by accident. A role nobody can find is a role nobody has.
 *
 * ---------------------------------------------------------------------------
 * WRITTEN FOR SOMEBODY WHO IS TIRED OF BEING A CASE
 * ---------------------------------------------------------------------------
 * The other three pages address people who look after somebody else. This one
 * addresses the person themselves, and the most useful thing it can say is what
 * does NOT happen: no school, no report, nobody reading it. That is the first
 * section rather than a footnote, because it is the first question.
 *
 * It also states plainly that this is small. Two courses and a handful of
 * reading is what exists, and a page implying a programme would be selling
 * something that is not there — which the Academy screen already refuses to do
 * one level down when it says a tick "is not the same claim as having been
 * assessed".
 */
export default function ForIndividuals() {
  return (
    <PublicLayout
      title="For individuals"
      subtitle="For working on this yourself, with no school and nobody else involved."
    >
      <Lead>
        Most of MiZanova sits between a school and a family. This part does not.
        You make an account, and you get short courses and reading written for
        neurodivergent adults and older students &mdash; at your own pace, with
        nobody watching how you go.
      </Lead>

      <Section title="Nobody is looking over your shoulder">
        <p>
          There is no school attached to this account and no teacher, employer
          or clinician on the other end of it. Nothing you read, start or leave
          half-finished is reported to anybody.
        </p>
        <p>
          Special Miles can see how many people started a course, because that
          is how they work out what to write next. They cannot see that it was
          you. The screen that shows those numbers deliberately has no names on
          it, and the database view behind it does not carry any.
        </p>
        <p>
          You are not on anybody&rsquo;s caseload, you have no record here, and
          there is nothing to be referred to.
        </p>
      </Section>

      <Section title="What you actually get">
        <Points
          items={[
            'Short courses you work through in your own time — nothing is timed, nothing is scored, and going back over one changes nothing.',
            'Reading from Special Miles on how the product handles your information and what it will not do.',
            'A home screen that remembers where you were, so picking it up again does not mean finding your place.',
            'An account you can close, with an email address you can change.',
          ]}
        />
      </Section>

      <Section title="What it costs">
        <p>
          Every course is free at the moment. Some may not stay that way: a
          course that costs something says so on its own card, with the price
          on the button, before you have entered anything. Nothing is charged
          for by surprise and nothing here is a trial that quietly ends.
        </p>
        <p>
          There is no subscription. You pay once for a course or you do not,
          and a course you have paid for stays yours &mdash; it keeps working
          even if it is later withdrawn from everybody else.
        </p>
        <p>
          Special Miles also intends to sell one-to-one sessions to
          individuals. That does not exist yet and the pricing for it is still
          being worked out; when it exists it will be on the pricing page like
          everything else.
        </p>
      </Section>

      <NotThis>
        <p>
          This is not therapy, coaching or treatment, and nothing here diagnoses
          anything. It is written material and short courses.
        </p>
        <p>
          There is no assessment and there are no certificates. Marking a module
          done records that you read it, which is not a claim that you were
          tested on it.
        </p>
        <p>
          You cannot book a session with a specialist from this account yet.
          Booking a time runs through a school and a student record, and you
          have neither.
        </p>
        <p>
          If you are a parent of a child at a school that uses MiZanova, this is
          the wrong page &mdash; ask the school for a code, which connects you to
          your child rather than giving you an account of your own.
        </p>
      </NotThis>

      <NextStep
        heading="Make an account"
        body="An email address and a password. No code, no school, and nobody to wait for."
        to="/signup?as=individual"
        label="Create my account"
      />
    </PublicLayout>
  )
}
