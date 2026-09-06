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
export type Faq = {
  q: string
  a: React.ReactNode
  roles?: Role[]
}

export const FAQS: { section: string; items: Faq[] }[] = [
  {
    section: 'Getting an account',
    items: [
      {
        q: 'How do I sign up?',
        roles: ['parent', 'educator', 'specialist', 'school_admin', 'student'],
        a: (
          <>
            You do not. An account is created for you by the thing that gives
            you a reason to have one — a school invites you by email, or gives
            your family a code for your child. There is no open registration
            form, because an account attached to nothing cannot do anything.{' '}
            <Link to="/signup" className="text-primary hover:underline">
              See which route applies to you →
            </Link>
          </>
        ),
      },
      {
        q: 'My child’s school gave me a code. What now?',
        roles: ['parent'],
        a: (
          <>
            <Link to="/link" className="text-primary hover:underline">
              Enter it here
            </Link>
            . It sets up your account and connects you to your child in one
            step. The code works once, expires after thirty days, and only works
            for the email address the school sent it to — which is what stops
            somebody else reaching your child’s record.
          </>
        ),
      },
      {
        q: 'I work at a school and there is no invitation in my inbox.',
        roles: ['educator', 'specialist', 'school_admin'],
        a: 'Ask your school office to send one. Only a school administrator can, and only they can say you work there — which is the point. Check spam first: invitations come from an automated address.',
      },
      {
        q: 'My invitation link says it does not work.',
        roles: ['parent', 'educator', 'specialist', 'school_admin'],
        a: 'Invitations expire after fourteen days and can only be used once, so the most common cause is that it was already opened or has been sitting in an inbox too long. Ask whoever invited you to send a new one.',
      },
      {
        q: 'I am a specialist. How do I join?',
        roles: ['specialist'],
        a: (
          <>
            Apply to the network and Special Miles checks your registration and
            Working With Children Check.{' '}
            <Link to="/for-specialists" className="text-primary hover:underline">
              The application is here
            </Link>
            . Approval admits you; your account is created when a school engages
            you.
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
        a: 'The app opens and you can log behaviour with no connection — those logs are kept on the device and upload by themselves. Existing records will not load, because they are deliberately never stored on the device: school laptops are shared.',
      },
      {
        q: 'Why can I not see any students?',
        roles: ['educator', 'specialist', 'school_admin'],
        a: 'Two possible reasons, and the screen usually says which. Either your account has not been verified by Special Miles yet, or you have not been assigned to any students. Access comes from an assignment, never from being employed at the school.',
      },
      {
        q: 'I am a parent and my dashboard is empty.',
        roles: ['parent'],
        a: 'No child is linked to your account yet. If you have a code from the school, enter it. If you do not, ask the school office — only they can issue one, and only to the address they hold for you.',
      },
      {
        q: 'Can I be a parent and a teacher at the same time?',
        roles: ['parent', 'educator'],
        a: 'Yes. One account can hold several roles — a teacher at one school, a parent of a child at another. Use the context switcher at the top to change which one you are acting as.',
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
            The text of an observation, with names, contact details and dates of
            birth removed first. The exact anonymised text is stored against the
            record, so you can be shown what left rather than told about it.{' '}
            <Link to="/privacy" className="text-primary hover:underline">
              More on how data is handled →
            </Link>
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
        a: 'The teachers assigned to them, specialists with them on a caseload, the school’s administrators, and you. Special Miles staff can reach records for support and safeguarding, and every time they do it is written to the same access log your school can read.',
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
        a: 'No. The account is free, every course is free at the moment, and asking a specialist for a session costs nothing because no price has been set for one. If a course ever costs something, the price is on it before you start.',
      },
      {
        q: 'What does subscribing actually change?',
        roles: ['individual'],
        a: 'Two things, and nothing else: your suggestions are answered by the more capable model, and you can ask more times a day. Courses, the library, your goals and asking for a session are the same either way.',
      },
      {
        q: 'What happens if I cancel?',
        roles: ['individual'],
        a: 'It stops renewing and you keep what you have paid for until the end of the period you are in — nothing is switched off the moment you press it. You can start it again any time before then.',
      },
      {
        q: 'Can anybody else see what I write?',
        roles: ['individual'],
        a: 'No. Your goals, your check-ins and what you ask the AI are readable by you and nobody else — not another user, not a specialist, not Special Miles. That is enforced by the database rather than by the screens hiding things.',
      },
    ],
  },
]
