import { useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchSchoolPeoplePage,
  fetchStaffVetting,
  queryKeys,
  type PersonRow,
} from '../../lib/api'
import { useDebounced } from '../../hooks/useDebounced'
import Pagination from '../../components/Pagination'
import { ROLE_CONFIG } from '../../lib/roles'
import { useAuth } from '../../lib/auth'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'

/**
 * Everyone connected to this school, on one page.
 *
 * WHY IT IS SEPARATE FROM DIRECTORY & ACCESS. That screen is for DOING things
 * — inviting staff, linking a guardian, assigning a caseload. This one is for
 * ANSWERING things: who is this person, what are they to us, and what are they
 * connected to. Mixing them produced a page where the list of people was a
 * side effect of the controls that operated on it, and parents were absent
 * entirely because no control needed them listed.
 *
 * PARENTS ARE HERE BECAUSE OF db/052. Until that script a school administrator
 * could see only parents whose profile happened to carry the school's id — one
 * in three on the real database. A parent belongs to a child, not to a school,
 * so they appear here through the children that make them visible, and each
 * row says which child that is. A parent listed with no reason attached would
 * be a name from nowhere.
 *
 * SEARCHED AND PAGED BY THE DATABASE. The first version fetched everybody and
 * filtered in the browser, which is right only while everybody fits in one
 * response — and PostgREST stops at a thousand rows without saying so. A
 * six-hundred-student school has roughly eight hundred parents, so this page
 * would have rendered a subset and looked complete.
 *
 * NO COMPLIANCE SCORE, NO LAST-SEEN, NO ACTIVITY COUNT. Every one of those is
 * a number this system does not hold, and inventing them is how a directory
 * becomes a thing people make decisions from. What is here is what is true:
 * role, verification, vetting where it applies, and the children each person
 * is connected to.
 */

type Filter = 'all' | 'staff' | 'parents'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'staff', label: 'Staff' },
  { value: 'parents', label: 'Parents' },
]

const ROLE_STYLE: Record<string, string> = {
  school_admin: 'bg-primary-subtle text-primary',
  educator: 'bg-primary-subtle text-primary',
  specialist: 'bg-warning-subtle text-warning-foreground',
  parent: 'bg-success-subtle text-success-foreground',
}

function PersonCard({
  person,
  vetting,
}: {
  person: PersonRow
  vetting: { data: Record<string, string> | undefined; isError: boolean }
}) {
  const isStaff = person.role !== 'parent'

  return (
    <li className="rounded-card border border-border bg-card shadow-raised p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-bold text-foreground">
          {person.full_name || 'Unnamed'}
        </h3>
        <span
          className={`rounded-btn px-2.5 py-0.5 text-xs font-semibold ${ROLE_STYLE[person.role] ?? 'bg-background text-muted-foreground'}`}
        >
          {ROLE_CONFIG[person.role].label}
        </span>

        {/* Verification is a statement about staff. A parent is not verified
            by anybody — they hold a code for a specific child, which is a
            different kind of proof and is shown as the children below. */}
        {isStaff &&
          (person.is_verified ? (
            <span className="rounded-btn bg-success-subtle px-2.5 py-0.5 text-xs font-semibold text-success-foreground">
              ✓ Verified
            </span>
          ) : (
            <span className="rounded-btn bg-warning-subtle px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">
              Awaiting verification
            </span>
          ))}

        {/* Who checked them — db/049. Only for specialists, and only when the
            query answered: absent vetting must mean "not on the network",
            never "we could not ask". */}
        {person.role === 'specialist' && vetting.data && (
          <span
            className={`rounded-btn px-2.5 py-0.5 text-xs font-semibold ${
              vetting.data[person.id]
                ? 'bg-primary-subtle text-primary'
                : 'bg-background text-muted-foreground'
            }`}
          >
            {vetting.data[person.id]
              ? 'Network specialist'
              : 'Invited by your school'}
          </span>
        )}
        {person.role === 'specialist' && vetting.isError && (
          <span className="rounded-btn bg-warning-subtle px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">
            Vetting unknown
          </span>
        )}
      </div>

      {person.email && (
        <p className="mt-1 text-sm">
          <a
            href={`mailto:${person.email}`}
            className="text-primary hover:underline"
          >
            {person.email}
          </a>
        </p>
      )}

      {/* --- what connects them to this school -------------------------- */}
      {person.role === 'parent' && (
        <p className="mt-3 text-sm text-foreground">
          {person.children.length > 0 ? (
            <>
              <span className="text-muted-foreground">Guardian of </span>
              {person.children.map((child, i) => (
                <span key={child.id}>
                  {i > 0 && ', '}
                  <strong className="font-semibold">{child.display_name}</strong>
                  <span className="text-muted-foreground">
                    {' '}
                    ({child.relationship})
                  </span>
                </span>
              ))}
            </>
          ) : (
            /* Should not happen after db/052 — a parent is visible to this
               school BECAUSE of a child. If it does, saying so is better than
               an empty space that reads as "no children". */
            <span className="text-muted-foreground">
              No child at this school is linked to them, which is unexpected —
              they may have been unlinked.
            </span>
          )}
        </p>
      )}

      {isStaff && (
        <p className="mt-3 text-sm text-foreground">
          {person.caseload.length > 0 ? (
            <>
              <span className="text-muted-foreground">Works with </span>
              {person.caseload.map((student, i) => (
                <span key={student.id}>
                  {i > 0 && ', '}
                  <strong className="font-semibold">
                    {student.display_name}
                  </strong>
                </span>
              ))}
            </>
          ) : (
            <span className="text-muted-foreground">
              {person.role === 'school_admin'
                ? 'Administers the school. Not assigned to individual students.'
                : 'No students assigned yet — assign them in Directory & Access.'}
            </span>
          )}
        </p>
      )}
    </li>
  )
}

