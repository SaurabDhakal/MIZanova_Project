import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchPeopleAtSchool,
  fetchSchool,
  queryKeys,
  type PersonRow,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import InviteStaffSection from '../../components/InviteStaffSection'
import PageHeader from '../../components/PageHeader'
import SchoolBadge from '../../components/SchoolBadge'

/**
 * One school's people — the platform-admin drill-down from Schools.
 *
 * GROUPED BY WHAT SOMEBODY IS TO THIS SCHOOL, because that is the question
 * being asked. A flat alphabetical list of thirty names answers "who is here";
 * a platform admin opening a school wants "who runs it, who teaches, who
 * treats, and whose children are these".
 *
 * STAFF COME FROM MEMBERSHIPS. `profiles.school_id` is where somebody is
 * working right now (db/039), so a specialist holding three memberships would
 * show at one school and be missing from the other two — and this is the one
 * screen where that would be read as fact about the school rather than about
 * the person's current session.
 *
 * THE ROLE SHOWN IS THE ROLE HELD HERE. Somebody may be a specialist at this
 * school and a parent at another; their profile row says whichever they are
 * acting as. The membership says what they are to this school.
 */

const GROUPS: { role: PersonRow['role']; heading: string; blurb: string }[] = [
  {
    role: 'school_admin',
    heading: 'Administrators',
    blurb: 'They invite staff, link guardians and see the safeguarding queue.',
  },
  {
    role: 'educator',
    heading: 'Teachers',
    blurb: 'They reach a child through an assignment, not through employment.',
  },
  {
    role: 'specialist',
    heading: 'Specialists',
    blurb:
      'Engaged by this school. Whether Special Miles vetted them is shown in the school’s own directory.',
  },
  {
    role: 'parent',
    heading: 'Parents',
    blurb:
      'Here because a child of theirs is, not because they belong to the school.',
  },
]

/*
 * A teacher at a real school carries a class, not a handful. The demo school
 * gave one educator thirty-two children and the row printed all of them in a
 * single wrapping paragraph, six lines deep, which pushed everyone below it off
 * the screen and told the reader nothing they wanted.
 *
 * The question this screen is being asked is "how big is this person's load",
 * with a few names as evidence — so the COUNT leads and the names follow. It is
 * also thirty-two children's names in one paragraph on a screen belonging to
 * staff who are not part of their care team, and fewer of those is better.
 */
const NAMES_SHOWN = 6

function NameList({ label, names }: { label: string; names: string[] }) {
  const shown = names.slice(0, NAMES_SHOWN)
  const rest = names.length - shown.length

  return (
    <p className="mt-1 text-sm text-muted-foreground">
      {label} <span className="font-medium text-foreground">{names.length}</span> —{' '}
      <span className="text-foreground">{shown.join(', ')}</span>
      {rest > 0 && <span>, and {rest} more</span>}
    </p>
  )
}

function PersonLine({ person }: { person: PersonRow }) {
  return (
    <li className="rounded-card border border-border bg-card shadow-raised p-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <p className="font-semibold text-foreground">
          {person.full_name || 'Unnamed'}
        </p>
        {person.role !== 'parent' && !person.is_verified && (
          <span className="rounded-btn bg-warning-subtle px-2 py-0.5 text-xs font-semibold text-warning-foreground">
            Awaiting verification
          </span>
        )}
        {person.email && (
          <a
            href={`mailto:${person.email}`}
            className="ml-auto text-sm text-primary hover:underline"
          >
            {person.email}
          </a>
        )}
      </div>

      {person.children.length > 0 && (
        <NameList label="Guardian of" names={person.children.map((c) => c.display_name)} />
      )}
      {person.caseload.length > 0 && (
        <NameList label="Works with" names={person.caseload.map((c) => c.display_name)} />
      )}
    </li>
  )
}

