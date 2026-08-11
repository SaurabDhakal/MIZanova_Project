import { Link } from 'react-router-dom'

/**
 * What a family account looks like before a child is linked to it.
 *
 * WHAT THIS REPLACED. Six screens each said a version of "a school
 * administrator connects your account to your child" — passive, addressed to
 * nobody, and describing something the reader cannot cause. Meanwhile "Link a
 * child" sat in their own sidebar, unmentioned. Somebody who had just signed up
 * saw a dead dashboard and no way forward, which is the confusion that prompted
 * doc 12.
 *
 * A first screen has one job: say what to do next. This one does, and says who
 * to ask when the answer is "wait for somebody else".
 *
 * ONE COMPONENT, SIX SCREENS. Six copies of the same paragraph drift, and the
 * one that matters most — the dashboard, which is where a new account lands —
 * is not the one anybody remembers to update.
 *
 * NO MENTION OF COURSES OR PROGRAMS, deliberately, and this departs from what
 * `12-Who-Lets-Whom-In.md` §5 suggested. The Academy does not exist yet, and
 * this project's standing rule is that a promise on a screen is broken every
 * time somebody acts on it. "Programs are coming" is marketing that would sit
 * here unchanged for a year. When there is something to enrol in, this is the
 * right place to say so.
 */
export default function NoChildYet({
  /** What this particular screen would have shown. Keeps each page specific. */
  thing,
}: {
  thing: string
}) {
  return (
    <div className="mx-auto max-w-xl rounded-card border border-border bg-card shadow-raised p-8">
      <h2 className="text-lg font-semibold text-foreground">
        Your account is set up. No child is linked to it yet.
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {thing} will appear here as soon as one is.
      </p>

      <div className="mt-5 rounded-btn bg-background p-4">
        <p className="text-sm font-semibold text-foreground">
          If the school has given you a code
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          It looks like <span className="font-mono">K7QP-4M2X-9RTB</span> and
          arrives by email or from the school office. Entering it once connects
          you to your child.
        </p>
        <Link
          to="/parent/link-child"
          className="mt-3 inline-block rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground"
        >
          Link a child
        </Link>
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        <strong className="font-medium text-foreground">
          If you do not have a code,
        </strong>{' '}
        ask your child&rsquo;s school office for one. Only the school can create
        it, and they can only send it to the address they hold for you — which
        is what stops somebody else reaching your child&rsquo;s record.
      </p>
    </div>
  )
}
