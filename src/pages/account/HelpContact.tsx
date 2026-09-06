import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import Icon from '../../components/Icon'
import NotBuiltYet from '../../components/NotBuiltYet'

/**
 * Help and contact, inside Settings — where people look when they are stuck.
 *
 * ---------------------------------------------------------------------------
 * IT WAS ONLY IN THE ACCOUNT DROPDOWN
 * ---------------------------------------------------------------------------
 * `/help` is a real 4,000-word page and it was reachable from one place once
 * signed in: an item in the avatar menu. That menu is where people go to sign
 * out. Settings is where they go when something is wrong with their account,
 * and Settings had Account, Security, and — for one role — School.
 *
 * ---------------------------------------------------------------------------
 * AND THE CONTACT ROUTE WAS A SALES FORM
 * ---------------------------------------------------------------------------
 * Worth writing down, because the menu item is called "Help and contact" and
 * the contact half did not work for everybody. `/help` ends with "Not answered
 * here? — Ask us", which goes to `/enquiry`: a form asking for an organisation
 * name, your role there, and roughly how many children you have.
 *
 * That is the right form for a school or a family looking at plans, and db/045
 * even refuses a school enquiry with no organisation name. It is the wrong
 * form for somebody who already has an account and a problem with it, and a
 * dead end for an individual, who has no organisation and no children to
 * count.
 *
 * So this page routes by what the person actually is, and where there is no
 * route it says so rather than sending them somewhere that will ask them
 * questions they cannot answer.
 */
export default function HelpContact() {
  const { profile } = useAuth()
  const role = profile?.role
  const inASchool = Boolean(profile?.school_id)

  return (
    <div>
      <section className="rounded-card border border-border bg-card p-6 shadow-raised">
        <div className="flex items-start gap-3">
          <Icon name="hand" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground">
              Questions people actually arrive with
            </h2>
            <p className="mt-1 max-w-prose text-muted-foreground">
              What MiZanova does with what you write, who can see it, what the
              AI will not do, and how to get your data out or close your
              account. It opens outside Settings.
            </p>
            <Link
              to="/help"
              className="mt-4 inline-block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
            >
              Read the help page
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-card border border-border bg-card p-6 shadow-raised">
        <h2 className="text-lg font-bold text-foreground">Reaching a person</h2>

        {/* ------------------------------------------------------------------
            SOMEBODY AT A SCHOOL HAS SOMEBODY, AND IT IS NOT SPECIAL MILES.
            A teacher's account, their students and their permissions are all
            administered by their own school admin, who can actually change
            them. Sending them to the vendor first would add a hop to every
            question and land most of them back where they started.
            ------------------------------------------------------------------ */}
        {inASchool && (
          <p className="mt-1 max-w-prose text-muted-foreground">
            For anything about your account, your access or the people and
            children on it, ask <b className="text-foreground">your school's
            MiZanova administrator</b> first. They can change those things;
            Special Miles cannot do it for them.
          </p>
        )}

        {role === 'parent' && (
          <p className="mt-3 max-w-prose text-muted-foreground">
            For anything about your child &mdash; their plan, their goals, what
            the school has recorded &mdash; the school is the only place that
            can answer. MiZanova shows you what they have shared and cannot add
            to it.
          </p>
        )}

        {/* Talking to Special Miles about buying, which is what /enquiry is
            genuinely for. Offered only to the people the form fits. */}
        {(role === 'school_admin' || role === 'platform_admin' || !profile) && (
          <p className="mt-3 max-w-prose text-muted-foreground">
            To talk to Special Miles about your organisation &mdash; plans,
            adding a site, anything commercial &mdash;{' '}
            <Link
              to="/enquiry"
              className="font-semibold text-primary hover:underline"
            >
              send an enquiry
            </Link>
            . It asks for your organisation and roughly how many children, and
            somebody reads and replies personally.
          </p>
        )}

        {role === 'individual' && (
          <>
            <p className="mt-1 max-w-prose text-muted-foreground">
              There is no school behind this account and nobody administering it
              but you, so there is nobody in MiZanova to escalate to. The help
              page answers most of what comes up.
            </p>
            <p className="mt-3 max-w-prose text-muted-foreground">
              If what you want is to talk something through with a person, you
              can{' '}
              <Link
                to="/individual/book"
                className="font-semibold text-primary hover:underline"
              >
                ask a verified specialist for a session
              </Link>
              . That is a conversation about you rather than about the software,
              and there is nothing to pay.
            </p>
          </>
        )}
      </section>

      {/* ------------------------------------------------------------------
          THE GAP, NAMED. Every other "what this does not do yet" note in this
          product exists because stating an absence plainly beats a control
          that does nothing — and this is the absence somebody hits at the
          worst moment, when something has gone wrong with money.
          ------------------------------------------------------------------ */}
      <NotBuiltYet>
        <p>
          There is no support inbox. Special Miles has not published an address
          for questions about an existing account, so MiZanova does not print
          one &mdash; a contact address that nobody is reading is worse than
          none, because it looks like an answer.
        </p>
        <p>
          This matters most for money. A receipt says to quote its number to
          Special Miles, and until there is an address to quote it to, that has
          to go through whoever you already deal with there.
        </p>
      </NotBuiltYet>
    </div>
  )
}