export default function People() {
  const { profile } = useAuth()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)

  // One query per keystroke would be ten thrown away for every "Parramatta",
  // and the answers can arrive out of order.
  const term = useDebounced(search)

  const people = useQuery({
    queryKey: queryKeys.schoolPeoplePage(term, filter, page),
    queryFn: () => fetchSchoolPeoplePage({ search: term, group: filter, page }),
    // The old page stays on screen while the next one loads, so paging does
    // not blank the list and jump the scroll position.
    placeholderData: keepPreviousData,
  })

  const vetting = useQuery({
    queryKey: queryKeys.staffVetting,
    queryFn: fetchStaffVetting,
  })

  const verified = profile?.is_verified === true

  /** Changing what is being looked for must start at the first page of it. */
  const changeFilter = (next: Filter) => {
    setFilter(next)
    setPage(0)
  }
  const changeSearch = (next: string) => {
    setSearch(next)
    setPage(0)
  }

  const visible = people.data?.rows ?? []

  return (
    <div>
      <header className="mb-6">
        <h1 ref={heading} tabIndex={-1} className="text-title text-foreground">
          People
        </h1>
        <p className="mt-1 text-muted-foreground">
          Everyone connected to your school — staff, and the parents of your
          students. To invite, assign or link somebody, use Directory &amp;
          Access.
        </p>
      </header>

      {!verified && (
        <p
          role="alert"
          className="mb-6 rounded-card border border-warning bg-warning-subtle p-4 text-sm text-warning-foreground"
        >
          Your own account is not verified yet, so some of this is hidden from
          you by the database rather than by this page.
        </p>
      )}

      <fieldset className="mb-4">
        <legend className="sr-only">Show</legend>
        <div className="inline-flex flex-wrap rounded-btn border border-border bg-card p-1">
          {FILTERS.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-btn px-4 py-2 text-sm font-semibold ${
                filter === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground'
              }`}
            >
              <input
                type="radio"
                name="people-filter"
                value={option.value}
                checked={filter === option.value}
                onChange={() => changeFilter(option.value)}
                className="sr-only"
              />
              {option.label}
              {/* Only the tab in view carries a number, and it is the total
                  from the database rather than the length of this page.
                  Counting the other two would be two more exact counts per
                  keystroke to answer a question nobody has asked yet — and a
                  guess from the rows on screen would be wrong the moment there
                  is a second page. */}
              {filter === option.value && people.isSuccess && (
                <span className="ml-2 text-xs opacity-80">
                  {people.data.total}
                </span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="people-search" className="sr-only">
        Search people
      </label>
      <input
        id="people-search"
        type="search"
        value={search}
        onChange={(e) => changeSearch(e.target.value)}
        placeholder="Search by name, email or role…"
        className="mb-6 w-full max-w-md rounded-btn border border-border bg-card px-3 py-2.5 text-foreground placeholder:text-muted-foreground"
      />

      {people.isPending && <LoadingCards count={4} />}
      {people.isError && (
        <ErrorState
          message={people.error.message}
          onRetry={() => void people.refetch()}
        />
      )}

      {people.isSuccess && visible.length === 0 && (
        <EmptyState
          title={search.trim() ? 'Nobody matches that' : 'Nobody here yet'}
          detail={
            search.trim()
              ? 'Try a different name, or clear the search.'
              : 'Staff appear once they accept an invitation. Parents appear once a child of theirs is linked.'
          }
        />
      )}

      {visible.length > 0 && (
        <>
          <ul className="space-y-4">
            {visible.map((person) => (
              <PersonCard key={person.id} person={person} vetting={vetting} />
            ))}
          </ul>

          {people.data && (
            <Pagination
              page={people.data}
              onChange={setPage}
              label="people"
              anchor={heading}
              busy={people.isPlaceholderData}
            />
          )}
        </>
      )}

      <p className="mt-6 max-w-prose text-xs text-muted-foreground">
        Parents appear here because a child of theirs is at your school, not
        because they belong to it — which is why each one names the child that
        connects them. Nothing on this page is a score or an activity count:
        everything shown is a fact the system actually holds.
      </p>
    </div>
  )
}
