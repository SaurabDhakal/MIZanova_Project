import { Link } from 'react-router-dom'
import type { Role } from '../lib/roles'

/**
 * The questions people actually arrive with.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT INSIDE Help.tsx ANY MORE
 * ---------------------------------------------------------------------------
 * `/help` is a PUBLIC page: it renders the marketing header, whose logo goes
 * to `/`, and `/` sends a signed-in person to their own dashboard. So a person
 * who opened Help from inside Settings had left the application — and the only
 * obvious way onward put them on the home screen with Settings gone. They had
 * not navigated anywhere wrong; the door led outside.
 *
 * The answers are the same answers either way, so they live here and both
 * screens render them: the public page for somebody deciding, and the Settings
 * tab for somebody already signed in, who now never leaves the app.
 *
 * Every question is one somebody has genuinely been confused by while this was
 * being built — most of them by Saurab, testing it. The account questions come
 * first because "how do I get in" is what nearly everybody lands here for.
 */
/**
 * `roles` means "only these people". Absent means everybody.
 *
 * ---------------------------------------------------------------------------
 * BECAUSE MOST OF THIS IS NOT AN INDIVIDUAL'S QUESTION
 * ---------------------------------------------------------------------------
 * Signed in as an individual, the Help tab asked them "Can I stop AI
 * suggestions for my child?" and "Who can see my child's record?", and
 * answered the second with teachers, caseloads and school administrators.
 * They have no child, no school and nobody administering them — that is the
 * whole definition of the role.
 *
 * Eleven of the thirteen questions were somebody else's. Tagging them costs a
 * line each and means the in-app page answers the person actually reading it.
 * The PUBLIC help page still shows all of them, because a visitor there has
 * not told us who they are and might be any of these people.
 */
/**
 * `beforeAccount` means "this question stops making sense once you are in".
 *
 * ---------------------------------------------------------------------------
 * THE WHOLE FIRST SECTION WAS SOMEBODY ELSE'S PROBLEM
 * ---------------------------------------------------------------------------
 * `roles` tags WHO a question is for. It cannot express WHEN, and every item
 * in "Getting an account" is a question you only have before you have one.
 * Tagged by role alone, they were shown in Settings to people who were, by
 * definition, already signed in: a specialist reading "I am a specialist. How
 * do I join?", a teacher reading "there is no invitation in my inbox", and
 * everybody reading "How do I sign up?" — answered "You do not."
 *
 * It was not only noise. Four of the five answers link to `/signup`, `/link`
 * and `/for-specialists`, which are PUBLIC pages — so the section that made no
 * sense in-app was also the densest source of doors out of the application,
 * the exact fault the in-app Help tab was built to stop. Dropping it here
 * closes all four at once.
 *
 * The public page still shows them, and must: that is where somebody who has
 * not got an account is standing.
 */
export type Faq = {
  q: string
  a: React.ReactNode
  roles?: Role[]
  beforeAccount?: boolean
}

