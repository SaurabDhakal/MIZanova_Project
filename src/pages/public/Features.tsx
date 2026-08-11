import { Link } from 'react-router-dom'
import PublicLayout from '../../components/PublicLayout'
import Icon, { type IconName } from '../../components/Icon'
import { Lead, NextStep, NotThis } from '../../components/PublicSections'

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

      <div className="mx-auto mt-10 max-w-3xl space-y-10">
        {GROUPS.map((group) => (
          <section key={group.audience}>
            <div className="flex items-center gap-3">
              <span className="inline-flex rounded-btn bg-brand-navy/10 p-2.5 text-brand-navy">
                <Icon name={group.icon} className="h-6 w-6" />
              </span>
              <h2 className="text-title text-foreground">
                {group.audience}
              </h2>
            </div>
            <p className="mt-2 text-muted-foreground">{group.intro}</p>
            <ul className="mt-4 space-y-2.5">
              {group.items.map((item) => (
                <li key={item} className="flex gap-3">
                  <Icon
                    name="tick"
                    className="mt-1 h-4 w-4 shrink-0 text-brand-green"
                  />
                  <span className="text-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <NotThis title="Deliberately not built">
        <p>
          <strong className="text-foreground">No booking calendar.</strong>{' '}
          Nothing here books an appointment — no slots, no availability, no
          reminders — so there is no week grid pretending otherwise.
        </p>
        <p>
          <strong className="text-foreground">No behaviour trend chart for families.</strong>{' '}
          A parent only sees the logs a teacher chose to share, so a trend drawn
          from them could show improvement when it only means fewer were shared.
        </p>
        <p>
          <strong className="text-foreground">No compliance scores.</strong>{' '}
          Nothing computes a percentage next to a staff member’s name.
        </p>
        <p>
          <strong className="text-foreground">No student logins.</strong>{' '}
          Children do not have accounts.
        </p>
        <p>
          <strong className="text-foreground">No diagnosis.</strong> It suggests
          classroom strategies. It is not a clinical tool and does not pretend
          to assess anybody.{' '}
          <Link to="/security" className="text-primary hover:underline">
            How the data is protected →
          </Link>
        </p>
      </NotThis>

      <NextStep
        heading="Want to see it working?"
        body="Tell us which of these matters most to your school and we will show you that part first."
        to="/enquiry"
        label="Talk to us"
      />
    </PublicLayout>
  )
}
