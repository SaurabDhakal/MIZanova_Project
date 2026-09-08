import { Link } from 'react-router-dom'
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
          <b>Suggestions for your own situation.</b> Describe something you are
          finding hard, in your own words, and get two specific things to try.
          Not a diagnosis and not advice about medication &mdash; practical
          steps, written for you rather than about you. You can ask a follow-up
          about one of them, say whether it helped, and turn any of them into
          something you are working on. What you write is readable by you and
          nobody else: not a school, not a specialist, not Special Miles.
        </p>
        <p>
          <b>Things you are working on, in your own words.</b> A goal here is a
          sentence you wrote and a reason you wrote it, with a check-in that
          asks how it went &mdash; good, mixed, or hard. There is no streak and
          no percentage, on purpose: a number that resets to zero when you have
          a bad fortnight is a punishment, not a record.
        </p>
        <p>
          <b>Short courses and reading.</b> Worked through in your own time
          &mdash; nothing is timed, nothing is scored, and going back over one
          changes nothing. You can read the first part of any course before
          deciding about it. There are two courses and a handful of articles
          today, which is small, and saying otherwise would be selling
          something that is not there.
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
          The account is free and there is nothing to pay to make one. No card
          is asked for at sign-up, and nothing here is a trial that quietly
          ends and starts charging you.
        </p>
        <p>
          Every course is free at the moment. Some may not stay that way: a
          course that costs something says so on its own card, with the price
          on the button, before you have entered anything. A course you have
          paid for stays yours &mdash; it keeps working even if it is later
          withdrawn from everybody else.
        </p>
        <p>
          There is no subscription on sale today. If one is offered, it will be
          on the{' '}
          <Link to="/pricing" className="font-semibold text-primary underline">
            pricing page
          </Link>{' '}
          with the price on it, and it would change how many suggestions you can
          ask for in a day and which model answers them &mdash; not whether you
          can use MiZanova, which stays free either way.
        </p>
        <p>
          Asking a specialist for a session costs nothing at the moment, because
          Special Miles has not set a price for one. Nobody will ask you for a
          card. When there is a figure it will be on the pricing page, and
          asking will still be asking &mdash; a specialist decides, rather than
          selling an afternoon off a shelf.
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
          You can ask a verified specialist for a session, and they answer in
          your account. It is a request rather than a booking &mdash; they
          decide &mdash; and you are emailed when they answer. The email carries
          the time and nothing else: what you wrote about what you are finding
          hard stays in your account, where only you can read it.
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