export default function SchoolPeople() {
  const { schoolId = '' } = useParams()

  /*
   * ONE SCHOOL, ASKED FOR BY ID. This used to read every school in the product
   * and `find` the one it wanted, which is wasteful at four schools and broken
   * in a way that does not look broken: `find` returns undefined for a school
   * that does not exist AND for a list that never arrived.
   *
   * The page rendered `{school && <InviteStaffSection/>}`, so a failed schools
   * query produced a page that looked complete — staff listed, heading reading
   * "This school" — with the invite section simply absent. That section is the
   * only way to give a school its first administrator, and a school without one
   * cannot invite anybody itself. The one control that breaks the circle
   * disappeared, and nothing said so.
   */
  const school = useQuery({
    queryKey: queryKeys.school(schoolId),
    queryFn: () => fetchSchool(schoolId),
    enabled: Boolean(schoolId),
  })
  const people = useQuery({
    queryKey: queryKeys.peopleAtSchool(schoolId),
    queryFn: () => fetchPeopleAtSchool(schoolId),
    enabled: Boolean(schoolId),
  })

  return (
    <div>
      <Link
        to="/platform-admin/tenants"
        className="text-sm font-semibold text-primary hover:underline"
      >
        ← All schools
      </Link>

      {/* The school's own query gets its own loading, error and missing states.
          Folding it into the people query would put the two back in the same
          place the bug came from. */}
      {school.isPending && <LoadingCards count={1} />}

      {school.isError && (
        <ErrorState
          message={school.error.message}
          onRetry={() => void school.refetch()}
        />
      )}

      {/* A real answer, and a different one from a failed read. Somebody
          following a stale link needs to be told the school is gone, not shown
          an unnamed page with staff on it. */}
      {school.isSuccess && !school.data && (
        <EmptyState
          title="No such school"
          detail="It may have been deleted, or the link may be out of date. Everything Special Miles manages is on the Schools page."
        />
      )}

      {school.data && (
        <div className="mt-3 flex items-start gap-4">
          <SchoolBadge
            id={school.data.id}
            name={school.data.name}
            size="lg"
            className="mt-1"
          />
          <PageHeader
            title={school.data.name}
            lead={
              school.data.suburb && school.data.state
                ? `${school.data.suburb}, ${school.data.state} — everyone connected to it.`
                : 'Everyone connected to it.'
            }
          />
        </div>
      )}

      {/*
        EVERYTHING BELOW BELONGS TO A SCHOOL THAT EXISTS. Gated as one block
        rather than condition by condition, because the first attempt gated only
        the loading state and a made-up school id then showed "No such school"
        directly above "Nobody here yet" — two empty states disagreeing about
        whether the school is real.

        The people query still runs in parallel rather than waiting for this one.
        Chaining them would make the common case two round trips deep to save a
        request nobody notices.
      */}
      {school.data && (
        <>
          {people.isPending && <LoadingCards count={4} />}

          {people.isError && (
            <ErrorState
              message={people.error.message}
              onRetry={() => void people.refetch()}
            />
          )}

          {people.isSuccess && people.data.length === 0 && (
            <EmptyState
              title="Nobody here yet"
              detail="Staff appear once they accept an invitation. Parents appear once a child of theirs is linked."
            />
          )}

          {people.isSuccess &&
            people.data.length > 0 &&
            GROUPS.map((group) => {
              const members = people.data.filter((p) => p.role === group.role)
              if (members.length === 0) return null

              return (
                <section key={group.role} className="mb-8">
                  <h2 className="text-lg font-semibold text-foreground">
                    {group.heading}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({members.length})
                    </span>
                  </h2>
                  <p className="mt-0.5 mb-3 text-sm text-muted-foreground">
                    {group.blurb}
                  </p>
                  <ul className="space-y-3">
                    {members.map((person) => (
                      <PersonLine key={person.id} person={person} />
                    ))}
                  </ul>
                </section>
              )
            })}

          {/* THE STEP THAT WAS MISSING ENTIRELY. A school administrator is
              invited by a school administrator, so a school with none could
              never get its first one — the only way in was SQL. This is where
              Special Miles breaks that circle. */}
          <InviteStaffSection
            schoolId={school.data.id}
            schoolName={school.data.name}
          />

          <p className="mt-6 max-w-prose text-xs text-muted-foreground">
            Staff are listed by their membership of this school rather than by
            the school they are currently working in, so somebody who works
            across several appears at each. Parents are listed through the
            children that connect them.
          </p>
        </>
      )}
    </div>
  )
}
