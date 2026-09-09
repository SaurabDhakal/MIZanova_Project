import PublicLayout from '../../components/PublicLayout'
import { type IconName } from '../../components/Icon'
import {
  Lead,
  NextStep,
  Points,
  Section,
} from '../../components/PublicSections'

/**
 * "Features" from the Figma footer.
 *
 * ORGANISED BY WHO USES IT, not by a flat list of capabilities. A feature list
 * is read by somebody deciding whether this fits them, and "which of these
 * matter to me?" is a question a grid of forty ticks makes harder rather than
 * easier.
 *
 * EVERY LINE IS A SCREEN THAT EXISTS. Nothing here is planned, coming soon, or
 * on a roadmap. Where a capability is deliberately absent it is in the panel at
 * the bottom, named — because the absences are as much a description of this
 * product as the presences.
 */

const GROUPS: {
  icon: IconName
  audience: string
  intro: string
  items: string[]
}[] = [
  {
    icon: 'students',
    audience: 'Teachers',
    intro: 'The part that has to work in twenty seconds, in a live classroom.',
    items: [
      'Log a behaviour in three taps, with a timer and optional voice-to-text. Notes are never compulsory.',
      'Flag an incident for safeguarding at the moment you log it, without leaving the form.',
      'Get AI strategy suggestions built from what has worked elsewhere, with the reasoning shown.',
      'Write goals with milestones; progress is calculated from the steps you tick.',
      'Register IEP documents and see which guardians have confirmed reading them.',
      'Message a child’s guardians and the specialists on their care team.',
      'Keep logging with no internet — it uploads by itself when the connection returns.',
    ],
  },
  {
    icon: 'caseload',
    audience: 'Specialists',
    intro: 'Judgement stays with a person, and the tooling assumes that.',
    items: [
      'A caseload of the children you are assigned to, across every school that has engaged you.',
      'A review queue of held AI suggestions, with the original observation and the exact anonymised text that was sent.',
      'Release a suggestion, or replace it with your own words before a teacher sees it.',
      'Record a session with clinical notes and a separate family summary — sharing one never exposes the other.',
      'Share resources with named children and see who has acknowledged them.',
    ],
  },
  {
    icon: 'directory',
    audience: 'School leaders',
    intro: 'Enough to run the thing without reading every incident.',
    items: [
      'A safeguarding queue with open counts and acknowledgement times.',
      'Anonymised trends by category and time of day across a year group.',
      'Invite staff by email; accounts arrive already attached and already verified.',
      'Issue single-use codes that connect a family to their own child.',
      'Assign staff to students — the thing that actually grants access to a record.',
      'A log of every student record opened, and by whom.',
      'Everyone connected to the school on one page: staff and the parents of your students.',
    ],
  },
  {
    icon: 'home',
    audience: 'Families',
    intro: 'Free, and deliberately narrow.',
    items: [
      'The updates your child’s teachers have chosen to share.',
      'Somewhere to record what home is seeing, so the school has the other half.',
      'Goals and IEP documents, with the same progress figures the staff see.',
      'Confirm you have read a document, recorded against your account with a date.',
      'Withdraw AI consent at any moment, which stops it immediately.',
    ],
  },
]

export default function Features() {
  return (
    <PublicLayout
      title="What MiZanova does"
      subtitle="Every line here is a screen that exists today."
    >
      <Lead>
        Nothing on this page is planned, in beta, or on a roadmap. If it is
        listed, it is built — and the things deliberately left out are named at
        the bottom rather than quietly omitted.
      </Lead>

{/* WRITTEN OUT LONGHAND HERE UNTIL NOW, AND SLIGHTLY DIFFERENT FOR IT.
          This page had its own icon chip, its own h2 at text-title, its own
          column at max-w-3xl and its own ticked list with a bare 16px tick —
          five small disagreements with the nine pages beside it, all of them
          from having been written before <Section> and <Points> existed. It
          renders them now, so there is one answer to each question again. */}
      {GROUPS.map((group) => (
        <Section key={group.audience} title={group.audience} icon={group.icon}>
          <p>{group.intro}</p>
          <Points items={group.items} />
        </Section>
      ))}

      {/* THE "DELIBERATELY NOT BUILT" PANEL WAS REMOVED FROM THIS PAGE ON
          Saurab's call: a features page is where somebody is deciding to buy,
          and a list of five things the product does not do is the wrong thing
          to hand them at that moment.

          It is only gone from HERE. The same habit still runs everywhere it is
          load-bearing rather than promotional: /security still names what has
          not been done (no penetration test, no certification), /safeguarding
          still says it does not report to any authority, /privacy still says it
          is not a legal policy, and the footer on every page of this site still
          carries "it does not diagnose, and it is not a clinical tool" — which
          is the one line here that mattered legally, and it did not live only
          in this panel. */}

      <NextStep
        heading="Want to see it working?"
        body="Tell us which of these matters most to your school and we will show you that part first."
        to="/enquiry"
        label="Talk to us"
      />
    </PublicLayout>
  )
}
