import { Link } from 'react-router-dom'
import PublicLayout from '../../components/PublicLayout'
import {
  Lead,
  NextStep,
  NotThis,
  Points,
  Section,
  Split,
} from '../../components/PublicSections'
import { NothingLeavesFigure } from '../../components/PublicFigures'

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
        Most of MiZanova sits between a school and a family. This part does not
        &mdash; short courses, reading and suggestions written for
        neurodivergent adults, at your own pace, with nobody watching.
      </Lead>

      <Split
        title="Nobody is looking over your shoulder"
        figure={<NothingLeavesFigure />}
      >
        <p>
          No school, no teacher, no clinician on the other end. Nothing you
          read, start or leave half-finished is reported to anybody, and you are
          on nobody&rsquo;s caseload.
        </p>
        <p>
          Special Miles can see how many people started a course, not that it
          was you. The screen has no names on it and neither does the view
          behind it.
        </p>
      </Split>

      {/* ---------------------------------------------------------------
          THIS LIST WAS FOUR LINES LONG AND DESCRIBED A DIFFERENT PRODUCT.
          ---------------------------------------------------------------
          It said: courses, reading, a home screen, an account you can close.
          Written when that was true. Since then the account gained the AI
          suggestions the whole business is built on, goals with check-ins,
          specialist session requests answered by email, and receipts — and the
          page that is supposed to sell the thing never mentioned any of them.

          The pricing page's own "For myself" tab already talked about
          suggestions, so the two public pages disagreed about what MiZanova
          is, and the dedicated one was the poorer description.

          Grouped rather than listed flat: somebody deciding whether to sign up
          is asking "what would I do here on a Tuesday", and eleven bullets in
          a row answers that worse than four things with a sentence each.
          --------------------------------------------------------------- */}
      <Section title="What you actually get">
        <p>
          <b>Suggestions for your own situation.</b> Describe what you are
          finding hard and get two things to try &mdash; practical steps, not a
          diagnosis. Readable by you and nobody else.
        </p>
        <p>
          <b>Things you are working on.</b> A sentence you wrote and a reason
          you wrote it, with a check-in. No streak and no percentage &mdash; a
          number that resets after a bad fortnight is a punishment.
        </p>
        <p>
          <b>Short courses and reading.</b> Nothing timed or scored, and you
          can read the first part before deciding. Two courses and a few
          articles today &mdash; which is small, and saying otherwise would be
          selling something that is not there.
        </p>
        <p>
          <b>Time with a verified specialist, if you want it.</b> You can see
          when they are free and ask for forty-five minutes. They accept or
          decline, and you are emailed either way.
        </p>

        <Points
          items={[
            'A home screen that remembers where you were, so picking it up again does not mean finding your place.',
            'A receipt for anything you pay for, numbered, printable, and yours to keep.',
            'Every word of it in one file whenever you want it — what you read, what you paid, what you asked and what it said back.',
            'An account you can close yourself, with an email address you can change.',
          ]}
        />
      </Section>

      {/* This section is about money and therefore has to be the most
          carefully maintained on the site. It previously said sessions "do not
          exist yet" while the paragraph twenty lines below described using
          them, which is the same page disagreeing with itself about the
          product. Prices are read from the database at the pricing page rather
          than typed anywhere, so the one thing this can safely do is describe
          the SHAPE of the charging and send people there for figures. */}
      <Section title="What it costs">
        <p>
          The account is free, no card is asked for, and nothing is a trial
          that quietly starts charging. Every course is free today; if one ever
          costs something, the price is on it before you start.
        </p>
        <p>
          No subscription and no price for a specialist session today. Either
          would appear on the{' '}
          <Link to="/pricing" className="font-semibold text-primary underline">
            pricing page
          </Link>{' '}
          first, and would change how many suggestions you get a day &mdash; not
          whether you can use MiZanova.
        </p>
      </Section>

      <NotThis>
        <p>
          This is not therapy, coaching or treatment, and nothing here diagnoses
          anything. It is written material and short courses.
        </p>
        <p>
          No assessment and no certificates. Marking a module done records that
          you read it, not that you were tested.
        </p>
        <p>
          Asking a specialist for a session is a request, not a booking &mdash;
          they decide, and you are emailed the time and nothing else. What you
          wrote stays in your account.
        </p>
        <p>
          A parent at a school that uses MiZanova wants a code from the school,
          not this page.
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