export const FAQS: { section: string; items: Faq[] }[] = [
  {
    section: 'Getting an account',
    items: [
      {
        q: 'How do I sign up?',
        roles: ['parent', 'educator', 'specialist', 'school_admin', 'student'],
        beforeAccount: true,
        a: (
          <>
            You do not. A school invites you, or gives your family a code. An
            account attached to nothing cannot do anything.{' '}
            <Link to="/signup" className="text-primary hover:underline">
              See which route applies to you →
            </Link>
          </>
        ),
      },
      {
        q: 'My child’s school gave me a code. What now?',
        roles: ['parent'],
        beforeAccount: true,
        a: (
          <>
            <Link to="/link" className="text-primary hover:underline">
              Enter it here
            </Link>
            . It works once, expires after thirty days, and only for the
            address the school sent it to — which is what stops somebody else
            reaching your child’s record.
          </>
        ),
      },
      {
        q: 'I work at a school and there is no invitation in my inbox.',
        roles: ['educator', 'specialist', 'school_admin'],
        beforeAccount: true,
        a: 'Ask your school office. Only an administrator can say you work there, which is the point. Check spam first — invitations come from an automated address.',
      },
      {
        q: 'My invitation link says it does not work.',
        roles: ['parent', 'educator', 'specialist', 'school_admin'],
        beforeAccount: true,
        a: 'Invitations last fourteen days and work once, so it was probably already opened or has sat too long. Ask whoever invited you for a new one.',
      },
      {
        q: 'I am a specialist. How do I join?',
        roles: ['specialist'],
        beforeAccount: true,
        a: (
          <>
            Apply to the network and Special Miles checks your registration and
            Working With Children Check.{' '}
            <Link to="/for-specialists" className="text-primary hover:underline">
              The application is here
            </Link>
            . Approval admits you; your account is created when a school
            engages you.
          </>
        ),
      },
    ],
  },
  {
    section: 'Using it',
    items: [
      {
        q: 'Does it work without internet?',
        a: 'Yes for logging — those upload by themselves. Existing records will not load, because they are never stored on the device: school laptops are shared.',
      },
      {
        q: 'Why can I not see any students?',
        roles: ['educator', 'specialist', 'school_admin'],
        a: 'Either your account is not verified yet, or you have not been assigned any students — the screen usually says which. Access comes from an assignment, never from employment.',
      },
      {
        q: 'I am a parent and my dashboard is empty.',
        roles: ['parent'],
        a: 'No child is linked yet. Enter your code, or ask the school office — only they can issue one, and only to the address they hold for you.',
      },
      {
        q: 'Can I be a parent and a teacher at the same time?',
        roles: ['parent', 'educator'],
        a: 'Yes. One account can hold several roles. Use the context switcher at the top to change which one you are acting as.',
      },
    ],
  },
  {
    section: 'Data and consent',
    items: [
      {
        q: 'What is sent to the AI?',
        a: (
          <>
            The observation text, with names, contact details and dates of
            birth removed first. The exact text is stored, so you can be shown
            what left.{' '}
            {/* A NEW TAB, BECAUSE THIS ANSWER IS READ IN TWO PLACES.
                /privacy is public and has no in-app twin, so following it
                from the Settings Help tab would render the marketing header
                over the top of the application — the same walking-out this
                tab exists to prevent. Opening it alongside leaves Settings
                where it was. Said in the link text rather than only in the
                markup, because a tab opening unannounced is its own small
                surprise. */}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              More on how data is handled (opens in a new tab)
            </a>
          </>
        ),
      },
      {
        q: 'Can I stop AI suggestions for my child?',
        roles: ['parent'],
        a: 'Yes, from Privacy & Consent in your account, and it takes effect immediately — the next request is refused by the database rather than queued.',
      },
      {
        q: 'Who can see my child’s record?',
        roles: ['parent'],
        a: 'The teachers assigned to them, specialists on their caseload, the school’s administrators, and you. Special Miles staff can reach records for support and safeguarding, and every time is written to the access log your school can read.',
      },
    ],
  },
  {
    /*
     * WRITTEN FOR SOMEBODY WITH NO SCHOOL AND NOBODY ABOVE THEM.
     *
     * Every answer here is a fact about the product that can be pointed at —
     * an RLS policy, a migration, a route — not a policy nobody has agreed.
     * Where the honest answer is "Special Miles has not decided", it says so
     * rather than filling the gap.
     */
    section: 'Paying for it',
    items: [
      {
        q: 'Do I have to pay anything?',
        roles: ['individual'],
        a: 'No. The account and every course are free at the moment, and no price has been set for a specialist session. If a course ever costs something, the price is on it before you start.',
      },
      {
        q: 'What does subscribing actually change?',
        roles: ['individual'],
        a: 'Two things: a more capable model answers your suggestions, and you can ask more times a day. Everything else is the same either way.',
      },
      {
        q: 'What happens if I cancel?',
        roles: ['individual'],
        a: 'It stops renewing and you keep what you paid for until the period ends. Nothing switches off the moment you press it.',
      },
      {
        q: 'Can anybody else see what I write?',
        roles: ['individual'],
        a: 'No. Your goals, check-ins and questions are readable by you and nobody else — not a specialist, not Special Miles. The database enforces that, not the screens.',
      },
    ],
  },
]
