import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchPeopleAtSchool,
  fetchSchools,
  queryKeys,
  type PersonRow,
} from '../../lib/api'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import InviteStaffSection from '../../components/InviteStaffSection'

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
        <p className="mt-1 text-sm text-muted-foreground">
          Guardian of{' '}
          <span className="text-foreground">
            {person.children.map((c) => c.display_name).join(', ')}
          </span>
        </p>
      )}
      {person.caseload.length > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">
          Works with{' '}
          <span className="text-foreground">
            {person.caseload.map((c) => c.display_name).join(', ')}
          </span>
        </p>
      )}
    </li>
  )
}

export default function SchoolPeople() {
  const { schoolId = '' } = useParams()

  const schools = useQuery({ queryKey: queryKeys.schools, queryFn: fetchSchools })
  const people = useQuery({
    queryKey: queryKeys.peopleAtSchool(schoolId),
    queryFn: () => fetchPeopleAtSchool(schoolId),
    enabled: Boolean(schoolId),
  })

  const school = schools.data?.find((s) => s.id === schoolId)

  return (
    <div>
      <Link
        to="/platform-admin/tenants"
        className="text-sm font-semibold text-primary hover:underline"
      >
        ← All schools
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="text-title text-foreground">
          {school?.name ?? 'This school'}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {school?.suburb && school?.state
            ? `${school.suburb}, ${school.state} — everyone connected to it.`
            : 'Everyone connected to it.'}
        </p>
      </header>

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

      {/* THE STEP THAT WAS MISSING ENTIRELY. A school administrator is invited
          by a school administrator, so a school with none could never get its
          first one — the only way in was SQL. This is where Special Miles
          breaks that circle. */}
      {school && (
        <InviteStaffSection schoolId={school.id} schoolName={school.name} />
      )}

      <p className="mt-6 max-w-prose text-xs text-muted-foreground">
        Staff are listed by their membership of this school rather than by the
        school they are currently working in, so somebody who works across
        several appears at each. Parents are listed through the children that
        connect them.
      </p>
    </div>
  )
}
